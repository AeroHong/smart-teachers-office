# 연수 서명부 시스템 (Training Attendance)

## 개요
교내 연수/워크숍 대상자 명단 관리 및 디지털 서명 수집 시스템.
연수 주관자가 대상자 명단을 구성하면, 각 교사가 직접 서명을 입력하고 결과물을 출력한다.

---

## 권한 체계

| 기능 | 일반 교사 (anyUser) | 관리자 (admin/school_admin) |
|------|---------------------|------------------------------|
| 연수 목록 조회 | ✓ | ✓ |
| 연수 생성 | ✓ | ✓ |
| 연수 명단 편집 | 본인 생성 연수만 | ✓ (전체) |
| 기본 명단(preset) 관리 | ✗ | ✓ |
| 서명 입력 | 본인만 | ✓ |
| 결과 조회 / PDF / Excel | ✓ | ✓ |

> `ProtectedRoute anyUser` = 로그인만 하면 접근 가능 (미승인 교사 포함)  
> 명단 편집 권한은 Firestore `createdBy === currentUser.uid` 또는 role이 admin/school_admin인 경우

---

## 화면 구성

### 1. 연수 목록 (`/training`)
- 연수 카드 목록 (날짜 내림차순)
- 각 카드: 연수명, 날짜, 시간, 장소, 서명 현황 (N/M명), 상태 뱃지
- [+ 연수 만들기] 버튼 → `/training/new`

### 2. 연수 생성 (`/training/new`)
- 입력 필드: 연수명, 날짜, 시작/종료 시간, 장소, 비고
- 참석 대상 명단 구성:
  - **기본 명단 불러오기**: 관리자가 저장해 둔 preset 선택 → 명단 자동 채우기
  - **개별 교사 추가**: 시스템 내 교사 검색 후 추가
  - **직접 입력**: 외부 인원 등 자유 입력 (이름, 이메일)
  - 추가된 인원 목록에서 개별 삭제 가능
- [저장] → `/training/:id` 이동

### 3. 연수 상세 (`/training/:id`)
탭 구조 3개:

**① 서명 현황 탭** (기본)
- 대상자 명단 테이블: 순번, 이름, 서명 여부, 서명 이미지 썸네일
- 미서명자 강조 표시
- [PDF 출력] [Excel 다운로드] 버튼

**② 내 서명 탭**
- react-signature-canvas 서명 패드
- [다시 그리기] [서명 저장] 버튼
- 이미 서명한 경우: 기존 서명 표시 + [재서명] 옵션

**③ 명단 편집 탭** (생성자 또는 관리자만 표시)
- 현재 명단 목록 + 개별 삭제 버튼
- 기본 명단 불러오기 (preset 선택)
- 개별 교사 검색 추가 / 직접 입력 추가

### 4. 기본 명단 관리 (`/training/presets`) — 관리자 전용
- 저장된 명단 카드 목록
- 명단 생성/수정/삭제
- 각 명단: 이름, 소속 교사 목록 (시스템 교사 검색 + 직접 입력)

---

## Firestore 컬렉션 구조

```
/schools/{schoolId}/
  /trainings/{trainingId}
    - title: string               연수명
    - date: string                YYYY-MM-DD
    - startTime: string           HH:mm
    - endTime: string             HH:mm
    - location: string            장소
    - description: string         비고 (선택)
    - createdBy: string           uid
    - createdByName: string       생성자 이름 (표시용 캐시)
    - createdAt: Timestamp
    - status: 'open' | 'closed'   서명 수집 상태
    - members: Array<{            참석 대상 명단 (최대 ~200명 상정)
        uid: string | null,         시스템 교사 uid (외부인은 null)
        name: string,
        email: string
      }>

  /trainings/{trainingId}/signatures/{uid}
    - uid: string
    - name: string
    - email: string
    - signedAt: Timestamp
    - signatureData: string       base64 PNG dataURL (canvas 출력)

  /trainingPresets/{presetId}     관리자 기본 명단
    - name: string                명단 이름 (예: "전체 교원", "1학년 부")
    - members: Array<{uid|null, name, email}>
    - createdBy: string
    - createdAt: Timestamp
```

> `signatures` 서브컬렉션으로 분리하는 이유: base64 이미지 데이터가 크므로 목록 조회 시 불필요한 데이터 로드 방지

---

## 라우트 정의

| 경로 | 컴포넌트 | 권한 | 설명 |
|------|----------|------|------|
| `/training` | TrainingList | anyUser | 연수 목록 |
| `/training/new` | TrainingCreate | anyUser | 연수 생성 |
| `/training/presets` | TrainingPresets | adminOnly | 기본 명단 관리 |
| `/training/:id` | TrainingDetail | anyUser | 상세/서명/출력 |

> `/training/presets`가 `/training/:id` 보다 먼저 선언되어야 "presets"가 `:id`로 매칭되지 않음

---

## 추가 패키지

```bash
cd apps/portal
npm install react-signature-canvas jspdf html2canvas xlsx
```

| 패키지 | 버전 기준 | 용도 |
|--------|-----------|------|
| react-signature-canvas | ^1.0.6 | canvas 서명 패드 |
| jspdf | ^2.5.x | PDF 생성 |
| html2canvas | ^1.4.x | DOM → 이미지 변환 (PDF 삽입용) |
| xlsx | ^0.18.x | Excel 파일 생성 |

---

## PDF 출력 설계

`html2canvas`로 서명 현황 테이블 DOM을 캡처 → `jspdf`에 이미지로 삽입.

```
[연수명]          [날짜/시간/장소]
-------------------------------------------
순번 | 소속/이름 | 서명
  1  | 홍길동    | [서명이미지]
  2  | 김철수    | [서명이미지]
  ...
```

---

## Excel 출력 설계

`xlsx` 라이브러리로 생성. 서명 이미지는 포함하지 않고 텍스트 데이터만.

| 순번 | 이름 | 이메일 | 서명 여부 | 서명 시각 |
|------|------|--------|-----------|-----------|

---

## 구현 순서 (권장)

1. `TrainingList.jsx` — 목록 조회 (Firestore read)
2. `TrainingCreate.jsx` — 생성 폼 + preset 연동
3. `TrainingDetail.jsx` — 서명 현황 탭 + 명단 편집 탭
4. 서명 패드 (내 서명 탭) — react-signature-canvas
5. PDF / Excel 출력
6. `TrainingPresets.jsx` — 기본 명단 CRUD
