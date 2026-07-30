# 관리자 페이지 리팩토링 - 최종 실행 계획

> 작성일: 2026-07-30
> 상태: 계획 완료 / 구현 대기
> 기반: PLAN_adminRebuild.md + 사용자 요구사항 반영

---

## 🎯 전체 비전

### 최종 목표
1. **신학기 준비 자동화** — 매년 반복되는 수작업 최소화
2. **출결 시스템 원클릭 셋팅** — 교사 과목 배정 → 수업 자동 생성
3. **3년 연속성 확보** — Workspace User ID 기반 학생 관리
4. **확장 가능한 구조** — 시수배당표, 시간표, 선택과목, 동아리까지

---

## 📐 최종 관리자 구조

```
관리자 (/admin)
│
├─ 🏠 홈 (/admin)
│   ├─ 학년도 선택
│   ├─ 신학기 준비 현황판 (미배정 집계)
│   └─ 학년도 전환 마법사 (Phase 2)
│
├─ 👥 계정 관리 (/admin/accounts)
│   ├─ [탭] 승인 대기
│   ├─ [탭] 구성원 목록
│   ├─ [탭] 사전 등록
│   └─ [탭] Workspace 동기화
│
├─ 👨‍🏫 교직원 관리 (/admin/staff)
│   ├─ [탭] 기본 정보 (부서·직함·담임·사무실)  ← Phase 1
│   ├─ [탭] 과목 배정 (1학기/2학기)  ← Phase 2
│   ├─ [탭] 시수배당표  ← Phase 3
│   └─ [탭] 시간표 입력  ← Phase 3
│
├─ 👨‍🎓 학생 관리 (/admin/students)
│   ├─ [탭] 기본 정보 (명단)  ← Phase 1
│   ├─ [탭] 선택과목 신청/분반  ← Phase 2
│   └─ [탭] 동아리 배정  ← Phase 3
│
├─ 🏢 공간 관리 (/admin/spaces)
│   ├─ 사무실 목록
│   ├─ 자리 배치 에디터
│   └─ 호출 기기 페어링
│
├─ 📚 출결 시스템 (/admin/attendance)  ← Phase 2
│   ├─ 수업 자동 생성 (원클릭)
│   └─ 기존 이벤트 관리 (링크)
│
└─ 🛠️ 도구 (/admin/tools)
    ├─ 분할점수 기준
    └─ 연수 명단 (자동 생성 추가, Phase 2)
```

---

## 🚀 Phase 1: 기반 정리 (긴급)

### Phase 1A: Workspace User ID 기반 학생 관리 🔥

#### 문제점
- 현재: 학생 문서 ID = `studentId` (5자리 학번)
- 진급 시 학번 랜덤 재배정 → **연속성 없음**
- 예: 1-1-1번 홍길동 → 2-2-15번으로 진급 → 다른 문서 생성

#### 해결책
**Google Workspace User ID 활용**
```javascript
// Workspace API 응답
{
  id: "114567890123456789012",  // ← 영구 불변 고유 ID
  primaryEmail: "202610101@seonyoo.hs.kr",
  name: { givenName: "홍길동" }
}

// 진급 후
{
  id: "114567890123456789012",  // ← 똑같음!
  primaryEmail: "202720215@seonyoo.hs.kr",  // 이메일만 바뀜
}
```

#### 새로운 Firestore 구조
```javascript
schools/{schoolId}/students/{workspaceUserId}
  {
    workspaceUserId: "114567890123456789012",  // Workspace 영구 ID
    studentId: "20215",                        // 현재 학번 (5자리, UI용)
    fullStudentId: "202720215",                // 현재 연도+학번 (9자리)
    email: "202720215@seonyoo.hs.kr",          // 현재 이메일

    name: "홍길동",
    year: 2027,
    grade: 2, class: 2, number: 15,

    admissionYear: 2026,  // 입학연도 (첫 등록 시 설정, 이후 불변)

    emailHistory: [
      { email: "202610101@...", year: 2026 },
      { email: "202720215@...", year: 2027 },
    ],

    source: "workspaceSync",
    updatedAt: Timestamp
  }
```

