const { google } = require('googleapis')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')

/**
 * 이메일 발송(교사 → 학생) — Gmail API 도메인 위임.
 *
 * workspaceSync.js와 같은 서비스계정(workspace-sync-key)의 도메인 전체 위임을
 * 재사용하되, subject(impersonate 대상)를 Workspace 관리자가 아니라 "발송하는 교사
 * 본인의 이메일"로 준다 — 그래야 요구사항대로 실제 발신자가 로그인한 계정이 된다.
 * 이 위임이 동작하려면 Google Workspace 관리자 콘솔에서 이 서비스계정 클라이언트 ID에
 * https://www.googleapis.com/auth/gmail.send 스코프를 별도로 승인해야 한다(코드 밖
 * 운영 작업 — 계획 문서 참고).
 *
 * 흐름: 클라이언트가 schools/{schoolId}/emailJobs/{jobId} 문서를 직접 생성한다.
 *   - 즉시 발송: status:'queued'로 만든다 → 아래 onEmailJobWrite가 바로 집어간다.
 *   - 예약 발송: status:'scheduled' + scheduledAt으로 만든다 → promoteScheduledEmailJobs가
 *     예정 시각이 되면 status를 'queued'로 바꿔치기하고, 그 update가 다시
 *     onEmailJobWrite를 깨운다.
 * onCreate가 아니라 onWrite를 쓰는 이유가 이것이다 — "문서가 방금 생성됐을 때"가 아니라
 * "문서의 status가 queued가 됐을 때"(생성이든 나중의 업데이트든)를 잡아야 예약 발송과
 * 즉시 발송을 같은 처리 경로로 묶을 수 있다. 콜러블 하나로 수백 명을 동기 처리하면
 * 타임아웃·UX 문제가 생기므로, 문서 생성과 실제 발송을 분리했다(onSnapshot으로 실시간
 * 진행률을 보여줄 수 있는 것은 덤).
 *
 * 자기 자신을 재호출하는 것처럼 보이는 구조(발송 루프 중의 진행률 ref.update()도
 * onWrite를 다시 깨운다)지만 안전하다 — status가 'queued'일 때만 처리를 시작하고
 * 맨 먼저 'sending'으로 바꿔버리므로, 진행률 갱신이 유발한 재호출은 매번 이 가드에서
 * 곧바로 반환된다.
 */

const SECRET_NAME = 'projects/seonyoo-system/secrets/workspace-sync-key/versions/latest'
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send']

const secretClient = new SecretManagerServiceClient()
let cachedKey = null

async function getServiceAccountKey() {
  if (cachedKey) return cachedKey
  const [version] = await secretClient.accessSecretVersion({ name: SECRET_NAME })
  cachedKey = JSON.parse(version.payload.data.toString('utf8'))
  return cachedKey
}

