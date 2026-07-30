// Firebase Admin SDK로 직접 마이그레이션 함수 실행
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Application Default Credentials 사용 (gcloud auth application-default login 필요)
admin.initializeApp({
  projectId: 'seonyoo-system',
});

const db = getFirestore();
const { google } = require('googleapis');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// 마이그레이션 로직을 여기에 직접 구현
async function migrateStudents(dryRun = true) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`학생 마이그레이션 ${dryRun ? 'DRY-RUN (시뮬레이션)' : '실제 실행'}`);
  console.log(`${'='.repeat(60)}\n`);

  const schoolId = 'seonyoo-hs';

  // 1. 현재 학생 데이터 확인
  console.log('📊 현재 학생 데이터 확인 중...');
  const studentsSnap = await db.collection('schools').doc(schoolId).collection('students').get();
  console.log(`   현재 학생 수: ${studentsSnap.size}명\n`);

  if (studentsSnap.size === 0) {
    console.log('⚠️  학생 데이터가 없습니다. 마이그레이션을 건너뜁니다.\n');
    return;
  }

  // 2. 샘플 데이터 확인
  console.log('📋 샘플 데이터 (첫 5명):');
  studentsSnap.docs.slice(0, 5).forEach((doc, i) => {
    const data = doc.data();
    console.log(`   ${i+1}. ID: ${doc.id} | 이름: ${data.name} | 학번: ${data.studentId || 'N/A'}`);
  });
  console.log();

  // 3. Workspace User ID 확인을 위한 로직
  console.log('🔍 Workspace User ID 확인 중...');

  // Secret Manager에서 Workspace 키 가져오기
  const secretClient = new SecretManagerServiceClient();
  const SECRET_NAME = 'projects/seonyoo-system/secrets/workspace-sync-key/versions/latest';

  let workspaceKey;
  try {
    const [version] = await secretClient.accessSecretVersion({ name: SECRET_NAME });
    workspaceKey = JSON.parse(version.payload.data.toString('utf8'));
    console.log('   ✓ Workspace API 인증 성공\n');
  } catch (error) {
    console.error('   ❌ Workspace API 인증 실패:', error.message);
    return;
  }

  // 4. Workspace 설정 가져오기
  const schoolDoc = await db.collection('schools').doc(schoolId).get();
  const workspaceSync = schoolDoc.data()?.workspaceSync;

  if (!workspaceSync?.enabled || !workspaceSync.studentOuPath) {
    console.error('   ❌ Workspace 동기화가 설정되지 않았습니다.');
    return;
  }

  console.log(`   Student OU Path: ${workspaceSync.studentOuPath}`);
  console.log(`   Admin Email: ${workspaceSync.adminEmail}\n`);

  // 5. Workspace API로 학생 목록 가져오기
  const auth = new google.auth.JWT({
    email: workspaceKey.client_email,
    key: workspaceKey.private_key,
    scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
    subject: workspaceSync.adminEmail,
  });
  await auth.authorize();

  const directory = google.admin({ version: 'directory_v1', auth });

  console.log('📥 Workspace에서 학생 목록 가져오는 중...');
  let workspaceStudents = [];
  let pageToken;

  do {
    const res = await directory.users.list({
      customer: 'my_customer',
      query: `orgUnitPath='${workspaceSync.studentOuPath}'`,
      maxResults: 500,
      pageToken,
    });
    workspaceStudents = workspaceStudents.concat(res.data.users || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  workspaceStudents = workspaceStudents.filter(u => !u.suspended && !u.archived);
  console.log(`   Workspace 학생 수: ${workspaceStudents.length}명\n`);

  // 6. 매핑 확인
  console.log('🔗 학번 → Workspace User ID 매핑:');
  const emailToWorkspaceId = new Map();

  workspaceStudents.forEach(user => {
    emailToWorkspaceId.set(user.primaryEmail.toLowerCase(), user.id);
  });

  // 기존 Firestore 학생 데이터와 매칭
  let matched = 0;
  let unmatched = 0;
  const unmatchedStudents = [];

  for (const doc of studentsSnap.docs) {
    const data = doc.data();
    const email = data.email?.toLowerCase();

    if (email && emailToWorkspaceId.has(email)) {
      matched++;
    } else {
      unmatched++;
      unmatchedStudents.push({ id: doc.id, name: data.name, email: email || 'N/A' });
    }
  }

  console.log(`   ✓ 매칭 성공: ${matched}명`);
  console.log(`   ⚠️  매칭 실패: ${unmatched}명\n`);

  if (unmatched > 0) {
    console.log('⚠️  매칭 실패 학생 목록 (첫 10명):');
    unmatchedStudents.slice(0, 10).forEach((s, i) => {
      console.log(`   ${i+1}. ${s.name} (${s.email}) - 문서 ID: ${s.id}`);
    });
    console.log();
  }

  if (dryRun) {
    console.log('✅ Dry-run 완료! 실제 데이터는 변경되지 않았습니다.\n');
    console.log('실제 마이그레이션을 실행하려면:');
    console.log('  node run-migration.js false\n');
    return;
  }

  // 7. 실제 마이그레이션 실행
  console.log('🚀 실제 마이그레이션 시작...\n');

  let migrated = 0;
  let failed = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of studentsSnap.docs) {
    const data = doc.data();

    // 이미 마이그레이션된 문서는 건너뛰기
    if (data.migratedAt) {
      console.log(`   [SKIP] ${doc.id}: 이미 마이그레이션됨`);
      continue;
    }

    const email = data.email?.toLowerCase();

    if (!email || !emailToWorkspaceId.has(email)) {
      failed++;
      continue;
    }

    const workspaceUserId = emailToWorkspaceId.get(email);
    const newRef = db.collection('schools').doc(schoolId).collection('students').doc(workspaceUserId);

    // workspaceUserId가 문서 ID가 되도록 새 문서 생성
    batch.set(newRef, {
      ...data,
      workspaceUserId,
      fullStudentId: `${data.year || ''}${data.studentId || ''}`,
      migratedAt: FieldValue.serverTimestamp(),
    });

    // 기존 문서를 백업으로 이동
    const backupRef = db.collection('schools').doc(schoolId).collection('_migrated_students_backup').doc(doc.id);
    batch.set(backupRef, {
      ...data,
      originalId: doc.id,
      migratedAt: FieldValue.serverTimestamp(),
    });

    // 기존 문서 삭제
    batch.delete(doc.ref);

    migrated++;
    batchCount++;

    // 500개마다 커밋 (Firestore 제한)
    if (batchCount >= 500) {
      await batch.commit();
      console.log(`   진행 중... ${migrated}명 마이그레이션 완료`);
      batch = db.batch(); // 새 배치 생성
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`\n✅ 마이그레이션 완료!`);
  console.log(`   성공: ${migrated}명`);
  console.log(`   실패: ${failed}명`);
  console.log(`   백업 위치: schools/${schoolId}/_migrated_students_backup\n`);
}

// 실행
const dryRun = process.argv[2] !== 'false';
migrateStudents(dryRun)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  });