#### 자동 동기화 동작
**신학기 전환 시:**
1. 워크스페이스 관리자: 학생 이메일 변경 + OU 변경
2. 스마트 교무실: **아무것도 안 해도 됨** (자동 동기화 켜져 있으면)
3. 시스템이 자동으로:
   - 기존 학생 → 진급 정보 업데이트 (학번, 이메일, 학년, 반)
   - 신입생 → 자동 등록
   - 졸업생/전출생 → 아카이브로 이동

#### 구현 파일
- `functions/workspaceSync.js` 수정
- 마이그레이션 스크립트 작성 (1회 실행)
- 출결/공지 시스템 학생 참조 변경

**예상 기간:** 1일
**위험도:** 높음 (데이터 마이그레이션)

---

### Phase 1B: Admin.jsx 분해

#### 현재 상태
```
Admin.jsx (1,776줄, 7개 탭)
├─ pending (승인 대기)
├─ teachers (구성원 목록)
├─ preapprove (사전 등록)
├─ students (학생 명단)
├─ assignments (교원 배정)
├─ callsystem (호출 시스템)
└─ settings (학교 설정)
```

#### 새로운 구조
```
apps/portal/src/pages/admin/
├─ AdminLayout.jsx          (~150줄, 사이드바)
├─ AdminHome.jsx            (~400줄, 신학기 준비 현황판)
├─ AdminAccounts.jsx        (~600줄, 계정 관리 4개 탭)
├─ AdminStaff.jsx           (~500줄, 교직원 관리)
├─ AdminStudents.jsx        (~300줄, 학생 관리)
└─ AdminSpaces.jsx          (~400줄, 공간 관리)
```

#### AdminLayout.jsx (새로 작성)
**기능:**
- 좌측 사이드바 네비게이션
- 승인 대기 배지 표시
- `<Outlet />` 으로 하위 페이지 렌더링

**주요 코드:**
```jsx
const MENU_ITEMS = [
  { path: '/admin', icon: '🏠', label: '홈' },
  { path: '/admin/accounts', icon: '👥', label: '계정 관리', badge: 'pending' },
  { path: '/admin/staff', icon: '👨‍🏫', label: '교직원 관리' },
  { path: '/admin/students', icon: '👨‍🎓', label: '학생 관리' },
  { path: '/admin/spaces', icon: '🏢', label: '공간 관리' },
]

export default function AdminLayout() {
  return (
    <Layout>
      <Box sx={{ display: 'flex' }}>
        <Drawer variant="permanent">{/* 메뉴 */}</Drawer>
        <Box sx={{ flex: 1 }}><Outlet /></Box>
      </Box>
    </Layout>
  )
}
```

---

#### AdminHome.jsx (새로 작성)
**기능:**
- 학년도 선택 드롭다운
- 신학기 준비 현황 집계
- 미완료 항목 카드 (클릭 시 해당 페이지로 이동)

**집계 항목:**
```javascript
{
  pending: 0,              // 승인 대기 계정
  staffNoDept: 0,          // 부서 미배정 교직원
  staffNoOffice: 0,        // 사무실 미배정 교직원
  missingHomerooms: [],    // 미배정 담임 학급 ["1-1", "2-3"]
  officesNoLayout: [],     // 자리배치 미완료 사무실
  studentOuOutdated: false, // 학생 OU 갱신 필요 여부
}
```

**집계 로직:**
```javascript
async function fetchSummary(schoolId, year) {
  // 1. 승인 대기
  const pendingSnap = await getDocs(
    query(collection(db, 'users'), where('role', '==', 'pending'))
  )

  // 2. 교원 배정 미완료
  const assignmentsSnap = await getDocs(
    collection(db, 'schools', schoolId, 'teacherAssignments', year.toString(), 'assignments')
  )
  const staffNoDept = assignmentsSnap.docs.filter(d => !d.data().department).length
  const staffNoOffice = assignmentsSnap.docs.filter(d => !d.data().office).length

  // 3. 담임 미배정 학급
  const allClasses = [] // 1-1 ~ 3-11 (총 33개)
  const assignedHomerooms = assignmentsSnap.docs
    .filter(d => d.data().homeroom)
    .map(d => `${d.data().homeroom.grade}-${d.data().homeroom.class}`)
  const missingHomerooms = allClasses.filter(c => !assignedHomerooms.includes(c))

  // 4. 자리배치 미완료 사무실
  const offices = [...new Set(assignmentsSnap.docs.map(d => d.data().office).filter(Boolean))]
  const officesNoLayout = []
  for (const office of offices) {
    const layoutDoc = await getDoc(
      doc(db, 'schools', schoolId, 'officeLayouts', year.toString(), office)
    )
    if (!layoutDoc.exists()) officesNoLayout.push(office)
  }

  // 5. 학생 OU 갱신 필요
  const schoolDoc = await getDoc(doc(db, 'schools', schoolId))
  const ouPath = schoolDoc.data().workspaceSync?.studentOuPath || ''
  const studentOuOutdated = !ouPath.includes(year.toString())

  return { pending: pendingSnap.size, staffNoDept, staffNoOffice, missingHomerooms, officesNoLayout, studentOuOutdated }
}
```

