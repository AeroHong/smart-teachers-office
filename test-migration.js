const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require('firebase/functions');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyBlO_zACdIqnSjPF_VhqhRj2VGKQk5hx3c",
  authDomain: "seonyoo-system.firebaseapp.com",
  projectId: "seonyoo-system",
  storageBucket: "seonyoo-system.firebasestorage.app",
  messagingSenderId: "925668457098",
  appId: "1:925668457098:web:f85bd6c0a8f1d8b9e7b0e3"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'asia-northeast3');
const auth = getAuth(app);

async function runMigration() {
  try {
    // 로그인
    console.log('로그인 중...');
    const userCredential = await signInWithEmailAndPassword(auth, 'hckgood@seonyoo.hs.kr', process.argv[2]);
    console.log('✓ 로그인 성공:', userCredential.user.email);

    // 마이그레이션 함수 호출
    console.log('\n마이그레이션 dry-run 실행 중...');
    const migrateStudents = httpsCallable(functions, 'migrateStudentsToWorkspaceId');

    const result = await migrateStudents({
      schoolId: 'seonyoo-hs',
      dryRun: true
    });

    console.log('\n✅ Dry-run 완료:');
    console.log(JSON.stringify(result.data, null, 2));

  } catch (error) {
    console.error('❌ 에러 발생:', error.message);
    if (error.code) console.error('   Code:', error.code);
    if (error.details) console.error('   Details:', error.details);
  }
}

runMigration();
