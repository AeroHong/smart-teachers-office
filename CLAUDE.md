# 선유고 스마트 교무실 - Claude Code 프로젝트 지침

## 프로젝트 개요
선유고등학교 교무 업무 통합 관리 시스템.
**보강 신청 시스템**과 **스마트 출결 시스템** 두 가지 주요 모듈로 구성.

### 주요 모듈
- **보강 신청 시스템** (`/cover/*`) - 교사 결강 시 보강 신청/승인 관리 → [상세 문서](./SUBSTITUTE.md)
- **스마트 출결 시스템** (`/attendance/*`) - QR 기반 실시간 출결 관리 → [상세 문서](./ATTENDANCE.md)

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 + Vite |
| 라우팅 | react-router-dom v6 |
| DB | Firebase Firestore |
| 인증 | Firebase Authentication |
| 호스팅 | Firebase Hosting |
| Functions | Firebase Cloud Functions |
| QR 생성 | qrcode.react |
| 스타일링 | MUI (Material-UI) + Inline Styles |

---

## 디렉토리 구조

```
선유고 스마트 교무실/
├── CLAUDE.md              # 본 파일 (전체 프로젝트 개요)
├── ATTENDANCE.md          # 스마트 출결 시스템 상세
├── SUBSTITUTE.md          # 보강 신청 시스템 상세
├── .claude/
│   └── settings.json
├── firebase.json
├── .firebaserc
├── firestore.rules
├── firestore.indexes.json
├── functions/             # Firebase Cloud Functions
│   ├── index.js
│   └── package.json
├── apps/
│   └── portal/
│       ├── src/
│       │   ├── main.jsx
│       │   ├── App.jsx
│       │   ├── lib/
│       │   │   └── firebase.js
│       │   ├── contexts/
│       │   │   └── AuthContext.jsx
│       │   ├── pages/
│       │   │   ├── Home.jsx
│       │   │   ├── Login.jsx
│       │   │   ├── attendance/      # 출결 시스템 페이지
│       │   │   └── cover/           # 보강 시스템 페이지
│       │   └── components/
│       │       ├── Layout.jsx
│       │       └── QRDisplay.jsx
│       └── vite.config.js
└── portal/                # 빌드 결과물 (Firebase Hosting)
```

---

## Firestore 컬렉션 구조 (공통)

```
/schools/{schoolId}
  - name, createdAt
  /teachers/{uid}             ← Firebase Auth UID
    - name, email, role, department, subject
  /students/{studentId}
    - studentId(학번), name, grade, class, number
  /studentGroups/{groupId}    ← 출결 시스템용
    - name, studentIds[]
  /events/{eventId}           ← 출결 시스템용
  /coverRequests/{requestId}  ← 보강 시스템용
```

선유고 schoolId: `seonyoo-hs`

---

## 공통 라우트

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/` | Home | 메인 대시보드 (출결/보강 선택) |
| `/login` | Login | 교사 로그인 (Firebase Auth) |
| `/attendance/*` | - | 출결 시스템 라우트 |
| `/cover/*` | - | 보강 시스템 라우트 |

---

## 코딩 컨벤션

- **변수/함수명**: camelCase
- **컴포넌트명**: PascalCase
- **주석**: 한글 허용
- **Firebase 접근**: 항상 `apps/portal/src/lib/firebase.js`의 `auth`, `db` import
- **환경변수**: `import.meta.env.VITE_*` 형태, 코드에 하드코딩 금지
- **에러 처리**: try/catch + 사용자 친화적 메시지
- **스타일**: MUI 컴포넌트 우선, 필요시 inline styles 사용

---

## 개발 워크플로우

### 로컬 개발
```bash
cd apps/portal
npm run dev
```

### 빌드 및 배포
```bash
cd apps/portal
npm run build
cd ../..
firebase deploy
```

### Functions 배포
```bash
firebase deploy --only functions
```

---

## 에이전트 활용 가이드

| 상황 | 권장 에이전트 |
|------|--------------|
| 파일/패턴 탐색 | Explore |
| 새 기능 설계 전 | Plan |
| 페이지/컴포넌트 구현 | general-purpose |
| 병렬 구현 | general-purpose × N (background) |

---

## 참고 사항

- **멀티테넌트 구조**: 향후 다른 학교 확장 가능하도록 `/schools/{schoolId}` 기반 설계
- **보안**: Firestore Rules로 교사/학생 권한 분리
- **실시간 데이터**: Firestore `onSnapshot`으로 실시간 구독
- **Cloud Functions**: 자동 출석 마감, 알림 발송 등