async function getGmailClient(subject) {
  const key = await getServiceAccountKey()
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: GMAIL_SCOPES,
    subject,
  })
  await auth.authorize()
  return google.gmail({ version: 'v1', auth })
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ⚠ apps/shared/lib/emailTemplate.js의 buildEmailHtml()과 반드시 같은 결과를 내야 한다.
// Cloud Functions는 별도 npm 패키지라 그 모듈을 import할 수 없어 손으로 복제했다 —
// 브랜딩 템플릿을 고치면 두 파일을 함께 고칠 것.
function buildEmailHtml(schoolName, bodyHtml) {
  const school = escapeHtml(schoolName || '')

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="max-width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:'Malgun Gothic','맑은 고딕',sans-serif;">
          <tr>
            <td style="background:#1e293b;color:#ffffff;padding:20px 28px;">
              <div style="font-size:18px;font-weight:700;">${school}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.7;color:#1f2937;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:11px;">
              본 메일은 ${school}에서 발송되었습니다.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** 헤더의 사람 이름(한글 포함)은 RFC 2047 encoded-word로 감싸야 메일 클라이언트가 깨지지 않는다. */
function encodeHeaderWord(text) {
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
}

function buildRawMime({ fromEmail, fromName, toEmail, toName, subject, html, text }) {
  const boundary = `bnd_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const raw = [
    `From: ${encodeHeaderWord(fromName)} <${fromEmail}>`,
    `To: ${encodeHeaderWord(toName)} <${toEmail}>`,
    `Subject: ${encodeHeaderWord(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`,
  ].join('\r\n')

  return Buffer.from(raw).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const isRetryable = (err) => [429, 500, 502, 503].includes(err?.code || err?.response?.status)

// 학생 1명당 1건씩 순차 발송하는 사이 간격. Gmail API는 사용자당 초당 약 250 쿼터
// 유닛을 주고 messages.send가 100유닛을 쓰므로, 350ms(초당 약 2.8건)는 그 상한 안의
// 보수적인 값이다. 300명 발송에 약 1분 45초 — timeoutSeconds(540초) 안에서 1,500명까지 안전.
const SEND_INTERVAL_MS = 350

exports.onEmailJobWrite = onDocumentWritten(
  {
    document: 'schools/{schoolId}/emailJobs/{jobId}',
    region: 'asia-northeast3',
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async (event) => {
    const after = event.data.after
    if (!after?.exists) return // 삭제된 경우
    if (after.data().status !== 'queued') return // 예약 대기 중·발송 중·완료·취소 — 처리 대상 아님

    const ref = after.ref

    // 여러 write가 겹쳐 이 함수가 동시에 여러 번 불려도, 실제로 발송을 시작하는 것은
    // 최초 한 번뿐이어야 한다 — fresh 재조회 직후 곧바로 'sending'으로 바꿔 그 창을 좁힌다.
    const fresh = await ref.get()
    const job = fresh.data()
    if (job?.status !== 'queued') return

    await ref.update({ status: 'sending', startedAt: FieldValue.serverTimestamp() })

    let gmail
    try {
      gmail = await getGmailClient(job.senderEmail)
    } catch (err) {
      console.error(`[emailJobs/${ref.id}] Gmail 클라이언트 생성 실패:`, err.message)
      await ref.update({
        status: 'failed',
        failReason: `발송 권한을 확인하지 못했습니다: ${err.message}`,
        completedAt: FieldValue.serverTimestamp(),
      })
      return
    }

    const html = buildEmailHtml(job.schoolName, job.bodyHtml)
    const fromName = `${job.schoolName} · ${job.senderName}`

    const recipients = [...job.recipients]
    let sent = 0
    let failed = 0
    let lastFlush = Date.now()

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      let attempt = 0

      while (true) {
        try {
          const raw = buildRawMime({
            fromEmail: job.senderEmail,
            fromName,
            toEmail: r.email,
            toName: r.name,
            subject: job.subject,
            html,
            text: job.bodyText,
          })
          const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
          recipients[i] = { ...r, status: 'sent', sentAt: Timestamp.now(), gmailMessageId: res.data.id, error: null }
          sent++
          break
        } catch (err) {
          if (isRetryable(err) && attempt < 2) {
            attempt++
            await sleep(500 * attempt)
            continue
          }
          recipients[i] = { ...r, status: 'failed', error: (err.message || '발송 실패').slice(0, 300) }
          failed++
          break
        }
      }

      // 수신자끼리 이메일 주소가 노출되지 않도록 1명당 1건씩 순차 발송 + 초당 발송 상한 보호.
      if (i < recipients.length - 1) await sleep(SEND_INTERVAL_MS)

      const isLast = i === recipients.length - 1
      if (isLast || (i + 1) % 10 === 0 || Date.now() - lastFlush > 2000) {
        await ref.update({ recipients, counts: { total: recipients.length, sent, failed } })
        lastFlush = Date.now()
      }
    }

    const status = failed === 0 ? 'done' : (sent === 0 ? 'failed' : 'done_with_errors')
    await ref.update({ status, completedAt: FieldValue.serverTimestamp() })
  }
)

// ── 예약 발송 — 예정 시각이 된 emailJobs를 'queued'로 승격 ──────────────────
//
// 매분 모든 학교의 emailJobs를 collectionGroup으로 훑어 status:'scheduled'이면서
// scheduledAt이 지난 문서만 골라 status를 'queued'로 바꾼다. 그 update 자체가
// onEmailJobWrite를 깨워 실제 발송을 시작시키므로, 이 함수는 "시간이 됐는지"만 본다.
exports.promoteScheduledEmailJobs = onSchedule(
  { schedule: '*/1 * * * *', timeZone: 'Asia/Seoul', region: 'asia-northeast3', timeoutSeconds: 120 },
  async () => {
    const db = getFirestore()
    const dueSnap = await db.collectionGroup('emailJobs')
      .where('status', '==', 'scheduled')
      .where('scheduledAt', '<=', Timestamp.now())
      .get()

    if (dueSnap.empty) return

    const batch = db.batch()
    dueSnap.docs.forEach(doc => batch.update(doc.ref, { status: 'queued' }))
    await batch.commit()
    console.log(`[emailJobs] 예약 발송 ${dueSnap.size}건을 큐에 올렸습니다.`)
  }
)