---

#### AdminAccounts.jsx (~600줄)
**기존 Admin.jsx에서 이관:**
- 승인 대기 탭 (L813-845)
- 구성원 목록 탭 (L846-941)
- 사전 등록 탭 (L707-777, L789-792)
- Workspace 동기화 탭 (L594-706)

**탭 구조:**
```jsx
const [tab, setTab] = useState('pending')
// 'pending' | 'members' | 'preregister' | 'workspace'
```

---

#### AdminStaff.jsx (~500줄)
**기존 Admin.jsx에서 이관:**
- 교원 배정 탭 (L994-1161)
- 부서, 직함, 담당교과, 담임, 사무실 배정
- CSV 업로드/다운로드
- 전년도 복제 기능

**Phase 2 확장:**
```jsx
const [tab, setTab] = useState('basic')
// 'basic' | 'subjects' (과목 배정, Phase 2) | 'hours' (시수배당표, Phase 3)
```

---

#### AdminStudents.jsx (~300줄)
**기존 Admin.jsx에서 이관:**
- 학생 명단 탭 (L942-993)
- 학생 검색, 이름 수정, 삭제

**Phase 2 확장:**
```jsx
const [tab, setTab] = useState('list')
// 'list' | 'electives' (선택과목, Phase 2) | 'clubs' (동아리, Phase 3)
```

---

#### AdminSpaces.jsx (~400줄)
**기존 Admin.jsx에서 이관:**
- 호출 시스템 탭 (L1162-1276)
- 사무실 목록, 자리 배치 에디터, 호출 기기 페어링

**탭 구조:**
```jsx
const [tab, setTab] = useState('offices')
// 'offices' | 'layout' | 'devices'
```

---

#### 라우팅 변경 (App.jsx)
```jsx
// 삭제
<Route path="/admin" element={<AdminHub />} />
<Route path="/admin/users" element={<Admin />} />

// 추가
<Route path="/admin" element={<AdminLayout />}>
  <Route index element={<AdminHome />} />
  <Route path="accounts" element={<AdminAccounts />} />
  <Route path="staff" element={<AdminStaff />} />
  <Route path="students" element={<AdminStudents />} />
  <Route path="spaces" element={<AdminSpaces />} />

  {/* 기존 도구 페이지들 */}
  <Route path="asa-cutoffs" element={<AsaCutoffs />} />
  <Route path="asa-checklist" element={<AsaChecklistAdmin />} />
  <Route path="training-presets" element={<TrainingPresets />} />
</Route>
```

**예상 기간:** 2-3일
**위험도:** 중간 (회귀 테스트 필수)

---

## 🚀 Phase 2: 핵심 자동화

### 교사 과목 배정 시스템

#### 데이터 구조
```javascript
schools/{schoolId}/teacherSubjects/{year}-{semester}-{teacherUid}
  {
    year: 2027,
    semester: 1,  // 1학기 or 2
    teacherUid: "abc123",
    teacherName: "홍길동",
    subjects: [
      {
        subjectCode: "KOR",
        subjectName: "독서",
        grade: 2,
        classes: [1, 2, 3],      // 2-1, 2-2, 2-3
        hoursPerWeek: 4,
      },
    ],
    totalHours: 16,
    updatedAt: Timestamp
  }
```

#### UI 기능
- AdminStaff.jsx에 "과목 배정" 탭 추가
- CSV 업로드: `교사 이메일, 과목코드, 과목명, 학년, 반(복수), 시수`
- 개별 교사 편집
- 1학기 → 2학기 복제 기능
- **성취평가제 과목 자동 연동** (분할점수 기준 관리와 연결)

---

### 출결 시스템 수업 자동 생성

