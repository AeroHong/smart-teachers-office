# 스마트 출결 시스템 - 상세 문서

## 개요
QR 코드 기반 실시간 출결 관리 시스템.
교사가 이벤트(조회, 수업, 방과후, 행사 등)를 생성하고 QR 코드를 통해 학생 출석을 실시간으로 관리합니다.

---

## 주요 기능

### 1. 이벤트 관리
- **이벤트 생성**: 조회, 수업, 방과후, 행사, 기타 유형 지원
- **반복 이벤트**: 요일별 스케줄 설정 (예: 매주 화·목 3교시)
- **학생 그룹 연결**: 특정 반/그룹만 출석 체크
- **지각 시간 설정**: 조회 이벤트의 경우 지각 기준 시간 설정

### 2. 출석 체크
- **QR 출석**: 학생이 QR 코드 스캔으로 자동 출석
- **수동 출석**: 교사가 미출석 학생 수동 체크
- **실시간 현황**: Firestore 실시간 구독으로 즉시 반영
- **출석률 계산**: 자동 계산 및 프로그레스 바 표시

### 3. 라이브 세션 (수업/방과후/행사)
- **출석 시작/마감**: 버튼으로 QR 코드 활성화/비활성화
- **임시 토큰**: 세션마다 고유 토큰 생성

### 4. 미출석 관리
- **사유 등록**: 질병결석, 조퇴, 지각 등 프리셋 + 직접 입력
- **자동 처리**: Cloud Functions로 이벤트 종료 시 미출석 자동 기록

### 5. 출결 현황 대시보드
- **달력 뷰**: 반복 이벤트의 과거 출결 기록 조회
  - 2개월 슬라이드 캘린더 (PC 1200px 이상)
  - 1개월 슬라이드 캘린더 (모바일/작은 화면)
  - 이벤트 요일만 선택 가능 (허용된 요일 필터링)
- **3열 드래그 리사이즈**: QR 패널, 출석 목록, 미출석 목록 너비 조정

---

## Firestore 컬렉션 구조

```
/schools/seonyoo-hs/
  /studentGroups/{groupId}
    - name: "1학년 1반"
    - studentIds: ["2024001", "2024002", ...]
    - createdAt: Timestamp

  /events/{eventId}
    - name: "조회"
    - type: "조회" | "수업" | "방과후" | "행사" | "기타"
    - studentGroupId: "group123"
    - isRecurring: true
    - schedules: [
        { dayOfWeek: 2, period: 1, startTime: "08:30", endTime: "09:00" },
        { dayOfWeek: 4, period: 1, startTime: "08:30", endTime: "09:00" }
      ]
    - location: "각 교실"
    - qrToken: "uuid-..."
    - liveToken: "uuid-..." (라이브 세션용, nullable)
    - lateCheckTime: "08:40" (조회 전용)
    - createdBy: "teacher-uid"
    - createdAt: Timestamp

    /attendanceLogs/{logId}
      - studentId: "2024001"
      - studentName: "홍길동"
      - grade: 1
      - class: 1
      - number: 5
      - checkedAt: Timestamp
      - method: "QR" | "manual" | "absent"
      - qrToken: "uuid-..."
      - late: true (조회 전용, 지각 여부)
      - reason: "질병결석" (method=absent인 경우)
```

---

## 라우트 구조

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/attendance` | TeacherDashboard | 이벤트 목록 |
| `/attendance/create` | EventCreate | 이벤트 생성 |
| `/attendance/:eventId/edit` | EventEdit | 이벤트 수정 |
| `/attendance/:eventId` | AttendanceDashboard | 출결 현황 (QR + 출석/미출석 목록) |
| `/attendance/checkin/:schoolId/:eventId` | StudentCheckin | 학생 QR 체크인 (인증 불필요) |
| `/attendance/stats` | StatsDashboard | 통계 대시보드 |
| `/attendance/students` | StudentList | 학생 목록 관리 |
| `/attendance/admin` | Admin | 학생 그룹 관리 |

---

## 주요 컴포넌트

### AttendanceDashboard.jsx
- **기능**: 실시간 출결 현황 + QR 출석 + 미출석 관리
- **특징**:
  - 반응형 달력 (2개월/1개월 자동 전환)
  - 이벤트 요일 기반 날짜 필터링
  - 3열 드래그 리사이즈 레이아웃
  - 실시간 Firestore 구독
  - 라이브 세션 관리 (수업/방과후/행사)

### EventCreate.jsx / EventEdit.jsx
- **기능**: 이벤트 생성/수정
- **특징**:
  - 반복 일정 설정 (요일 + 교시 + 시간)
  - 학생 그룹 선택
  - 지각 시간 설정 (조회 전용)

### StudentCheckin.jsx
- **기능**: 학생 QR 체크인 페이지
- **특징**:
  - URL 파라미터로 schoolId, eventId, token 전달
  - Firebase Auth 불필요 (공개 페이지)
  - 중복 체크인 방지

### QRDisplay.jsx
- **기능**: QR 코드 생성 및 표시
- **특징**:
  - qrcode.react 사용
  - 체크인 URL 자동 생성

---

## Cloud Functions

### autoCloseAttendance
- **트리거**: 매일 자정 (Scheduled Function)
- **기능**: 종료된 이벤트의 미출석 학생 자동 기록
- **로직**:
  1. 오늘 종료된 이벤트 조회
  2. 학생 그룹 대비 미출석 학생 확인
  3. `method: 'absent', reason: '미출석 자동처리'` 로그 생성

---

## UI/UX 특징

### 반응형 달력
- **PC (≥1200px)**: 2개월 나란히 표시 (지난달 + 이번달)
- **모바일/작은 화면**: 1개월만 표시
- **좌우 화살표**: 월 이동 네비게이션
- **날짜 필터링**: 이벤트 요일만 활성화, 나머지는 회색 + 비활성
- **하단 정렬**: 헤더+통계바와 달력 하단 라인 맞춤

### 드래그 리사이즈
- **QR 패널 / 출석 목록 / 미출석 목록** 3개 열 너비 조정 가능
- sticky 드래그 핸들 (QR 코드 중앙 고정)

### 실시간 업데이트
- Firestore `onSnapshot`으로 출석 로그 실시간 구독
- 출석/미출석 목록 즉시 반영

---

## 개발 가이드

### 새 이벤트 타입 추가
1. `EventCreate.jsx`에서 type 옵션 추가
2. 필요시 타입별 추가 필드 설정
3. `AttendanceDashboard.jsx`에서 타입별 UI 로직 추가

### 새 출석 방법 추가
1. `StudentCheckin.jsx`에서 체크인 로직 추가
2. `attendanceLogs`의 `method` 필드에 새 값 추가
3. `AttendanceDashboard.jsx`에서 메소드별 배지 스타일 추가

### 통계 기능 확장
1. `StatsDashboard.jsx` 수정
2. Firestore 쿼리 최적화 (인덱스 추가)
3. 차트 라이브러리 추가 시 `package.json` 업데이트

---

## 알려진 이슈 & TODO

- [ ] 엑셀 내보내기 기능
- [ ] 학생 일괄 업로드 (CSV/Excel)
- [ ] 출석 통계 차트 (월별/주별)
- [ ] 알림 기능 (미출석 학생 자동 알림)
- [ ] 다크 모드 지원
