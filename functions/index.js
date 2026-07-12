const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const { defineString } = require('firebase-functions/params')

initializeApp()
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 })

const SUPER_ADMIN_EMAIL = defineString('SUPER_ADMIN_EMAIL')

/**
 * superAdmin Custom Claims 초기 부여 (1회 실행용)
 *
 * 호출 조건: 로그인 상태 + .env에 설정된 SUPER_ADMIN_EMAIL 과 일치
 * 이후 firestore.rules의 isSuperAdmin()은 request.auth.token.superAdmin == true 로 동작
 */
exports.bootstrapSuperAdmin = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

    const allowedEmail = SUPER_ADMIN_EMAIL.value()
    if (request.auth.token.email !== allowedEmail) {
      throw new HttpsError('permission-denied', '권한이 없습니다.')
    }

    await getAuth().setCustomUserClaims(request.auth.uid, { superAdmin: true })
    return { success: true }
  }
)

/**
 * 5분마다 실행 — 종료 시간이 지난 이벤트의 미출석 학생을 자동 결석 처리
 *
 * 처리 조건:
 *  - 단일 이벤트: endTime 경과
 *  - 반복 이벤트: 오늘이 반복 요일 + 오늘 recurringTimeEnd 경과 + recurringEndDate 이내
 *
 * 중복 방지: attendLogId / absentLogId 가 이미 존재하면 skip
 * liveOpenedAt 이 설정된 이벤트는 autoManageLiveSessions 에서 처리하므로 skip
 */
exports.autoCloseAttendance = onSchedule(
  { schedule: 'every 5 minutes', region: 'asia-northeast3' },
  async () => {
    const db = getFirestore()
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)   // "2026-04-08"
    const todayDay = now.getDay()                      // 0=일 ... 6=토

    const schoolsSnap = await db.collection('schools').get()

    for (const schoolDoc of schoolsSnap.docs) {
      const schoolId = schoolDoc.id
      const eventsSnap = await db
        .collection('schools').doc(schoolId)
        .collection('events').get()

      for (const eventDoc of eventsSnap.docs) {
        const ev = eventDoc.data()

        // 보관함 이벤트 / 그룹 없는 이벤트 제외
        if (ev.archived) continue
        if (!ev.studentGroupId) continue

        // 라이브 세션이 열린 이벤트는 autoManageLiveSessions 에서 처리
        if (ev.liveOpenedAt) continue

        // ── 종료 여부 판단 ──────────────────────────────────────
        let isEnded = false
        let logDatePrefix = null   // 반복 이벤트는 날짜 prefix 사용

        if (ev.isRecurring) {
          // 오늘이 반복 요일인지
          if (!ev.recurringDays?.includes(todayDay)) continue

          // 반복 종료일 지났는지
          const recurEnd = ev.recurringEndDate?.toDate?.() ?? new Date(ev.recurringEndDate)
          if (now > recurEnd) continue

          // 오늘 종료 시간 지났는지
          const [endH, endM] = ev.recurringTimeEnd.split(':').map(Number)
          const todayEnd = new Date(now)
          todayEnd.setHours(endH, endM, 0, 0)

          if (now > todayEnd) {
            isEnded = true
            logDatePrefix = todayStr
          }
        } else {
          const end = ev.endTime?.toDate?.() ?? new Date(ev.endTime)
          if (now > end) isEnded = true
        }

        if (!isEnded) continue

        // ── 학생 그룹 로드 ─────────────────────────────────────
        const groupDoc = await db
          .collection('schools').doc(schoolId)
          .collection('studentGroups').doc(ev.studentGroupId).get()
        if (!groupDoc.exists) continue

        const { studentIds } = groupDoc.data()
        if (!studentIds?.length) continue

        // ── 기존 출결 로그 조회 ────────────────────────────────
        const logsSnap = await db
          .collection('schools').doc(schoolId)
          .collection('events').doc(eventDoc.id)
          .collection('attendanceLogs').get()
        const existingIds = new Set(logsSnap.docs.map(d => d.id))

        // ── 학생 정보 맵 ───────────────────────────────────────
        const studentsSnap = await db
          .collection('schools').doc(schoolId)
          .collection('students').get()
        const studentsMap = {}
        studentsSnap.docs.forEach(d => {
          studentsMap[d.data().studentId] = d.data()
        })

        // ── 미출석자 일괄 결석 처리 ────────────────────────────
        const batch = db.batch()
        let count = 0

        for (const studentId of studentIds) {
          const attendLogId = logDatePrefix
            ? `${logDatePrefix}-${studentId}`
            : studentId
          const absentLogId = logDatePrefix
            ? `${logDatePrefix}-${studentId}-absent`
            : `${studentId}-absent`

          // 이미 출석 or 결석 로그가 있으면 skip
          if (existingIds.has(attendLogId) || existingIds.has(absentLogId)) continue

          const student = studentsMap[studentId]
          if (!student) continue

          const ref = db
            .collection('schools').doc(schoolId)
            .collection('events').doc(eventDoc.id)
            .collection('attendanceLogs').doc(absentLogId)

          batch.set(ref, {
            studentId,
            studentName: student.name,
            grade: student.grade,
            class: student.class,
            number: student.number,
            method: 'absent',
            reason: '미출석 자동처리',
            recordedAt: Timestamp.now(),
            qrToken: ev.qrToken,
          })
          count++
        }

        if (count > 0) {
          await batch.commit()
          console.log(
            `[${schoolId}] 자동결석 ${count}명 처리 — 이벤트: ${eventDoc.id}` +
            (logDatePrefix ? ` (${logDatePrefix})` : '')
          )
        }
      }
    }
  }
)

