# 보강 신청 시스템 - 상세 문서

## 개요
교사 결강 시 보강 신청 및 승인 관리 시스템.
교사가 결강 사유와 보강 방식을 입력하면, 관리자가 승인/반려하여 보강 일정을 관리합니다.

---

## 주요 기능

### 1. 보강 신청
- **결강 정보 입력**: 날짜, 교시, 과목, 반
- **보강 방식 선택**:
  - 자습 (감독 교사 지정)
  - 과제 제출
  - 대체 수업 (보강 일시 지정)
- **사유 입력**: 결강 사유 자유 기재
- **첨부 파일**: 증빙 서류 업로드 (선택)

### 2. 보강 관리 (관리자)
- **신청 목록**: 대기/승인/반려 상태별 필터링
- **승인/반려**: 버튼 클릭으로 즉시 처리
- **반려 사유 입력**: 반려 시 사유 필수 입력
- **보강 현황 조회**: 기간별/교사별 통계

### 3. 마이페이지
- **내 신청 내역**: 상태별 조회
- **승인/반려 알림**: 실시간 알림 (계획 중)

---

## Firestore 컬렉션 구조

```
/schools/seonyoo-hs/
  /coverRequests/{requestId}
    - teacherId: "teacher-uid"
    - teacherName: "김선생"
    - department: "국어"
    - subject: "국어"

    - absenceDate: "2025-04-15"
    - absencePeriod: 3
    - absenceClass: "1-1"
    - absenceReason: "개인 사유"

    - coverType: "자습" | "과제" | "대체수업"
    - supervisorId: "teacher-uid-2" (자습인 경우)
    - supervisorName: "박선생" (자습인 경우)
    - assignmentDetails: "교과서 50-60쪽 문제 풀기" (과제인 경우)
    - coverDate: "2025-04-16" (대체수업인 경우)
    - coverPeriod: 4 (대체수업인 경우)

    - status: "pending" | "approved" | "rejected"
    - rejectionReason: "..." (반려인 경우)
    - processedBy: "admin-uid" (승인/반려 처리자)
    - processedAt: Timestamp (승인/반려 시각)

    - createdAt: Timestamp
    - updatedAt: Timestamp

    - attachments: [ (선택)
        { name: "file.pdf", url: "https://...", uploadedAt: Timestamp }
      ]
```

---

## 라우트 구조

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/cover` | CoverMain | 보강 신청 양식 |
| `/cover/status` | CoverStatus | 보강 현황 조회 (관리자) |
| `/cover/mypage` | CoverMypage | 내 신청 내역 |

---

## 주요 컴포넌트

### CoverMain.jsx
- **기능**: 보강 신청 양식
- **특징**:
  - 다단계 폼 (결강 정보 → 보강 방식 → 제출)
  - 보강 방식별 동적 필드 표시
  - 파일 업로드 (Firebase Storage)
  - 실시간 유효성 검사

### CoverStatus.jsx
- **기능**: 보강 현황 관리 (관리자 전용)
- **특징**:
  - 상태별 탭 (대기/승인/반려)
  - 승인/반려 모달
  - 교사별/기간별 필터링
  - 엑셀 내보내기 (계획 중)

### CoverMypage.jsx
- **기능**: 내 신청 내역 조회
- **특징**:
  - 상태별 필터링
  - 신청 취소 (대기 상태만)
  - 반려 사유 확인

---

## 비즈니스 로직

### 승인 프로세스
1. 교사가 보강 신청 제출 (`status: "pending"`)
2. 관리자가 승인/반려 처리
   - 승인: `status: "approved"`, `processedBy`, `processedAt` 기록
   - 반려: `status: "rejected"`, `rejectionReason` 필수 입력
3. 알림 발송 (계획 중)

### 권한 관리
- **일반 교사**: 신청 생성, 본인 신청 조회
- **관리자** (`role: "admin"`): 모든 신청 조회/승인/반려

---

## UI/UX 특징

### 보강 방식별 UI
- **자습**: 감독 교사 선택 드롭다운
- **과제**: 과제 내용 텍스트 에리어
- **대체수업**: 보강 날짜 + 교시 선택

### 상태 배지
- **대기**: 노란색 (`pending`)
- **승인**: 초록색 (`approved`)
- **반려**: 빨간색 (`rejected`)

### 반응형 레이아웃
- 모바일: 세로 스택 레이아웃
- PC: 2열 카드 그리드

---

## 개발 가이드

### 새 보강 방식 추가
1. `CoverMain.jsx`에서 `coverType` 옵션 추가
2. 보강 방식별 입력 필드 추가
3. Firestore 스키마 업데이트 (필드 추가)
4. `CoverStatus.jsx`에서 표시 로직 추가

### 알림 기능 추가
1. Cloud Functions 작성 (`onUpdate` 트리거)
2. Firebase Cloud Messaging 설정
3. 프론트엔드에서 FCM 토큰 저장
4. `teachers` 컬렉션에 `fcmToken` 필드 추가

### 파일 업로드 개선
1. Firebase Storage Rules 설정
2. 파일 크기/타입 제한
3. 업로드 진행률 표시
4. 썸네일 생성 (이미지인 경우)

---

## Cloud Functions (계획)

### onCoverRequestUpdate
- **트리거**: `coverRequests/{requestId}` 변경
- **기능**: 승인/반려 시 신청자에게 알림 발송

### dailyCoverSummary
- **트리거**: 매일 오전 8시 (Scheduled)
- **기능**: 당일 보강 일정 요약 이메일 발송

---

## 알려진 이슈 & TODO

- [ ] 파일 업로드 기능 구현
- [ ] 승인/반려 알림 (FCM)
- [ ] 엑셀 내보내기
- [ ] 통계 차트 (월별 보강 현황)
- [ ] 반복 결강 일괄 신청 기능
- [ ] 보강 일정 달력 뷰
- [ ] 교사별 보강 횟수 제한 설정