#### 프로세스
1. 관리자: AdminHome 또는 별도 메뉴에서 "수업 자동 생성" 클릭
2. 시스템:
   - `teacherSubjects` 데이터 읽기
   - 각 교사의 각 과목별로 이벤트 생성
   - 학생 명단: `students where grade=X && class=Y`
3. 완료 → 교사들이 즉시 QR 생성 가능

#### 구현
```javascript
async function autoGenerateAttendanceEvents(schoolId, year, semester) {
  const subjectsSnap = await getDocs(
    query(
      collection(db, 'schools', schoolId, 'teacherSubjects'),
      where('year', '==', year),
      where('semester', '==', semester)
    )
  )

  for (const doc of subjectsSnap.docs) {
    const { teacherUid, teacherName, subjects } = doc.data()

    for (const subject of subjects) {
      for (const classNo of subject.classes) {
        // 학생 명단 자동 조회
        const students = await getDocs(
          query(
            collection(db, 'schools', schoolId, 'students'),
            where('year', '==', year),
            where('grade', '==', subject.grade),
            where('class', '==', classNo)
          )
        )

        // 이벤트 생성
        await addDoc(collection(db, 'schools', schoolId, 'events'), {
          title: `${subject.grade}-${classNo} ${subject.subjectName}`,
          teacherUid,
          teacherName,
          subjectCode: subject.subjectCode,
          grade: subject.grade,
          class: classNo,
          studentWorkspaceIds: students.docs.map(s => s.id),  // Workspace ID 배열
          year,
          semester,
          autoGenerated: true,
          createdAt: serverTimestamp(),
        })
      }
    }
  }
}
```

---

### 연수 명단 자동 생성

**AdminLayout 또는 TrainingPresets에 추가:**
- "전체 교원 명단 자동 생성" 버튼
- 현재 연도 `teacherAssignments` 기준으로 명단 생성
- 기존 수동 명단 생성 기능은 그대로 유지

**예상 기간:** 3-4일
**위험도:** 낮음 (새 기능)

---

## 🚀 Phase 3: 고급 기능 (장기)

### 학생 선택과목 시스템
- 2-3학년 선택과목 신청 폼
- 분반 배정 알고리즘
- 과목별/분반별 학생 명단 조회

### 시수배당표
- 교사별 주당 시수 자동 계산
- 법정 시수 대비 현황
- 시수 조정 시뮬레이션

### 시간표
- 교사별 시간표 입력
- 대시보드에 개인 시간표 표시
- 시간표 기반 출결 자동 시작

### 동아리 관리
- 학생 동아리 신청
- 동아리별 명단 관리

**예상 기간:** 각 2-3주
**위험도:** 중간~높음

---

## 📅 착수 일정 제안

| Phase | 작업 | 기간 | 우선순위 |
|---|---|---|---|
| **1A** | Workspace User ID 학생 관리 | 1일 | 🔥 긴급 (2월 중) |
| **1B** | Admin.jsx 분해 + 현황판 | 2-3일 | ⭐ 높음 (2월) |
| **2** | 교사 과목 배정 + 출결 자동 생성 | 3-4일 | ⭐ 높음 (3월 전) |
| **3** | 고급 기능들 | 각 2-3주 | 중간 (학기 중) |

---

## ⚠️ 주의사항 및 결정 필요

### Phase 1A 착수 전:
- [ ] 기존 학생 데이터 백업 완료
- [ ] Workspace API에서 User ID 필드 확인
- [ ] 마이그레이션 롤백 계획 수립

### Phase 1B 착수 전:
- [ ] 기존 기능 회귀 테스트 체크리스트 작성
- [ ] 사용자 브라우저 캐시 정리 안내 준비

### Phase 2 착수 전:
- [ ] 과목 코드 체계 정의 (KOR, ENG, MATH 등)
- [ ] 출결 자동 생성 시 기존 이벤트 처리 방법 결정
- [ ] 성취평가제 과목 교사 관리 페이지 삭제 여부 최종 확인

---

## 📚 참고 문서

- `PLAN_adminRebuild.md` — 문제 정의 및 초기 제안
- `ATTENDANCE.md` — 출결 시스템 상세
- `functions/workspaceSync.js` — Workspace 동기화 로직
- `apps/portal/src/pages/attendance/Admin.jsx` — 현재 관리자 페이지 (1,776줄)
