const { getFirestore } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

/**
 * studentGroups 마이그레이션: studentIds → workspaceUserIds
 *
 * 기존: studentIds = ['10101', '10102', ...] (5자리 학번 배열)
 * 새로: workspaceUserIds = ['114567...', '114568...', ...] (Workspace User ID 배열)
 *
 * 실행 방법:
 * curl -X POST https://asia-northeast3-seonyoo-system.cloudfunctions.net/migrateStudentGroups \
 *   -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
 *   -H "Content-Type: application/json" \
 *   -d '{"data":{"schoolId":"seonyoo-hs","dryRun":true}}'
 */

async function migrateGroups(db, schoolId, dryRun = true) {
  console.log(`[그룹 마이그레이션] 시작 - schoolId: ${schoolId}, dryRun: ${dryRun}`)

  // 1. 모든 students 문서 조회 (studentId → workspaceUserId 매핑 생성)
  const studentsSnap = await db.collection('schools').doc(schoolId).collection('students').get()
  const studentIdToWorkspaceId = {}
  const workspaceIdToStudentId = {}

  studentsSnap.docs.forEach(d => {
    const data = d.data()
    const workspaceUserId = d.id // 문서 ID
    const studentId = data.studentId

    if (studentId && workspaceUserId) {
      studentIdToWorkspaceId[studentId] = workspaceUserId
      workspaceIdToStudentId[workspaceUserId] = studentId
    }
  })

  console.log(`[학생 매핑] ${Object.keys(studentIdToWorkspaceId).length}명의 학생 ID 매핑 완료`)

  // 2. 모든 studentGroups 조회
  const groupsSnap = await db.collection('schools').doc(schoolId).collection('studentGroups').get()
  console.log(`[그룹] ${groupsSnap.size}개 그룹 발견`)

  const stats = {
    total: groupsSnap.size,
    migrated: 0,
    skipped: 0,
    errors: 0,
    unmappedStudents: [],
  }

  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id
    const data = groupDoc.data()

    try {
      // 이미 workspaceUserIds가 있으면 skip
      if (data.workspaceUserIds && data.workspaceUserIds.length > 0) {
        console.log(`[SKIP] ${groupId} (${data.name}): 이미 마이그레이션됨`)
        stats.skipped++
        continue
      }

      const studentIds = data.studentIds || []
      if (studentIds.length === 0) {
        console.log(`[SKIP] ${groupId} (${data.name}): 학생 없음`)
        stats.skipped++
        continue
      }

      // studentIds → workspaceUserIds 변환
      const workspaceUserIds = []
      const unmapped = []

      for (const sid of studentIds) {
        const wId = studentIdToWorkspaceId[sid]
        if (wId) {
          workspaceUserIds.push(wId)
        } else {
          unmapped.push(sid)
        }
      }

      if (unmapped.length > 0) {
        console.warn(`[경고] ${groupId} (${data.name}): ${unmapped.length}명의 학생 ID를 매핑할 수 없음: ${unmapped.join(', ')}`)
        stats.unmappedStudents.push({
          groupId,
          groupName: data.name,
          unmappedIds: unmapped,
        })
      }

      if (workspaceUserIds.length === 0) {
        console.warn(`[SKIP] ${groupId} (${data.name}): 매핑된 학생 없음`)
        stats.skipped++
        continue
      }

      if (!dryRun) {
        // workspaceUserIds 필드 추가 (studentIds는 하위 호환용으로 유지)
        await groupDoc.ref.update({
          workspaceUserIds,
          migratedAt: new Date(),
        })
        console.log(`[OK] ${groupId} (${data.name}): ${studentIds.length}명 → ${workspaceUserIds.length}명 매핑 완료`)
      } else {
        console.log(`[DRY-RUN] ${groupId} (${data.name}): ${studentIds.length}명 → ${workspaceUserIds.length}명 매핑 예정`)
      }

      stats.migrated++
    } catch (err) {
      console.error(`[ERROR] ${groupId}: ${err.message}`)
      stats.errors++
    }
  }

  console.log(`\n[그룹 마이그레이션 완료]`)
  console.log(`- 총 ${stats.total}개 그룹`)
  console.log(`- 마이그레이션 ${dryRun ? '시뮬레이션' : '완료'}: ${stats.migrated}개`)
  console.log(`- 건너뜀: ${stats.skipped}개`)
  console.log(`- 오류: ${stats.errors}개`)

  if (stats.unmappedStudents.length > 0) {
    console.log(`\n[매핑 실패 학생]:`)
    stats.unmappedStudents.forEach(g => {
      console.log(`  ${g.groupName}: ${g.unmappedIds.join(', ')}`)
    })
  }

  return stats
}

/**
 * Cloud Function 엔드포인트
 */
exports.migrateStudentGroups = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
    }

    const { schoolId, dryRun = true } = request.data || {}
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
      throw new HttpsError('permission-denied', '이 학교의 관리자만 마이그레이션을 실행할 수 있습니다.')
    }

    try {
      const stats = await migrateGroups(db, schoolId, dryRun)

      return {
        success: true,
        dryRun,
        stats,
        message: dryRun
          ? '시뮬레이션 완료 - dryRun=false로 다시 호출하여 실제 마이그레이션을 수행하세요.'
          : '마이그레이션 완료',
      }
    } catch (err) {
      console.error(`[그룹 마이그레이션 실패]`, err)
      throw new HttpsError('internal', err.message || '마이그레이션 중 오류가 발생했습니다.')
    }
  }
)
