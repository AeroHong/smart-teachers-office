# 선유고 스마트 교무실 - Claude Code 프로젝트 지침

## 프로젝트 개요
선유고등학교에서 시작한 교무 업무 통합 관리 시스템. 멀티테넌트(`/schools/{schoolId}`) 구조라 다른 학교도 같은 시스템을 쓸 수 있다.
처음에는 보강·출결 두 모듈이었고, 지금은 아래 앱 여러 개와 포털 모듈로 늘어났다.

### 앱 구성 (`apps/`)

| 앱 | 역할 | 호스팅 타깃 → 사이트 |
|----|------|------|
| `apps/portal` | 교무 포털 — 출결·보강·연수·평가·세특·검인정·도구 등 업무 모듈, 관리자 | `seonyoo` → seonyoo-system, `smart-school` → smart-school-kr |
| `apps/dashboard` | 업무 메신저 — 채널·캔버스·DM·알림·학사일정·구성원·보강 | `dashboard` → smart-school-dashboard |
| `apps/desktop` | Electron 데스크톱 앱 — dashboard를 감싼 트레이 상주 셸, OS 알림, 재실 감지, 자동 업데이트 | `desktop-updates` → smart-school-updates |
| `apps/kiosk` | 교무실 앞 선생님 호출 키오스크 | `kiosk` → smart-school-kiosk |
| `apps/shared` | 공용 코드 — `lib/firebase.js`, `contexts/AuthContext`, 순수 로직(`lib/*.js` + `*.test.js`), 테마 | — |

그 밖에: `functions/`(Node Cloud Functions), `functions-python/`(QR 안내문 파이프라인), `tools/`(일회성 스크립트·로컬 도구), `tests/`(Firestore 규칙 테스트), `manual/`(교사용 매뉴얼 원본 → `portal/manual/`로 복사).
StudentHub(학적·고사)·ExamCore(고사 업무)는 **별도 저장소의 앱**이며, 이 프로젝트는 연동 스키마·보안 규칙·`/studenthub`·`/examcore` 이동 페이지만 가진다(호스팅 타깃 `studenthub`, `examcore`).

### 포털 모듈 (`apps/portal/src/pages/`)

| 경로 | 모듈 | 상세 문서 |
|------|------|-----------|
| `/attendance/*` | 스마트 출결 — QR 체크인, 교시별 버튼 출석, 공동 담당교사 | [ATTENDANCE.md](./ATTENDANCE.md) |
| `/cover/*` | 보강 신청 (대시보드에도 같은 컬렉션을 쓰는 화면 있음) | [SUBSTITUTE.md](./SUBSTITUTE.md) |
| `/training/*` | 연수 서명부 | [TRAINING.md](./TRAINING.md) |
| `/notices`, `/student` | 학생 공지·학생 포털 | ATTENDANCE.md |
| `/evalplan/*` | 교수학습 및 평가 운영 계획 제출·현황 | — |
| `/setuk/*` | 생기부 세특 점검 + 과목별 학생 메일 발송 | `pages/setuk/data/README.md` |
| `/textbook/*` | 검·인정도서 선정(채점·서식1~3·학운위 자료) | — |
| `/academic-plan/*` | 학사일정 만들기 — 초안 협업 편집·수업일수 자동 계산·초안 비교·확정·A4 인쇄·구글 캘린더 반영 | DB_STRUCTURE.md `academicPlans` |
| `/emails/*` | 교사 → 학생 이메일 발송(Gmail API 도메인 위임, 예약 발송) | — |
| `/tools/*` | 도구모음 — 성취평가제 체크리스트, ASA-support, 최소성취수준, 내신등급 계산기, QR 안내문, PDF 출력자 정보 지우기 | — |
| `/admin/*` | 학교 관리자 — 계정·교직원·학생·과목·공간·학사일정·검인정 설정 등 | [ADMIN_STRUCTURE.md](./ADMIN_STRUCTURE.md) |
| `/super-admin/*` | 시스템 관리자 — 학교·도메인·게스트 학교 | [SECURITY.md](./SECURITY.md) |

