const { google } = require('googleapis')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

/**
 * Google Workspace Directory API 동기화
 *
 * schools/{schoolId} 문서의 workspaceSync 필드로 학교별 설정:
 *   workspaceSync: {
 *     enabled: boolean
 *     adminEmail: string      // 도메인 위임을 대리 인증(impersonate)할 실제 Workspace 관리자 이메일
 *     staffOuPath: string     // 예: "/교원" (조직 트리 최상위 조직명은 포함하지 않음 — 그건 루트 "/"임)
 *     studentOuPath: string   // 예: "/학생 2026" (학년도가 바뀌면 관리자가 직접 갱신, 하위 학년 OU는 자동 포함)
 *   }
 *
 * 서비스계정 키는 Secret Manager의 workspace-sync-key에 저장 (코드/저장소에 절대 포함하지 않음).
 * 교직원: schools/{id}/preApproved 자동 생성/정리 — 기존 로그인 흐름(AuthContext.jsx)이 그대로
 *        재사용하므로 최초 로그인 시 users/{uid}가 자동 생성됨.
 * 학생: schools/{id}/students 직접 upsert — 문서ID/학번은 이메일 로컬파트 9자리 패턴에서 파싱
 *      (parseStudentEmail, AuthContext.jsx와 동일 규칙 — 그 쪽을 바꾸면 여기도 맞춰야 함)
 */

const SECRET_NAME = 'projects/seonyoo-system/secrets/workspace-sync-key/versions/latest'
const DIRECTORY_SCOPES = ['https://www.googleapis.com/auth/admin.directory.user.readonly']

const secretClient = new SecretManagerServiceClient()
let cachedKey = null

async function getServiceAccountKey() {
  if (cachedKey) return cachedKey
  const [version] = await secretClient.accessSecretVersion({ name: SECRET_NAME })
  cachedKey = JSON.parse(version.payload.data.toString('utf8'))
  return cachedKey
}

async function getDirectoryClient(subject) {
  const key = await getServiceAccountKey()
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: DIRECTORY_SCOPES,
    subject,
  })
  await auth.authorize()
  return google.admin({ version: 'directory_v1', auth })
}

function emailToDocId(email) {
  return email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__')
}

// AuthContext.jsx의 parseStudentEmail과 동일 규칙 (연도 4자리 + 학번 5자리 = 9자리)
function parseStudentEmail(email) {
  const local = email.split('@')[0]
  if (!/^\d{9}$/.test(local)) return null
  return { year: parseInt(local.slice(0, 4), 10), studentId: local.slice(4) }
}

