# 스마트 출결 시스템 - Claude Code 프로젝트 지침

## 프로젝트 개요
이벤트 기반 스마트 출결 시스템.
교사가 이벤트를 생성하고 QR 코드를 통해 학생 출결을 실시간으로 관리한다.
선유고등학교 전용으로 시작, 학교 단위 멀티테넌트 확장 가능 구조.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 + Vite |
| 라우팅 | react-router-dom v6 |
| DB | Firebase Firestore |
| 인증 | Firebase Authentication |
| 호스팅 | Firebase Hosting |
| QR 생성 | qrcode.react |
| 백엔드 서버 | 없음 (Firebase SDK 직접 통신) |

---

## 디렉토리 구조

```
출석체크 프로젝트/
├── CLAUDE.md
├── .claude/settings.json
├── firebase.json              # Hosting + Firestore 설정
├── .firebaserc                # Firebase 프로젝트 연결
├── firestore.rules            # 보안 규칙
├── firestore.indexes.json
├── package.json
├── vite.config.js
├── .env                       # Firebase config (gitignore 대상)
├── .env.example
├── public/
│   └── index.html
└── src/
    ├── main.jsx
    ├── App.jsx                # 라우터 정의
    ├── lib/
    │   └── firebase.js        # Firebase 초기화 (auth, db export)
    ├── pages/
    │   ├── Login.jsx          # Firebase Auth 로그인
    │   ├── TeacherDashboard.jsx  # 실시간 출결 현황
    │   ├── EventCreate.jsx    # 이벤트 생성 + QR 발급
    │   └── StudentCheckin.jsx # QR 스캔 후 출석 처리
    ├── components/
    │   ├── AttendanceTable.jsx
    │   └── QRDisplay.jsx
    └── hooks/                 # 커스텀 훅 (Firestore 구독 등)
```

---

## Firestore 컬렉션 구조

```
/schools/{schoolId}
  - name, createdAt
  /teachers/{uid}             ← Firebase Auth UID
    - name, email, role
  /students/{studentId}
    - studentId(학번), name, email, group(반)
  /events/{eventId}
    - name, type, targetGroup
    - startTime, endTime, location, description
    - createdBy(teacherUID), qrToken
    /attendanceLogs/{logId}
      - studentId, checkedAt, method(QR/manual), qrToken
```

선유고 schoolId: `seonyoo-hs`

---

## 라우트 구조

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/login` | Login | 교사 로그인 |
| `/` | TeacherDashboard | 실시간 출결 현황 |
| `/events/new` | EventCreate | 이벤트 생성 |
| `/checkin/:schoolId/:eventId` | StudentCheckin | 학생 출석 (인증 불필요) |

---

## 코딩 컨벤션

- **변수/함수명**: camelCase
- **컴포넌트명**: PascalCase
- **주석**: 한글 허용
- **Firebase 접근**: 항상 `src/lib/firebase.js`의 `auth`, `db` import
- **환경변수**: `import.meta.env.VITE_*` 형태, 코드에 하드코딩 금지
- **에러 처리**: try/catch + 사용자 친화적 메시지

---

## 에이전트 역할 분담

| 상황 | 에이전트 |
|------|---------|
| 파일/패턴 탐색 | Explore |
| 새 기능 설계 전 | Plan |
| 페이지/컴포넌트 구현 | general-purpose |
| 병렬 구현 필요 시 | general-purpose × N (background) |
