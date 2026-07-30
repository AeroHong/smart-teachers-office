const { google } = require('googleapis')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

/**
 * 학생 데이터 마이그레이션: studentId → workspaceUserId
 *
 * 기존 구조: schools/{schoolId}/students/{studentId (5자리)}
 * 새 구조:   schools/{schoolId}/students/{workspaceUserId}
 *
 * 실행 방법:
 * 1. Firebase Console Functions에서 수동 호출
 * 2. 또는 curl로 직접 호출:
 *    curl -X POST https://asia-northeast3-seonyoo-system.cloudfunctions.net/migrateStudentsToWorkspaceId \
 *      -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
 *      -H "Content-Type: application/json" \
 *      -d '{"data":{"schoolId":"seonyoo-hs","dryRun":true}}'
 */

const SECRET_NAME = 'projects/seonyoo-system/secrets/workspace-sync-key/versions/latest'
const DIRECTORY_SCOPES = ['https://www.googleapis.com/auth/admin.directory.user.readonly']

let secretClient = null
let cachedKey = null

function getSecretClient() {
  if (!secretClient) {
    secretClient = new SecretManagerServiceClient()
  }
  return secretClient
}

async function getServiceAccountKey() {
  if (cachedKey) return cachedKey
  const client = getSecretClient()
  const [version] = await client.accessSecretVersion({ name: SECRET_NAME })
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

// AuthContext.jsx의 parseStudentEmail과 동일 규칙 (연도 4자리 + 학번 5자리 = 9자리)
function parseStudentEmail(email) {
  const local = email.split('@')[0]
  if (!/^\d{9}$/.test(local)) return null
  return { year: parseInt(local.slice(0, 4), 10), studentId: local.slice(4) }
}

async function migrateStudents(db, schoolId, directory, studentOuPath, dryRun = true) {
  console.log(`[마이그레이션] 시작 - schoolId: ${schoolId}, dryRun: ${dryRun}`)

  // 1. Workspace에서 모든 학생 조회
  const workspaceUsers = await listOuUsers(directory, studentOuPath)
  console.log(`[Workspace] ${workspaceUsers.length}명 조회됨`)

  // 이메일 → workspaceUserId 매핑 생성
  const emailToWorkspaceId = {}
  for (const u of workspaceUsers) {
    emailToWorkspaceId[u.primaryEmail.toLowerCase()] = u.id
  }

  // 2. 기존 students 컬렉션의 모든 문서 조회
  const studentsRef = db.collection('schools').doc(schoolId).collection('students')
  const oldStudentsSnap = await studentsRef.get()
  console.log(`[기존 DB] ${oldStudentsSnap.size}개 학생 문서 발견`)

  const stats = {
    total: oldStudentsSnap.size,
    migrated: 0,
    skipped: 0,
    errors: 0,
    noWorkspaceId: [],
    errorDetails: [],
  }

  for (const doc of oldStudentsSnap.docs) {
    const studentId = doc.id // 현재 문서 ID (5자리 학번)
    const data = doc.data()

    try {
      // 이메일로 workspaceUserId 찾기
      const email = data.email?.toLowerCase()
      if (!email) {
        console.warn(`[SKIP] ${studentId}: 이메일 없음`)
        stats.skipped++
        stats.noWorkspaceId.push({ studentId, name: data.name, reason: 'no_email' })
        continue
      }

      const workspaceUserId = emailToWorkspaceId[email]
      if (!workspaceUserId) {
        console.warn(`[SKIP] ${studentId} (${email}): Workspace에서 찾을 수 없음`)
        stats.skipped++
        stats.noWorkspaceId.push({ studentId, name: data.name, email, reason: 'not_in_workspace' })
        continue
      }

      // 새 문서 데이터 준비
      const parsed = parseStudentEmail(email)
      const fullStudentId = parsed ? `${parsed.year}${parsed.studentId}` : `${data.year || ''}${studentId}`

      const newData = {
        ...data,
        workspaceUserId,
        studentId, // 5자리 학번 유지 (UI용)
        fullStudentId, // 9자리 (연도+학번)
        admissionYear: data.admissionYear || data.year || (parsed?.year),
        emailHistory: data.emailHistory || [{ email, year: data.year }],
        source: data.source || 'workspaceSync',
        migratedAt: FieldValue.serverTimestamp(),
        migratedFrom: studentId, // 원래 문서 ID 기록
      }

      if (!dryRun) {
        // 새 문서 생성 (workspaceUserId를 문서 ID로)
        await studentsRef.doc(workspaceUserId).set(newData)

        // 기존 문서를 백업 컬렉션으로 이동 후 삭제
        await db.collection('schools').doc(schoolId).collection('_migrated_students_backup')
          .doc(studentId).set({
            ...data,
            migratedAt: FieldValue.serverTimestamp(),
            newDocId: workspaceUserId,
          })

        // 기존 문서 삭제
        await doc.ref.delete()

        console.log(`[OK] ${studentId} → ${workspaceUserId} (${data.name})`)
      } else {
        console.log(`[DRY-RUN] ${studentId} → ${workspaceUserId} (${data.name})`)
      }

      stats.migrated++
    } catch (err) {
      console.error(`[ERROR] ${studentId}: ${err.message}`)
      stats.errors++
      stats.errorDetails.push({ studentId, name: data.name, error: err.message })
    }
  }

  console.log(`\n[마이그레이션 완료]`)
  console.log(`- 총 ${stats.total}개 문서`)
  console.log(`- 마이그레이션 ${dryRun ? '시뮬레이션' : '완료'}: ${stats.migrated}개`)
  console.log(`- 건너뜀: ${stats.skipped}개`)
  console.log(`- 오류: ${stats.errors}개`)

  if (stats.noWorkspaceId.length > 0) {
    console.log(`\n[Workspace ID 없는 학생들]:`)
    stats.noWorkspaceId.forEach(s => {
      console.log(`  - ${s.studentId} ${s.name} (${s.email || '이메일 없음'}) - ${s.reason}`)
    })
  }

  if (stats.errorDetails.length > 0) {
    console.log(`\n[오류 상세]:`)
    stats.errorDetails.forEach(e => {
      console.log(`  - ${e.studentId} ${e.name}: ${e.error}`)
    })
  }

  return stats
}

/**
 * Cloud Function 엔드포인트
 *
 * 요청 데이터:
 * {
 *   schoolId: "seonyoo-hs",
 *   dryRun: true  // false로 설정하면 실제 마이그레이션 수행
 * }
 */
exports.migrateStudentsToWorkspaceId = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
    }

    const { schoolId, dryRun = true } = request.data || {}
    if (!schoolId) {
      throw new HttpsError('invalid-argument', 'schoolId가 필요합니다.')
    }

    const db = getFirestore()

    // 권한 확인: superAdmin 또는 해당 학교의 school_admin
    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    const userData = userDoc.data()
    const isSuperAdmin = request.auth.token.superAdmin === true
    const isSchoolAdmin = userData?.schoolId === schoolId &&
      ['admin', 'school_admin'].includes(userData?.role)

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpsError('permission-denied', '이 학교의 관리자만 마이그레이션을 실행할 수 있습니다.')
    }

    // 학교 설정 확인
    const schoolDoc = await db.collection('schools').doc(schoolId).get()
    if (!schoolDoc.exists) {
      throw new HttpsError('not-found', '학교를 찾을 수 없습니다.')
    }

    const cfg = schoolDoc.data().workspaceSync
    if (!cfg?.enabled || !cfg.adminEmail || !cfg.studentOuPath) {
      throw new HttpsError('failed-precondition', 'Workspace 동기화 설정이 완료되지 않았습니다.')
    }

    try {
      const directory = await getDirectoryClient(cfg.adminEmail)
      const stats = await migrateStudents(db, schoolId, directory, cfg.studentOuPath, dryRun)

      return {
        success: true,
        dryRun,
        stats,
        message: dryRun
          ? '시뮬레이션 완료 - dryRun=false로 다시 호출하여 실제 마이그레이션을 수행하세요.'
          : '마이그레이션 완료',
      }
    } catch (err) {
      console.error(`[마이그레이션 실패]`, err)
      throw new HttpsError('internal', err.message || '마이그레이션 중 오류가 발생했습니다.')
    }
  }
)

