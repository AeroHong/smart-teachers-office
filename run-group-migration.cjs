// Firebase Admin SDK로 직접 그룹 마이그레이션 함수 실행
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Application Default Credentials 사용 (gcloud auth application-default login 필요)
admin.initializeApp({
  projectId: 'seonyoo-system',
});

const db = getFirestore();

// 그룹 마이그레이션 로직
async function migrateGroups(dryRun = true) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`학생 그룹 마이그레이션 ${dryRun ? 'DRY-RUN (시뮬레이션)' : '실제 실행'}`);
  console.log(`${'='.repeat(60)}\n`);

  const schoolId = 'seonyoo-hs';

  // 1. 모든 students 문서 조회 (studentId → workspaceUserId 매핑 생성)
  console.log('📊 학생 데이터 매핑 생성 중...');
  const studentsSnap = await db.collection('schools').doc(schoolId).collection('students').get();
  const studentIdToWorkspaceId = {};
  const workspaceIdToStudentId = {};

  studentsSnap.docs.forEach(d => {
    const data = d.data();
    const workspaceUserId = d.id; // 문서 ID
    const studentId = data.studentId;

    if (studentId && workspaceUserId) {
      studentIdToWorkspaceId[studentId] = workspaceUserId;
      workspaceIdToStudentId[workspaceUserId] = studentId;
    }
  });

  console.log(`   ✓ ${Object.keys(studentIdToWorkspaceId).length}명의 학생 ID 매핑 완료\n`);

  // 2. 모든 studentGroups 조회
  console.log('📋 학생 그룹 조회 중...');
  const groupsSnap = await db.collection('schools').doc(schoolId).collection('studentGroups').get();
  console.log(`   현재 그룹 수: ${groupsSnap.size}개\n`);

  if (groupsSnap.size === 0) {
    console.log('⚠️  그룹이 없습니다. 마이그레이션을 건너뜁니다.\n');
    return;
  }

  const stats = {
    total: groupsSnap.size,
    migrated: 0,
    skipped: 0,
    errors: 0,
    unmappedStudents: [],
  };

  // 3. 샘플 데이터 확인
  console.log('📋 샘플 그룹 데이터 (첫 5개):');
  groupsSnap.docs.slice(0, 5).forEach((doc, i) => {
    const data = doc.data();
    const studentIds = data.studentIds || [];
    const workspaceUserIds = data.workspaceUserIds || [];
    console.log(`   ${i+1}. ${data.name} | 학생: ${studentIds.length}명 | workspaceUserIds: ${workspaceUserIds.length}명`);
  });
  console.log();

  if (dryRun) {
    console.log('🔍 마이그레이션 시뮬레이션...\n');
  } else {
    console.log('🚀 실제 마이그레이션 시작...\n');
  }

  // 4. 각 그룹에 대해 마이그레이션 수행
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;
    const data = groupDoc.data();

    try {
      // 이미 workspaceUserIds가 있으면 skip
      if (data.workspaceUserIds && data.workspaceUserIds.length > 0) {
        console.log(`   [SKIP] ${data.name}: 이미 마이그레이션됨 (workspaceUserIds: ${data.workspaceUserIds.length}명)`);
        stats.skipped++;
        continue;
      }

      const studentIds = data.studentIds || [];
      if (studentIds.length === 0) {
        console.log(`   [SKIP] ${data.name}: 학생 없음`);
        stats.skipped++;
        continue;
      }

      // studentIds → workspaceUserIds 변환
      const workspaceUserIds = [];
      const unmapped = [];

      for (const sid of studentIds) {
        const wId = studentIdToWorkspaceId[sid];
        if (wId) {
          workspaceUserIds.push(wId);
        } else {
          unmapped.push(sid);
        }
      }

      if (unmapped.length > 0) {
        console.warn(`   [경고] ${data.name}: ${unmapped.length}명의 학생 ID를 매핑할 수 없음: ${unmapped.join(', ')}`);
        stats.unmappedStudents.push({
          groupId,
          groupName: data.name,
          unmappedIds: unmapped,
        });
      }

      if (workspaceUserIds.length === 0) {
        console.warn(`   [SKIP] ${data.name}: 매핑된 학생 없음`);
        stats.skipped++;
        continue;
      }

      if (!dryRun) {
        // workspaceUserIds 필드 추가 (studentIds는 하위 호환용으로 유지)
        await groupDoc.ref.update({
          workspaceUserIds,
          migratedAt: new Date(),
        });
        console.log(`   [OK] ${data.name}: ${studentIds.length}명 → ${workspaceUserIds.length}명 매핑 완료`);
      } else {
        console.log(`   [DRY-RUN] ${data.name}: ${studentIds.length}명 → ${workspaceUserIds.length}명 매핑 예정`);
      }

      stats.migrated++;
    } catch (err) {
      console.error(`   [ERROR] ${groupId} (${data.name}): ${err.message}`);
      stats.errors++;
    }
  }

  console.log(`\n✅ 그룹 마이그레이션 ${dryRun ? '시뮬레이션' : ''} 완료!`);
  console.log(`   총 그룹: ${stats.total}개`);
  console.log(`   마이그레이션 ${dryRun ? '예정' : '완료'}: ${stats.migrated}개`);
  console.log(`   건너뜀: ${stats.skipped}개`);
  console.log(`   오류: ${stats.errors}개`);

  if (stats.unmappedStudents.length > 0) {
    console.log(`\n⚠️  매핑 실패 학생 (${stats.unmappedStudents.length}개 그룹):`);
    stats.unmappedStudents.forEach(g => {
      console.log(`   ${g.groupName}: ${g.unmappedIds.join(', ')}`);
    });
  }

  if (dryRun) {
    console.log('\n실제 마이그레이션을 실행하려면:');
    console.log('  node run-group-migration.cjs false\n');
  } else {
    console.log();
  }
}

// 실행
const dryRun = process.argv[2] !== 'false';
migrateGroups(dryRun)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  });
