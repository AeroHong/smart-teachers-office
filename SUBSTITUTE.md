# 보강 신청 시스템 - 상세 문서

> 2026-10-23 코드 기준으로 다시 썼다. 예전 문서의 "결강 교사가 신청 → 관리자 승인/반려" 모델은
> 실제로 구현된 적이 없다 — 실제는 **관리자가 보강 슬롯을 올리고 교사가 선착순으로 가져가는** 방식이다.

## 개요
관리자가 결강으로 생긴 보강 자리(날짜·교시·반·과목·결강 교사)를 등록하면, 교사들이 실시간 카드 목록에서
선착순으로 신청한다. 승인/반려 단계는 없다.

처음에는 Google Sheets + Apps Script(루트의 `Code.gs`)였고, v3.0(2026-05, b1fc635)에서 Firestore로 옮겼다.
같은 컬렉션을 두 화면이 함께 쓴다:
- **포털** `/cover/*` — `apps/portal/src/pages/cover/`
- **업무 메신저** `/cover/*` — `apps/dashboard/src/pages/Coverage.jsx` (2026-08-28, cd5e3f4). 신청을 `runTransaction`으로 처리해 동시 신청 경쟁 조건을 막는다

---

## 주요 기능

| 기능 | 누가 | 설명 |
|------|------|------|
| 일괄 등록 | 관리자 | 표 형식으로 여러 건 입력, 엑셀 붙여넣기 |
| 공개 예약 (`openAt`) | 관리자 | 지정 시각 전에는 "예정"으로 보이고 초 단위 카운트다운 (3484f71) |
| 신청 / 취소 | 교사 | 원클릭 신청 → `마감`, 취소하면 다시 `대기중`으로 돌아가 다른 교사에게 노출 |
| 보강교사 직접 지정 | 관리자 | 등록하면서 바로 담당 교사 지정 (f2cc6e5) |
| 수정 · 삭제 | 관리자 | 등록된 카드 직접 편집 |
| 카드 목록 범위 | — | 오늘부터 **4주(28일)** (`FETCH_RANGE_DAYS`, 4ae6def) |
| 내 신청 내역 | 교사 | `/cover/mypage` — 본인 신청 이력·취소 |
| 현황판 · 명예의 전당 | 모두 | `/cover/status` — 전체 이력, 월별 필터, 월별·전체 보강 횟수 랭킹 |
| Excel 다운로드 | 관리자 | 현황판에서 현재 필터·전체·기간 지정 (ExcelJS 동적 로드) |

---

## Firestore 구조

```
/schools/{schoolId}/coverRequests/{id}
  date              string        자유 형식 날짜 ("2026-05-20", "2026. 5. 20." 등 — parseCoverDate가 관대하게 파싱)
  className         string        "2-3"
  period            number        교시
  absentTeacher     string        결강 교사 이름 (자유 입력, uid 아님)
  subject           string
  status            '대기중' | '마감'
  coverTeacher      string|null   신청(배정) 교사 이름
  coverTeacherEmail string|null   신청 교사 이메일 — "내 것" 판정과 명예의 전당 집계 키
  openAt            string|null   공개 예약 시각 (비면 즉시 공개)
  appliedAt         Timestamp|null
  createdAt         Timestamp
  createdBy         uid
```

필드 정의의 기준은 `apps/shared/lib/coverRequests.js` 머리 주석이다.

### 보안 규칙 (`firestore.rules`)
- 읽기·수정(신청/취소): 같은 학교 교사
- 생성·삭제: 학교 관리자

---

## 코드 위치

| 파일 | 역할 |
|------|------|
| `apps/shared/lib/coverRequests.js` | 순수 로직 — 날짜 파싱, 공개 판정(`isCoverOpenNow`), 행 검증·payload, 월별 집계(`coverStats`). 테스트 `coverRequests.test.js` |
| `apps/dashboard/src/lib/coverActions.js` | 대시보드의 Firestore I/O (트랜잭션 신청) |
| `apps/portal/src/pages/cover/CoverMain.jsx` | 포털 카드 목록·일괄 등록·신청 |
| `apps/portal/src/pages/cover/CoverMypage.jsx` | 내 신청 내역 |
| `apps/portal/src/pages/cover/CoverStatus.jsx` | 현황판·명예의 전당·Excel |

> `coverTemplates`(캔버스 표지 템플릿)는 이름만 비슷할 뿐 보강과 무관하다.

---

## 남은 일
[ROADMAP.md](./ROADMAP.md)의 "보강" 절 참고 (보강 신청 → DM 알림, 포털과 대시보드 화면 일원화 등).