라우트의 실제 목록은 `apps/portal/src/App.jsx`, `apps/dashboard/src/App.jsx`가 기준이다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 + Vite (앱마다 `apps/*/vite.config.js`) |
| 라우팅 | react-router-dom v6 |
| DB / 인증 / 저장소 | Firebase Firestore · Authentication(Google) · Storage |
| 서버 | Firebase Cloud Functions (Node, 일부 Python) |
| 호스팅 | Firebase Hosting — 타깃 7개(`.firebaserc`) |
| 데스크톱 | Electron + electron-builder + electron-updater (자체 서명 코드사인) |
| 스타일링 | MUI + inline styles, 공통 테마 `apps/shared/theme.js` |

---

## 문서 색인

| 문서 | 내용 |
|------|------|
| [DB_STRUCTURE.md](./DB_STRUCTURE.md) | **Firestore 컬렉션·필드의 단일 기준.** 스키마를 바꾸면 여기를 같이 고친다 |
| [ROADMAP.md](./ROADMAP.md) | 아직 안 한 일·보류 아이디어 모음 |
| [CHANGELOG.md](./CHANGELOG.md) | 월별 변경 이력 |
| [SECURITY.md](./SECURITY.md) | 인증·가입 승인 설계, 보안 규칙 원칙 |
| ATTENDANCE / SUBSTITUTE / TRAINING / ADMIN_STRUCTURE.md | 모듈별 상세 |
| `docs/` | 타 학교 컨설팅 자료, DB 공유본, 논의 기록 |
| `docs/archive/` | 끝났거나 폐기된 계획 문서. **소스 주석의 `PLAN_*.md §n` 참조는 여기에 있다** — [색인](./docs/archive/README.md) |
| `manual/` | 교사용 사용 매뉴얼(md + html) |

---

## 코딩 컨벤션

- **변수/함수명**: camelCase / **컴포넌트명**: PascalCase / **주석**: 한글
- **Firebase 접근**: 항상 `@shared/lib/firebase`(`apps/shared/lib/firebase.js`)의 `auth`, `db` import
- **순수 로직은 `apps/shared/lib/*.js`에, 테스트는 옆에 `*.test.js`** — Firestore I/O는 각 앱의 `lib/`(예: `apps/dashboard/src/lib/*Actions.js`)
- **환경변수**: `import.meta.env.VITE_*`, 코드에 하드코딩 금지. 다른 PC에서 빌드할 때 `.env` 누락 주의
- **에러 처리**: try/catch + 사용자 친화적 메시지
- **스타일**: MUI 컴포넌트 우선, 필요시 inline styles
- **Firestore 읽기 비용**: 컬렉션 전체 스캔·N² 구독은 금지(과거 하루 수천만 건 읽기 사고 — f786303, 3ec07ab, 3083418)

---

## 개발 워크플로우

모든 명령은 저장소 루트에서 실행한다(`package.json` scripts).

```bash
npm run dev               # 포털
npm run dev:dashboard     # 업무 메신저
npm run dev:kiosk         # 키오스크
npm run dev:desktop       # Electron (dashboard 배포본을 띄움)

npm test                  # 순수 로직 테스트 (apps/**/*.test.js)
npm run test:rules        # Firestore 보안 규칙 테스트 (에뮬레이터)

npm run deploy            # 포털 빌드 + hosting:seonyoo,smart-school
npm run deploy:dashboard  # 대시보드 빌드 + hosting:dashboard
npm run deploy:kiosk
npm run release:desktop   # 데스크톱 빌드 + hosting:desktop-updates (서명 빌드는 apps/desktop의 release:signed)

firebase deploy --only functions
firebase deploy --only firestore:rules
```

빌드 산출물 `portal/`, `dashboard/`, `kiosk/`의 `index.html`은 커밋 대상이고 `assets/`는 무시된다.

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

- **멀티테넌트**: 모든 학교 데이터는 `/schools/{schoolId}` 아래. 선유고 schoolId는 `seonyoo-hs`
- **역할**: 시스템 관리자(`super_admin`, 토큰 클레임 `superAdmin`) · `school_admin`/`admin` · `headmaster`(교장) · `principal`(교감) · `teacher`(staffType으로 강사 구분) · `student` · `pending`/`rejected` — 소속·직군은 커스텀 클레임으로도 심는다(`syncUserClaims`)
- **보안**: Firestore Rules가 클라이언트 직접 접근 모델의 핵심. 규칙을 바꾸면 `npm run test:rules`
- **실시간 데이터**: `onSnapshot` 구독, 범위를 좁혀서
- **교내망**: `firebaseapp.com`이 차단돼 authDomain을 접속한 `.web.app` 호스트로 쓴다(`apps/shared/lib/firebase.js`)