/**
 * 1분마다 실행 — 라이브 세션 자동 관리
 *
 * liveLateCutoff 도달 시:
 *   - liveToken null (QR 마감)
 *   - lateWindowProcessed: true
 *   - 미출석 학생 → absent 로그 생성 (reason: '1/3 이상 지각 자동처리')
 *
 * liveClosesAt 도달 시:
 *   - 미복귀 외출 자동 마감 (returnAt 기록, 1/3 초과 시 outingOverLimit 기록)
 *   - 세션 필드 전체 초기화 (liveToken, liveOpenedAt, liveLateCutoff, liveClosesAt, lateWindowProcessed)
 */
exports.autoManageLiveSessions = onSchedule(
  { schedule: 'every 1 minutes', region: 'asia-northeast3' },
  async () => {
    const db = getFirestore()
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    const schoolsSnap = await db.collection('schools').get()

    for (const schoolDoc of schoolsSnap.docs) {
      const schoolId = schoolDoc.id
      const eventsSnap = await db
        .collection('schools').doc(schoolId)
        .collection('events').get()

      for (const eventDoc of eventsSnap.docs) {
        const ev = eventDoc.data()
        if (ev.archived || !ev.liveOpenedAt) continue

        const liveLateCutoff = ev.liveLateCutoff?.toDate?.()
        const liveClosesAt = ev.liveClosesAt?.toDate?.()

        // 전날(또는 그 이전) 세션이 남아있으면 즉시 강제 초기화
        // (Cloud Function 오류 등으로 processSessionClose가 실행되지 못한 경우)
        const openedAt = ev.liveOpenedAt?.toDate?.() ?? new Date(ev.liveOpenedAt)
        const openedDateStr = openedAt.toISOString().slice(0, 10)
        if (openedDateStr < todayStr) {
          console.log(`[${schoolId}] 전날 세션 강제 초기화 — 이벤트: ${eventDoc.id} (세션 날짜: ${openedDateStr})`)
          await processSessionClose(db, schoolId, eventDoc.id, ev)
          continue
        }

        // 1/3 지점 자동 처리 (미처리 + 시간 경과)
        if (!ev.lateWindowProcessed && liveLateCutoff && now >= liveLateCutoff) {
          await processLateCutoff(db, schoolId, eventDoc.id, ev)
        }

        // 수업 종료 처리
        if (liveClosesAt && now >= liveClosesAt) {
          await processSessionClose(db, schoolId, eventDoc.id, ev)
        }
      }
    }
  }
)