async function listOuUsers(directory, ouPath) {
  let users = []
  let pageToken
  do {
    const res = await directory.users.list({
      customer: 'my_customer',
      query: `orgUnitPath='${ouPath}'`,
      maxResults: 500,
      pageToken,
    })
    users = users.concat(res.data.users || [])
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return users.filter(u => !u.suspended && !u.archived)
}

// ── 교직원: preApproved 자동 생성/정리 ──────────────────────────────────
async function syncStaff(db, schoolId, directory, ouPath) {
  const users = await listOuUsers(directory, ouPath)
  const seenEmails = new Set()
  let created = 0
  let updated = 0

  for (const u of users) {
    const email = u.primaryEmail.toLowerCase()
    seenEmails.add(email)
    // 이 학교 Workspace는 familyName을 "교사"/학번 같은 라벨 용도로 쓰고 있어
    // fullName(=familyName+givenName)이 아니라 givenName만 실제 이름
    const name = u.name?.givenName || u.name?.fullName || email
    const ref = db.collection('schools').doc(schoolId).collection('preApproved').doc(emailToDocId(email))
    const snap = await ref.get()

    if (!snap.exists) {
      await ref.set({
        email,
        name,
        role: 'teacher',
        staffType: '교사',
        source: 'workspaceSync',
        createdAt: FieldValue.serverTimestamp(),
      })
      created++
    } else if (snap.data().source === 'workspaceSync' && snap.data().name !== name) {
      // 동기화가 만든 항목만 갱신 — 관리자가 사전 등록 탭에서 수동으로 넣은 항목은 손대지 않음
      await ref.update({ name, updatedAt: FieldValue.serverTimestamp() })
      updated++
    }
  }

  // 더 이상 교원 OU에 없는(퇴직/전출), 동기화가 만든 미접속 사전등록 항목 정리
  const preSnap = await db.collection('schools').doc(schoolId).collection('preApproved').get()
  let removed = 0
  for (const doc of preSnap.docs) {
    const data = doc.data()
    if (data.source === 'workspaceSync' && !seenEmails.has(data.email?.toLowerCase())) {
      await doc.ref.delete()
      removed++
    }
  }

  return { total: users.length, created, updated, removed }
}

// ── 학생: students 컬렉션 직접 upsert ───────────────────────────────────
async function syncStudents(db, schoolId, directory, ouPath) {
  const users = await listOuUsers(directory, ouPath)
  let created = 0
  let updated = 0
  let skipped = 0

  for (const u of users) {
    const email = u.primaryEmail.toLowerCase()
    const parsed = parseStudentEmail(email)
    if (!parsed) { skipped++; continue }

    const { year, studentId } = parsed
    const grade = parseInt(studentId.slice(0, 1), 10)
    const classNo = parseInt(studentId.slice(1, 3), 10)
    const number = parseInt(studentId.slice(3, 5), 10)
    // 이 학교 Workspace는 familyName을 "교사"/학번 같은 라벨 용도로 쓰고 있어
    // fullName(=familyName+givenName)이 아니라 givenName만 실제 이름
    const name = u.name?.givenName || u.name?.fullName || email

    const ref = db.collection('schools').doc(schoolId).collection('students').doc(studentId)
    const snap = await ref.get()
    const payload = { studentId, year, grade, class: classNo, number, name, email }

    if (!snap.exists) {
      await ref.set(payload)
      created++
    } else {
      const existing = snap.data()
      // 이름은 관리자가 학생 명단 탭에서 수동으로 고칠 수 있음 — 그 경우 동기화가 되돌리지 않도록 제외
      const syncedPayload = existing.nameEditedManually
        ? { ...payload, name: existing.name }
        : payload
      const changed = ['year', 'grade', 'class', 'number', 'name', 'email']
        .some(k => existing[k] !== syncedPayload[k])
      if (changed) {
        await ref.set(syncedPayload, { merge: true })
        updated++
      }
    }
  }

  return { total: users.length, created, updated, skipped }
}

async function syncSchool(db, schoolId, schoolData) {
  const cfg = schoolData.workspaceSync
  if (!cfg?.enabled || !cfg.adminEmail) return null

  const directory = await getDirectoryClient(cfg.adminEmail)
  const result = { schoolId }

  if (cfg.staffOuPath) {
    result.staff = await syncStaff(db, schoolId, directory, cfg.staffOuPath)
  }
  if (cfg.studentOuPath) {
    result.students = await syncStudents(db, schoolId, directory, cfg.studentOuPath)
  }

  return result
}

// ── 매일 새벽 3시(KST) 자동 동기화 ──────────────────────────────────────
exports.syncWorkspaceDirectory = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Asia/Seoul', region: 'asia-northeast3', timeoutSeconds: 300 },
  async () => {
    const db = getFirestore()
    const schoolsSnap = await db.collection('schools').get()

    for (const schoolDoc of schoolsSnap.docs) {
      try {
        const result = await syncSchool(db, schoolDoc.id, schoolDoc.data())
        if (result) console.log(`[${schoolDoc.id}] Workspace 동기화 완료:`, JSON.stringify(result))
      } catch (e) {
        console.error(`[${schoolDoc.id}] Workspace 동기화 실패:`, e.message)
      }
    }
  }
)

// ── 관리자가 즉시 수동 실행 (설정 확인 후 바로 테스트하기 위한 용도) ──────
exports.runWorkspaceSyncNow = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

    const { schoolId } = request.data || {}
    if (!schoolId) throw new HttpsError('invalid-argument', 'schoolId가 필요합니다.')

    const db = getFirestore()
    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    const userData = userDoc.data()
    const isSuperAdmin = request.auth.token.superAdmin === true
    const isSchoolAdmin = userData?.schoolId === schoolId &&
      ['admin', 'school_admin'].includes(userData?.role)

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpsError('permission-denied', '이 학교의 관리자만 동기화를 실행할 수 있습니다.')
    }

    const schoolDoc = await db.collection('schools').doc(schoolId).get()
    if (!schoolDoc.exists) throw new HttpsError('not-found', '학교를 찾을 수 없습니다.')

    const cfg = schoolDoc.data().workspaceSync
    if (!cfg?.enabled) {
      throw new HttpsError('failed-precondition', 'Workspace 동기화가 설정되지 않았습니다.')
    }

    try {
      const result = await syncSchool(db, schoolId, schoolDoc.data())
      return { success: true, result }
    } catch (e) {
      console.error(`[${schoolId}] 수동 동기화 실패:`, e)
      throw new HttpsError('internal', e.message || '동기화 중 오류가 발생했습니다.')
    }
  }
)
