# Phase 1A 마이그레이션 가이드

## 개요
학생 데이터를 5자리 학번 기반에서 Google Workspace User ID 기반으로 전환하여 진급 시에도 데이터 연속성을 확보합니다.

## 마이그레이션 순서

### 1단계: 사전 준비 (필수)

#### 1.1 데이터 백업
```bash
# Firestore 데이터 백업 (Firebase Console)
# 또는 gcloud 명령어 사용
gcloud firestore export gs://seonyoo-system-backup/$(date +%Y%m%d)
```

#### 1.2 코드 배포
```bash
cd apps/portal
npm run build
cd ../..
firebase deploy --only functions,hosting
```

### 2단계: 학생 데이터 마이그레이션

#### 2.1 시뮬레이션 (dryRun)
```bash
curl -X POST https://asia-northeast3-seonyoo-system.cloudfunctions.net/migrateStudentsToWorkspaceId \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "schoolId": "seonyoo-hs",
      "dryRun": true
    }
  }'
```

**출력 확인 사항:**
- 총 학생 수
- 마이그레이션될 학생 수
- Workspace에서 찾을 수 없는 학생 (이메일 확인 필요)

#### 2.2 실제 마이그레이션
**시뮬레이션 결과를 확인한 후에만 실행하세요!**

```bash
curl -X POST https://asia-northeast3-seonyoo-system.cloudfunctions.net/migrateStudentsToWorkspaceId \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "schoolId": "seonyoo-hs",
      "dryRun": false
    }
  }'
```

**결과:**
- `schools/seonyoo-hs/students/{workspaceUserId}` - 새 문서 생성됨
- `schools/seonyoo-hs/_migrated_students_backup/{studentId}` - 백업 저장됨
- 기존 문서 삭제됨

#### 2.3 검증
Firebase Console에서 확인:
1. `schools/seonyoo-hs/students` 컬렉션 열기
2. 문서 ID가 긴 문자열 (Workspace User ID)인지 확인
3. 각 문서에 다음 필드가 있는지 확인:
   - `workspaceUserId`
   - `studentId` (5자리)
   - `fullStudentId` (9자리)
   - `admissionYear`
   - `emailHistory`

### 3단계: 학생 그룹 마이그레이션

#### 3.1 시뮬레이션
```bash
curl -X POST https://asia-northeast3-seonyoo-system.cloudfunctions.net/migrateStudentGroups \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "schoolId": "seonyoo-hs",
      "dryRun": true
    }
  }'
```

**출력 확인 사항:**
- 총 그룹 수
- 매핑될 그룹 수
- 매핑 실패 학생 ID (있다면 2단계 재확인 필요)

#### 3.2 실제 마이그레이션
```bash
curl -X POST https://asia-northeast3-seonyoo-system.cloudfunctions.net/migrateStudentGroups \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "schoolId": "seonyoo-hs",
      "dryRun": false
    }
  }'
```

**결과:**
- 각 그룹에 `workspaceUserIds` 필드 추가됨
- `studentIds` 필드는 하위 호환용으로 유지됨

### 4단계: 테스트

#### 4.1 학생 그룹 조회 테스트
1. `/attendance/student-list` 페이지 접속
2. 기존 그룹 클릭하여 학생 목록이 정상적으로 표시되는지 확인

#### 4.2 이벤트 생성/조회 테스트
1. `/attendance/event-create` 페이지에서 새 이벤트 생성
2. 학생 그룹 선택 시 정상 작동 확인
3. QR 출석 체크 테스트

#### 4.3 자동 결석 처리 테스트
1. 테스트 이벤트 생성 (종료 시간 5분 후로 설정)
2. 5분 대기 후 Cloud Functions 로그 확인
   ```bash
   firebase functions:log --only autoCloseAttendance
   ```
3. 미출석 학생이 자동 결석 처리되었는지 확인

### 5단계: Workspace 동기화 테스트

#### 5.1 수동 동기화 실행
관리자 페이지 > Workspace 동기화 탭 > "지금 동기화" 버튼 클릭

**확인 사항:**
- 신규 학생 추가됨
- 기존 학생 정보 갱신됨
- 아카이브된 학생 수 (Workspace에서 삭제된 학생)

#### 5.2 진급 시뮬레이션 (선택)
**주의: 테스트 환경에서만 수행하세요!**

1. Workspace 관리 콘솔에서 테스트 학생의 이메일 변경
   - 예: `202610101@seonyoo.hs.kr` → `202720215@seonyoo.hs.kr`
2. 수동 동기화 실행
3. Firestore에서 해당 학생 문서 확인:
   - 문서 ID는 그대로 (workspaceUserId)
   - `studentId`, `email`, `year`, `grade`, `class`, `number` 업데이트됨
   - `emailHistory`에 새 이메일 추가됨
   - `admissionYear`는 불변

## 롤백 방법

### 학생 데이터 롤백
**마이그레이션 후 24시간 이내에만 가능합니다!**

```bash
curl -X POST https://asia-northeast3-seonyoo-system.cloudfunctions.net/rollbackStudentsMigration \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "schoolId": "seonyoo-hs"
    }
  }'
```

**주의:**
- 백업에서 원본 복원
- 마이그레이션 후 추가된 데이터는 손실됨
- 롤백 후 다시 마이그레이션 시도 가능

## 문제 해결

### 문제: 일부 학생이 Workspace에서 찾을 수 없음
**원인:** 이메일 주소가 잘못되었거나 Workspace에서 삭제됨
**해결:**
1. 해당 학생의 Workspace 계정 확인
2. 이메일 주소 수정 후 재마이그레이션
3. 또는 수동으로 `workspaceUserId` 필드 추가

### 문제: 그룹 마이그레이션 시 매핑 실패
**원인:** 학생 마이그레이션이 완료되지 않았거나 일부 학생 누락
**해결:**
1. 2단계(학생 마이그레이션) 재확인
2. 누락된 학생 수동 추가 후 그룹 재마이그레이션

### 문제: 자동 결석 처리가 작동하지 않음
**원인:** Cloud Functions가 새 구조를 인식하지 못함
**해결:**
1. Functions 재배포 확인:
   ```bash
   firebase deploy --only functions
   ```
2. 최신 코드가 배포되었는지 Functions 로그 확인

## 체크리스트

- [ ] 데이터 백업 완료
- [ ] 코드 배포 완료
- [ ] 학생 마이그레이션 시뮬레이션 성공
- [ ] 학생 마이그레이션 실제 수행 완료
- [ ] 학생 데이터 검증 완료
- [ ] 학생 그룹 마이그레이션 시뮬레이션 성공
- [ ] 학생 그룹 마이그레이션 실제 수행 완료
- [ ] 학생 그룹 조회 테스트 통과
- [ ] 이벤트 생성/조회 테스트 통과
- [ ] 자동 결석 처리 테스트 통과
- [ ] Workspace 동기화 테스트 통과
- [ ] 진급 시뮬레이션 테스트 통과 (선택)

## 다음 단계

Phase 1A 완료 후:
1. **Phase 1B**: Admin.jsx 분해 (관리자 페이지 리팩토링)
2. **Phase 2**: 교사 과목 배정 + 출결 자동 생성
3. **Phase 3**: 고급 기능 (선택과목, 시수배당표, 시간표, 동아리)

## 지원

문제 발생 시:
1. Firebase Functions 로그 확인: `firebase functions:log`
2. Firestore 데이터 직접 확인 (Firebase Console)
3. 롤백 고려 (24시간 이내)
