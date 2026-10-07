const { google } = require('googleapis')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { mergeSyncedStudent } = require('./studentSyncMerge')

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
 *      학적의 기준은 StudentHub — 기존 학생의 학년·반·번호는 학년도 전환 때만 바꾼다(studentSyncMerge.js).
 *      학생 OU 설정·즉시 실행 화면은 StudentHub 「Workspace 학생 동기화」에 있다.
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
  let archived = 0

  // Workspace에 있는 모든 학생의 workspaceUserId 집합
  const activeWorkspaceIds = new Set(users.map(u => u.id))

  for (const u of users) {
    const email = u.primaryEmail.toLowerCase()
    const parsed = parseStudentEmail(email)
    if (!parsed) { skipped++; continue }

    const { year, studentId } = parsed
    const fullStudentId = `${year}${studentId}` // 9자리 (연도4+학번5)
    const grade = parseInt(studentId.slice(0, 1), 10)
    const classNo = parseInt(studentId.slice(1, 3), 10)
    const number = parseInt(studentId.slice(3, 5), 10)
    // 이 학교 Workspace는 familyName을 "교사"/학번 같은 라벨 용도로 쓰고 있어
    // fullName(=familyName+givenName)이 아니라 givenName만 실제 이름
    const name = u.name?.givenName || u.name?.fullName || email
    const workspaceUserId = u.id // Google Workspace 영구 불변 ID

    // 문서 ID는 이제 workspaceUserId 사용 (학번이 아님!)
    const ref = db.collection('schools').doc(schoolId).collection('students').doc(workspaceUserId)
    const snap = await ref.get()

    if (!snap.exists) {
      // 신규 학생 등록
      await ref.set({
        workspaceUserId,
        studentId,
        fullStudentId,
        email,
        name,
        year,
        grade,
        class: classNo,
        number,
        admissionYear: year, // 첫 등록 시의 연도가 입학연도
        emailHistory: [{ email, year }],
        source: 'workspaceSync',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      created++
    } else {
      // 학년·반·번호는 학년도 전환 때만 갱신 — 같은 학년도 안에서는 StudentHub 학적이 기준
      const { data, changed } = mergeSyncedStudent(snap.data(), {
        workspaceUserId, studentId, fullStudentId, email, name, year, grade, classNo, number,
      })
      if (changed) {
        await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        updated++
      }
    }
  }

  // ── 퇴출/졸업생 자동 아카이브 ────────────────────────────────────────
  // Workspace OU에 더 이상 없는 학생들을 찾아서 아카이브로 이동
  const allStudentsSnap = await db.collection('schools').doc(schoolId).collection('students')
    .where('source', '==', 'workspaceSync') // 동기화로 만들어진 학생만 대상
    .get()

  for (const doc of allStudentsSnap.docs) {
    const data = doc.data()
    const wId = data.workspaceUserId

    // Workspace에 없으면 아카이브
    if (wId && !activeWorkspaceIds.has(wId)) {
      // 사유: StudentHub에서 학적 담당자가 기록한 변동(전출·자퇴 등)이 있으면 그 type,
      // 없으면 알 수 없음(졸업·계정 정리 등)으로 남긴다.
      const changesSnap = await db.collection('schools').doc(schoolId).collection('enrollmentChanges')
        .where('workspaceUserId', '==', wId)
        .get()
      const lastChange = changesSnap.docs
        .map(d => d.data())
        .filter(c => ['transferOut', 'withdraw'].includes(c.type))
        .sort((a, b) => String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || '')))[0]

      // archivedStudents 컬렉션으로 이동
      await db.collection('schools').doc(schoolId).collection('archivedStudents').doc(wId).set({
        ...data,
        archivedAt: FieldValue.serverTimestamp(),
        archivedReason: lastChange ? lastChange.type : 'workspace_sync_removed',
      })

      // 원본 삭제
      await doc.ref.delete()
      archived++
    }
  }

  return { total: users.length, created, updated, skipped, archived }
}

/** @param {'all'|'staff'|'students'} scope 교직원(스마트교무실)·학생(StudentHub)을 따로 실행할 수 있다 */
async function syncSchool(db, schoolId, schoolData, scope = 'all') {
  const cfg = schoolData.workspaceSync
  if (!cfg?.enabled || !cfg.adminEmail) return null

  const directory = await getDirectoryClient(cfg.adminEmail)
  const result = { schoolId }

  if (cfg.staffOuPath && scope !== 'students') {
    result.staff = await syncStaff(db, schoolId, directory, cfg.staffOuPath)
  }
  if (cfg.studentOuPath && scope !== 'staff') {
    result.students = await syncStudents(db, schoolId, directory, cfg.studentOuPath)
    // StudentHub 「학적 기준일」 — 학생 명단을 마지막으로 Workspace와 맞춘 시각
    await db.collection('schools').doc(schoolId).update({
      'workspaceSync.lastStudentSyncAt': FieldValue.serverTimestamp(),
    })
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

    const { schoolId, scope = 'all' } = request.data || {}
    if (!schoolId) throw new HttpsError('invalid-argument', 'schoolId가 필요합니다.')
    if (!['all', 'staff', 'students'].includes(scope)) {
      throw new HttpsError('invalid-argument', 'scope는 all·staff·students 중 하나입니다.')
    }

    const db = getFirestore()
    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    const userData = userDoc.data()
    const isSuperAdmin = request.auth.token.superAdmin === true
    const isSchoolAdmin = userData?.schoolId === schoolId &&
      ['admin', 'school_admin'].includes(userData?.role)

    // 학생 동기화는 StudentHub 관리자(교감)·학적 담당자도 실행한다 — firestore.rules hasHubRole과 같은 기준
    let canSyncStudents = isSuperAdmin || isSchoolAdmin
    if (!canSyncStudents && scope === 'students' && userData?.schoolId === schoolId) {
      if (userData.role === 'principal') {
        canSyncStudents = true
      } else if (['teacher', 'headmaster'].includes(userData.role)) {
        const mgr = await db.collection('schools').doc(schoolId).collection('studentHubManagers').doc(request.auth.uid).get()
        canSyncStudents = (mgr.data()?.roles || []).includes('enrollment')
      }
    }

    if (!canSyncStudents) {
      throw new HttpsError('permission-denied', scope === 'students'
        ? '관리자·교감·학적 담당자만 학생 동기화를 실행할 수 있습니다.'
        : '이 학교의 관리자만 동기화를 실행할 수 있습니다.')
    }

    const schoolDoc = await db.collection('schools').doc(schoolId).get()
    if (!schoolDoc.exists) throw new HttpsError('not-found', '학교를 찾을 수 없습니다.')

    const cfg = schoolDoc.data().workspaceSync
    if (!cfg?.enabled) {
      throw new HttpsError('failed-precondition', 'Workspace 동기화가 설정되지 않았습니다.')
    }

    try {
      const result = await syncSchool(db, schoolId, schoolDoc.data(), scope)
      return { success: true, result }
    } catch (e) {
      console.error(`[${schoolId}] 수동 동기화 실패:`, e)
      throw new HttpsError('internal', e.message || '동기화 중 오류가 발생했습니다.')
    }
  }
)