/**
 * 롤백 함수: 백업에서 복원
 */
exports.rollbackStudentsMigration = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
    }

    const { schoolId } = request.data || {}
    if (!schoolId) {
      throw new HttpsError('invalid-argument', 'schoolId가 필요합니다.')
    }

    const db = getFirestore()

    // 권한 확인
    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    const userData = userDoc.data()
    const isSuperAdmin = request.auth.token.superAdmin === true
    const isSchoolAdmin = userData?.schoolId === schoolId &&
      ['admin', 'school_admin'].includes(userData?.role)

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpsError('permission-denied', '이 학교의 관리자만 롤백을 실행할 수 있습니다.')
    }

    try {
      console.log(`[롤백 시작] schoolId: ${schoolId}`)

      const backupRef = db.collection('schools').doc(schoolId).collection('_migrated_students_backup')
      const backupSnap = await backupRef.get()

      console.log(`[백업] ${backupSnap.size}개 문서 발견`)

      let restored = 0
      const studentsRef = db.collection('schools').doc(schoolId).collection('students')

      for (const doc of backupSnap.docs) {
        const data = doc.data()
        const originalId = doc.id
        const newDocId = data.newDocId

        // 마이그레이션된 문서 삭제
        if (newDocId) {
          await studentsRef.doc(newDocId).delete()
        }

        // 원본 복원
        const { migratedAt, newDocId: _, ...originalData } = data
        await studentsRef.doc(originalId).set(originalData)

        // 백업 삭제
        await doc.ref.delete()

        restored++
        console.log(`[복원] ${originalId}`)
      }

      console.log(`[롤백 완료] ${restored}개 문서 복원됨`)

      return {
        success: true,
        restored,
        message: `${restored}개 학생 문서가 원래 구조로 복원되었습니다.`,
      }
    } catch (err) {
      console.error(`[롤백 실패]`, err)
      throw new HttpsError('internal', err.message || '롤백 중 오류가 발생했습니다.')
    }
  }
)