// ── 1/3 지점 자동 처리 ────────────────────────────────────────────────────────
async function processLateCutoff(db, schoolId, eventId, ev) {
  console.log(`[${schoolId}] 1/3 자동처리 시작 — 이벤트: ${eventId}`)

  // QR 마감 + 1/3 처리 완료 표시
  await db.collection('schools').doc(schoolId)
    .collection('events').doc(eventId)
    .update({ liveToken: null, lateWindowProcessed: true })

  if (!ev.studentGroupId) return

  // 학생 그룹 조회
  const groupDoc = await db.collection('schools').doc(schoolId)
    .collection('studentGroups').doc(ev.studentGroupId).get()
  if (!groupDoc.exists) return

  const { studentIds } = groupDoc.data()
  if (!studentIds?.length) return

  // 현재 출결 로그 조회
  const logsSnap = await db.collection('schools').doc(schoolId)
    .collection('events').doc(eventId)
    .collection('attendanceLogs').get()

  const existingIds = new Set(logsSnap.docs.map(d => d.id))
  const checkedStudentIds = new Set(
    logsSnap.docs
      .filter(d => d.data().method === 'QR' || d.data().method === 'manual')
      .map(d => d.data().studentId)
  )

  // 학생 정보 맵
  const studentsSnap = await db.collection('schools').doc(schoolId)
    .collection('students').get()
  const studentsMap = {}
  studentsSnap.docs.forEach(d => {
    studentsMap[d.data().studentId] = d.data()
  })

  // 반복 이벤트는 오늘 날짜 prefix 사용
  const todayStr = new Date().toISOString().slice(0, 10)
  const isRecurring = ev.isRecurring || false

  const batch = db.batch()
  let count = 0

  for (const studentId of studentIds) {
    if (checkedStudentIds.has(studentId)) continue

    const attendLogId = isRecurring ? `${todayStr}-${studentId}` : studentId
    const absentLogId = isRecurring ? `${todayStr}-${studentId}-absent` : `${studentId}-absent`

    if (existingIds.has(attendLogId) || existingIds.has(absentLogId)) continue

    const student = studentsMap[studentId]
    if (!student) continue

    const ref = db.collection('schools').doc(schoolId)
      .collection('events').doc(eventId)
      .collection('attendanceLogs').doc(absentLogId)

    batch.set(ref, {
      studentId,
      studentName: student.name,
      grade: student.grade,
      class: student.class,
      number: student.number,
      method: 'absent',
      reason: '1/3 이상 지각 자동처리',
      recordedAt: Timestamp.now(),
      qrToken: ev.qrToken,
      lateAutoProcessed: true,
    })
    count++
  }

  if (count > 0) {
    await batch.commit()
    console.log(`[${schoolId}] 1/3 지각 자동결석 ${count}명 처리 — 이벤트: ${eventId}`)
  }
}

// ── 수업 종료 처리 ────────────────────────────────────────────────────────────
async function processSessionClose(db, schoolId, eventId, ev) {
  console.log(`[${schoolId}] 세션 종료 처리 시작 — 이벤트: ${eventId}`)

  const closeAt = Timestamp.now()
  const closeDate = closeAt.toDate()
  const classDuration = ev.classDuration || 50

  // 미복귀 외출 자동 마감
  const logsSnap = await db.collection('schools').doc(schoolId)
    .collection('events').doc(eventId)
    .collection('attendanceLogs').get()

  const batch = db.batch()

  for (const logDoc of logsSnap.docs) {
    const logData = logDoc.data()
    if (logData.method !== 'QR' && logData.method !== 'manual') continue
    if (!logData.outings?.length) continue

    const hasOpenOuting = logData.outings.some(o => !o.returnAt)
    if (!hasOpenOuting) continue

    const updatedOutings = logData.outings.map(o => {
      if (o.returnAt) return o
      return { ...o, returnAt: closeAt }
    })

    // 1/3 초과 여부 계산
    const totalMs = updatedOutings.reduce((sum, o) => {
      const exit = o.exitAt?.toDate?.() ?? new Date(o.exitAt)
      const ret = o.returnAt?.toDate?.() ?? closeDate
      return sum + Math.max(0, ret - exit)
    }, 0)
    const isOver = totalMs > classDuration * 60000 / 3

    const updateData = { outings: updatedOutings }
    if (isOver && !logData.outingOverLimit) {
      updateData.outingOverLimit = true
      updateData.outingWarnedAt = closeAt
    }

    batch.update(logDoc.ref, updateData)
  }

  await batch.commit()

  // 세션 필드 전체 초기화
  await db.collection('schools').doc(schoolId)
    .collection('events').doc(eventId)
    .update({
      liveToken: null,
      liveOpenedAt: null,
      liveLateCutoff: null,
      liveClosesAt: null,
      lateWindowProcessed: null,
    })

  console.log(`[${schoolId}] 세션 종료 완료 — 이벤트: ${eventId}`)
}

// ── 성취평가제 체크리스트 PDF 생성 (Puppeteer) ──────────────────────
exports.generateAsaChecklistPdf = onCall(
  { region: 'asia-northeast3', memory: '1GiB', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

    const { submissionId, schoolId } = request.data
    if (!submissionId || !schoolId) {
      throw new HttpsError('invalid-argument', 'submissionId와 schoolId가 필요합니다.')
    }

    const db = getFirestore()

    // 권한 확인: 관리자 또는 배정 교사 또는 교감
    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    if (!userDoc.exists) throw new HttpsError('permission-denied', '사용자 정보를 찾을 수 없습니다.')
    const userData = userDoc.data()
    if (userData.schoolId !== schoolId) throw new HttpsError('permission-denied', '해당 학교 접근 권한이 없습니다.')

    const submissionDoc = await db
      .collection('schools').doc(schoolId)
      .collection('asaSubmissions').doc(submissionId).get()
    if (!submissionDoc.exists) throw new HttpsError('not-found', '제출물을 찾을 수 없습니다.')

    const submission = submissionDoc.data()
    const userEmail = request.auth.token.email

    const isAdmin = userData.role === 'admin' || userData.role === 'school_admin'
    const isPrincipal = userData.role === 'principal'
    const isAssigned = submission.teacherEmails?.includes(userEmail)
    if (!isAdmin && !isPrincipal && !isAssigned) {
      throw new HttpsError('permission-denied', '이 체크리스트에 접근 권한이 없습니다.')
    }

    // HTML 생성
    const html = buildChecklistHtml(submission)

    // Puppeteer로 PDF 생성
    let puppeteer
    try {
      puppeteer = require('puppeteer')
    } catch {
      throw new HttpsError('internal', 'PDF 생성 모듈이 설치되지 않았습니다.')
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      })
      return { pdfBase64: Buffer.from(pdfBuffer).toString('base64') }
    } finally {
      await browser.close()
    }
  }
)

function buildChecklistHtml(submission) {
  const isProcess = submission.checklistType === 'process'
  const answers = submission.answers || {}
  const signatures = submission.signatures || {}

  // 과정 체크리스트 문항 데이터 (함수 내 인라인 정의 — Functions는 ESM 미사용)
  const PROCESS_GROUPS = [
    { groupName: '평가계획', questions: [
      { id: 'p1', text: '평가계획(지필평가와 수행평가의 비율, 방식 등) 수립 시 시·도교육청의 지침과 학교의 학업성적관리 규정을 준수하였는가?', evidence: ['시·도 학업성적관리 시행 지침', '학업성적관리규정', '과목별 평가계획'] },
      { id: 'p2', text: '평가계획 수립 시 학기단위 성취수준 진술을 고려하였는가?', evidence: ['과목별 평가계획'] },
      { id: 'p3', text: '학교 및 교과 특성에 맞게 수행평가의 기본 점수 부여 기준을 적절하게 설정하였는가?', evidence: ['과목별 평가계획'] },
      { id: 'p4', text: '학교 교육과정 운영 상황과 교과 및 학생 특성을 고려하여 분할점수 설정 방법(성취수준별 고정분할점수/성취수준별 추정분할점수)를 결정하고 평가계획에 포함하였는가?', evidence: ['과목별 평가계획'] },
      { id: 'p5', text: '과목별 평가계획을 학생 및 학부모에게 공지하였는가?', evidence: ['가정통신문 또는 학교 홈페이지 공지 내역'] },
      { id: 'p6', text: '학기 중에 평가계획을 수정할 경우 교과협의회와 학업성적관리위원회의 심의 및 학교장의 결재를 거쳤는가?', evidence: ['과목별 평가계획', '학업성적관리위원회 회의록'] },
    ]},
    { groupName: '평가 문항 출제', questions: [
      { id: 'p7', text: '학교장의 결재를 받은 지필평가 및 수행평가 계획과 실제 평가도구가 일치하는가?(문항 수, 고사 범위 등)', evidence: ['과목별 평가계획', '지필평가 도구', '수행평가 도구'] },
      { id: 'p8', text: '평가도구가 각 성취수준 도달 여부를 판단할 수 있도록 다양한 수준의 문항을 출제하였는가?', evidence: ['문항정보표'] },
    ]},
    { groupName: '분할점수 산출', questions: [
      { id: 'p9', text: '성취수준별 추정분할점수 적용 시, 성취수준별 분할점수 산출을 위한 프로그램을 사용하고, 교사별 분할점수 설정 과정을 2회 이상 반복하였는가?(예. NEIS) ※(9~12번) 고정분할점수 사용 과목은 모두 미체크', evidence: ['성취수준별 분할점수 산출 결과 출력물'] },
      { id: 'p10', text: '성취수준별 최종 분할점수는 평가 시행 전에 내부결재를 거쳤는가?', evidence: ['관련 내부 결재문서'] },
      { id: 'p11', text: '평가 시행 전에 성취수준별 최종 분할점수를 학생과 학부모에게 공지하였는가?', evidence: ['가정통신문 또는 학교 홈페이지 공지 내역'] },
      { id: 'p12', text: '분할점수 산출을 평가 시행 전에 확정하고 시행 후에는 수정하지 않았는가?', evidence: ['성취수준별 분할점수 공지 내역'] },
    ]},
    { groupName: '평가결과 분석 및 피드백', questions: [
      { id: 'p13', text: '채점이 끝난 후 학생들에게 채점 결과를 알려주고 이의신청할 기회를 제공하였는가?', evidence: ['이의신청 절차 공지 내역'] },
      { id: 'p14', text: '평가 시행 후 그 결과에 대한 분석(예. 과목별, 학급별 평균 분석, 평가 문항 정답률 분석 등)을 실시하고 이를 교수·학습 방법의 개선과 이후 평가 문항 출제를 위한 기초 자료로 활용하였는가?', evidence: [] },
      { id: 'p15', text: '평가 시행 후 그 결과에 대한 분석을 활용하여 개별 학생의 학습 수준에 따라 피드백을 제공하였는가?', evidence: [] },
    ]},
    { groupName: '의사소통', questions: [
      { id: 'p16', text: '평가계획은 교과(학년)협의회를 통해 교사 간 충분한 협의를 거쳐 작성하였는가?', evidence: [] },
      { id: 'p17', text: '평가 문항 개발 시 교과 공동 출제 및 공동 검토를 하였는가?', evidence: [] },
      { id: 'p18', text: '교과협의회에서 평가 결과 산출 제반 사항을 협의하고 실행하였는가?', evidence: [] },
      { id: 'p19', text: '성취수준별 비율이 특정 수준에 편중된 경우 교과협의회 등을 통해 원인을 분석하였는가?', evidence: [] },
    ]},
  ]

  let qNum = 1
  let rows = ''
  for (const group of PROCESS_GROUPS) {
    const groupRowCount = group.questions.length
    let firstInGroup = true
    for (const q of group.questions) {
      const ans = answers[q.id] || {}
      const val = ans.value || ''
      const checkedEvidence = ans.evidenceChecks || []

      const evidenceHtml = q.evidence.length > 0
        ? q.evidence.map(e => `<span class="ev-item">${checkedEvidence.includes(e) ? '☑' : '☐'} ${e}</span>`).join(' ')
        : ''

      rows += `<tr>
        ${firstInGroup ? `<td class="group-cell" rowspan="${groupRowCount}">${group.groupName}</td>` : ''}
        <td class="num-cell">${qNum++}</td>
        <td class="q-cell">
          <div class="q-text">${q.text}</div>
          ${evidenceHtml ? `<div class="evidence">${evidenceHtml}</div>` : ''}
        </td>
        <td class="ans-cell">${val === '예' ? '● 예<br>○ 아니오' : val === '아니오' ? '○ 예<br>● 아니오' : '○ 예<br>○ 아니오'}</td>
      </tr>`
      firstInGroup = false
    }
  }

  // 서명 HTML
  const teacherSigs = (submission.teacherEmails || []).map((email, i) => {
    const sig = signatures[email]
    return `<div class="sig-box">
      <div class="sig-label">공동출제교사 ${i + 1}<br><span class="sig-email">${email}</span></div>
      ${sig?.dataUrl ? `<img class="sig-img" src="${sig.dataUrl}" />` : '<div class="sig-empty"></div>'}
    </div>`
  }).join('')

  const principalSig = submission.principalSignature
  const principalHtml = `<div class="sig-box">
    <div class="sig-label">확인자(교감)</div>
    ${principalSig?.dataUrl ? `<img class="sig-img" src="${principalSig.dataUrl}" />` : '<div class="sig-empty"></div>'}
  </div>`

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 10px; color: #000; }
  h1 { text-align: center; font-size: 14px; margin-bottom: 8px; }
  .meta { display: flex; gap: 24px; margin-bottom: 8px; font-size: 10px; }
  .meta span { border-bottom: 1px solid #000; min-width: 120px; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #666; padding: 4px 6px; vertical-align: top; }
  th { background: #f0f0f0; text-align: center; font-size: 10px; }
  .group-cell { text-align: center; font-weight: bold; font-size: 9px; vertical-align: middle; white-space: nowrap; }
  .num-cell { text-align: center; vertical-align: middle; width: 24px; }
  .q-cell { width: auto; }
  .q-text { margin-bottom: 3px; line-height: 1.4; }
  .evidence { font-size: 9px; color: #333; }
  .ev-item { margin-right: 6px; }
  .ans-cell { text-align: center; vertical-align: middle; white-space: nowrap; width: 60px; line-height: 1.8; }
  .sig-section { display: flex; gap: 8px; margin-top: 8px; }
  .sig-box { border: 1px solid #666; padding: 4px; width: 120px; text-align: center; }
  .sig-label { font-size: 9px; margin-bottom: 4px; line-height: 1.4; }
  .sig-email { font-size: 8px; color: #555; }
  .sig-img { width: 100px; height: 50px; object-fit: contain; }
  .sig-empty { width: 100px; height: 50px; border: 1px dashed #ccc; margin: 0 auto; }
</style>
</head>
<body>
  <h1>단위학교(과목별) 성취평가 운영 과정 점검 체크리스트</h1>
  <div class="meta">
    <span>학교명: ${submission.schoolName || ''}</span>
    <span>점검 과목: ${submission.subjectName || ''} (${submission.grade || ''}학년 ${submission.semester || ''}학기)</span>
    <span>점검일자: ${submission.checkDate || ''}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:70px">단계</th>
        <th style="width:24px">번호</th>
        <th>점검 내용</th>
        <th style="width:60px">예/아니오</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sig-section">
    ${teacherSigs}
    ${principalHtml}
  </div>
</body>
</html>`
}
