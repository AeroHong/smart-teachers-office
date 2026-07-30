# 선유고 스마트 교무실 - 다음 작업 계획

## 작업 완료 현황 (2026-07-31)

### ✅ Phase 1A: Workspace User ID 마이그레이션 (완료)
- 학생 문서 ID 변경 (학번 → Workspace User ID)
- 학생 그룹 workspaceUserIds 필드 추가
- Workspace 동기화 로직 개선

### ✅ Phase 1B: Admin.jsx 리팩토링 (완료)
- 1,776줄 → 6개 모듈 (평균 370줄)
- AdminLayout, AdminHome, AdminAccounts, AdminStaff, AdminStudents, AdminSpaces

### ✅ 과목 관리 페이지 구현 (완료)
- AdminSubjects.jsx (1019줄)
- 교육청 배당표 Excel 파싱
- 간편 업로드 Excel 파싱
- ImportModal 2단계 업로드
- Excel 다운로드

### ✅ 자리 배치 확정 기능 (완료)
- OfficeLayoutEditor.jsx에 confirmed 필드 추가
- "배치 완료 확정" 버튼
- AdminHome 미완료 사무실 경고 로직 수정

### ✅ 메뉴 순서 조정 (완료)
- 계정 관리 → **과목 관리** → 교직원 관리 → 학생 관리 순서

### ✅ 문서화 (완료)
- DB_STRUCTURE.md - 전체 DB 구조 분석
- ADMIN_STRUCTURE.md - 관리자 페이지 구조 분석
- NEXT_STEPS.md - 다음 작업 계획

---

## 다음 작업 우선순위

### 🔴 우선순위 1: 과목 관리 통합 및 일관성 개선

#### 1-1. 교직원 과목 배정 개선
**현황**: AdminStaffSubjects에서 과목명을 자유 입력

**목표**: subjects 컬렉션 참조하여 일관성 유지

**작업 내용**:
```javascript
// AdminStaffSubjects.jsx
// Before: TextField 자유 입력
<TextField label="과목명" />

// After: subjects 컬렉션에서 과목 목록 로드 → Autocomplete
<Autocomplete
  options={subjectsFromDB}
  getOptionLabel={(option) => option.name}
  renderOption={(props, option) => (
    <li {...props}>
      {option.name} ({option.grade}학년 {option.semester}학기)
    </li>
  )}
/>
```

**파일 수정**:
- `AdminStaffSubjects.jsx` - Autocomplete 컴포넌트 적용
- `@shared/lib/subjectData.js` - `loadSubjects()` 활용

**예상 시간**: 1시간

---

#### 1-2. 학생 선택과목 입력 개선
**현황**: AdminStudents에서 선택과목명을 자유 입력

**목표**: subjects 컬렉션의 학생선택 과목만 선택 가능

**작업 내용**:
```javascript
// AdminStudents.jsx
// Before: TextField 자유 입력
<TextField label="과목 추가" />

// After: 학생선택 과목만 필터링
const electiveSubjects = subjects.filter(s => s.category === '학생선택')

<Autocomplete
  options={electiveSubjects}
  groupBy={(option) => `${option.grade}학년 ${option.semester}학기`}
  getOptionLabel={(option) => option.name}
/>
```

**파일 수정**:
- `AdminStudents.jsx` - Autocomplete 컴포넌트 적용
- 학년/학기별 그룹화 표시

**예상 시간**: 1시간

---

#### 1-3. 과목 삭제 시 참조 확인
**현황**: 과목 삭제 시 참조 확인 없음

**목표**: teacherSubjects, students.electiveSubjects 참조 확인 후 삭제

**작업 내용**:
```javascript
// AdminSubjects.jsx - deleteSubject 함수 수정
const checkSubjectReferences = async (schoolId, subjectName) => {
  // 1. teacherSubjects 확인
  const teacherSubjectsSnap = await getDocs(
    collection(db, 'schools', schoolId, 'teacherSubjects')
  )
  const teacherRefs = teacherSubjectsSnap.docs.filter(d =>
    d.data().subjects?.includes(subjectName)
  )

  // 2. students.electiveSubjects 확인
  const studentsSnap = await getDocs(
    collection(db, 'schools', schoolId, 'students')
  )
  const studentRefs = studentsSnap.docs.filter(d =>
    d.data().electiveSubjects?.includes(subjectName)
  )

  return {
    canDelete: teacherRefs.length === 0 && studentRefs.length === 0,
    teacherCount: teacherRefs.length,
    studentCount: studentRefs.length,
  }
}
```

**UI**:
```
⚠️ 이 과목을 삭제할 수 없습니다.
- 교사 3명이 담당과목으로 배정됨
- 학생 15명이 선택과목으로 배정됨
```

**파일 수정**:
- `AdminSubjects.jsx` - 삭제 확인 로직 추가
- `@shared/lib/subjectData.js` - `checkSubjectReferences()` 함수 추가

**예상 시간**: 2시간

---

### 🟡 우선순위 2: 신학기 준비 워크플로우 개선

#### 2-1. AdminHome 대시보드 개선
**목표**: 신학기 준비 진행률 시각화

**작업 내용**:
- 진행률 바 추가 (완료 항목 / 전체 항목)
- 미완료 항목 클릭 시 해당 페이지로 이동 (이미 구현됨)
- 완료 항목은 초록색, 미완료는 주황색 (이미 구현됨)

**추가 기능**:
```javascript
// 진행률 계산
const completedItems = CHECKLIST_ITEMS.filter(item => item.count === 0).length
const progress = (completedItems / CHECKLIST_ITEMS.length) * 100

<LinearProgress variant="determinate" value={progress} />
<Typography variant="h6">
  신학기 준비 진행률: {completedItems}/{CHECKLIST_ITEMS.length} ({Math.round(progress)}%)
</Typography>
```

**파일 수정**:
- `AdminHome.jsx` - LinearProgress 추가

**예상 시간**: 30분

---

#### 2-2. 빠른 작업 가이드 추가
**목표**: 신규 관리자를 위한 작업 순서 안내

**작업 내용**:
```javascript
// AdminHome.jsx
const WORKFLOW_STEPS = [
  { title: '1. 승인 대기 계정 승인', path: '/admin/accounts', done: summary.pending === 0 },
  { title: '2. 과목 데이터 입력', path: '/admin/subjects', done: subjectsCount > 0 },
  { title: '3. 교직원 부서/사무실 배정', path: '/admin/staff', done: summary.staffNoDept === 0 },
  { title: '4. 담임 배정', path: '/admin/staff', done: summary.missingHomerooms.length === 0 },
  { title: '5. 학생 선택과목 배정', path: '/admin/students', done: studentsWithElectives > 0 },
  { title: '6. 자리 배치 완료', path: '/admin/spaces', done: summary.officesNoLayout.length === 0 },
]

<Stepper activeStep={WORKFLOW_STEPS.findIndex(s => !s.done)} orientation="vertical">
  {WORKFLOW_STEPS.map((step, index) => (
    <Step key={index} completed={step.done}>
      <StepLabel>{step.title}</StepLabel>
      <StepContent>
        <Button onClick={() => navigate(step.path)}>시작하기</Button>
      </StepContent>
    </Step>
  ))}
</Stepper>
```

**파일 수정**:
- `AdminHome.jsx` - Stepper 추가 (선택 사항)

**예상 시간**: 1시간

---

### 🟢 우선순위 3: UX 개선

#### 3-1. Excel 업로드 진행률 표시
**목표**: 대용량 파일 업로드 시 진행 상황 표시

**작업 내용**:
```javascript
// AdminSubjects.jsx - ImportModal
const [uploadProgress, setUploadProgress] = useState(0)

const handleFileParse = async (file) => {
  setUploadProgress(0)
  const reader = new FileReader()
  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      setUploadProgress((e.loaded / e.total) * 100)
    }
  }
  reader.onload = (e) => {
    // 파싱 로직
  }
  reader.readAsArrayBuffer(file)
}

<LinearProgress variant="determinate" value={uploadProgress} />
```

**파일 수정**:
- `AdminSubjects.jsx` - LinearProgress 추가

**예상 시간**: 30분

---

#### 3-2. 자리 배치 Undo/Redo 기능
**목표**: 드래그 중 실수 복구

**작업 내용**:
```javascript
// OfficeLayoutEditor.jsx
const [history, setHistory] = useState([])
const [historyIndex, setHistoryIndex] = useState(-1)

const pushHistory = (newSeats) => {
  const newHistory = history.slice(0, historyIndex + 1)
  setHistory([...newHistory, newSeats])
  setHistoryIndex(newHistory.length)
}

const undo = () => {
  if (historyIndex > 0) {
    setHistoryIndex(historyIndex - 1)
    setSeats(history[historyIndex - 1])
  }
}

const redo = () => {
  if (historyIndex < history.length - 1) {
    setHistoryIndex(historyIndex + 1)
    setSeats(history[historyIndex + 1])
  }
}

<Button onClick={undo} disabled={historyIndex <= 0}>↶ 실행 취소</Button>
<Button onClick={redo} disabled={historyIndex >= history.length - 1}>↷ 다시 실행</Button>
```

**파일 수정**:
- `OfficeLayoutEditor.jsx` - 히스토리 상태 추가

**예상 시간**: 2시간

---

#### 3-3. 과목 관리 필터 개선
**목표**: 학년, 학기, 과목 구분 다중 필터

**현황**: 입학년도 필터만 있음

**작업 내용**:
```javascript
// AdminSubjects.jsx
const [filters, setFilters] = useState({
  entryYear: null,
  grade: null,
  semester: null,
  category: null,
  courseType: null,
})

const filteredSubjects = subjects.filter(s => {
  if (filters.entryYear && s.entryYear !== filters.entryYear) return false
  if (filters.grade && s.grade !== filters.grade) return false
  if (filters.semester && s.semester !== filters.semester) return false
  if (filters.category && s.category !== filters.category) return false
  if (filters.courseType && s.courseType !== filters.courseType) return false
  return true
})

<FormControl>
  <InputLabel>학년</InputLabel>
  <Select value={filters.grade} onChange={e => setFilters({...filters, grade: e.target.value})}>
    <MenuItem value={null}>전체</MenuItem>
    <MenuItem value={1}>1학년</MenuItem>
    <MenuItem value={2}>2학년</MenuItem>
    <MenuItem value={3}>3학년</MenuItem>
  </Select>
</FormControl>
```

**파일 수정**:
- `AdminSubjects.jsx` - 필터 컨트롤 추가

**예상 시간**: 1시간

---

### 🔵 우선순위 4: 권한 세분화

#### 4-1. 부서별 관리자 권한
**목표**: 교무부장, 학년부장 등 부서별 관리 권한

**작업 내용**:
```javascript
// teacherAssignments에 permissions 필드 추가
{
  uid: "...",
  department: "교무부",
  positionLabel: "교무부장",
  permissions: {
    manageStaff: true,      // 교직원 관리
    manageStudents: true,   // 학생 관리
    manageSubjects: true,   // 과목 관리
    manageSpaces: false,    // 공간 관리 (관리자만)
  }
}

// ProtectedRoute.jsx 수정
const hasPermission = (permission) => {
  if (role === 'admin' || role === 'school_admin') return true
  // teacherAssignments 조회하여 permissions 확인
}
```

**Firestore Rules 수정**:
```javascript
function hasPermission(schoolId, permission) {
  let assignment = get(/databases/$(database)/documents/schools/$(schoolId)/teacherAssignments/$(request.auth.uid)).data;
  return assignment.permissions[permission] == true;
}

// 예: 교직원 관리 권한 확인
allow write: if isSchoolAdmin(schoolId) || hasPermission(schoolId, 'manageStaff');
```

**예상 시간**: 4시간

---

#### 4-2. 학년부장 권한 (해당 학년만 관리)
**목표**: 1학년부장은 1학년만 관리

**작업 내용**:
```javascript
// teacherAssignments
{
  positionLabel: "1학년부장",
  permissions: {
    manageGrade: 1  // 1학년만 관리 가능
  }
}

// AdminStudents.jsx 필터
const visibleStudents = students.filter(s => {
  if (role === 'admin' || role === 'school_admin') return true
  if (assignment.permissions?.manageGrade) {
    return s.grade === assignment.permissions.manageGrade
  }
  return false
})
```

**예상 시간**: 2시간

---

### 🟣 우선순위 5: 성능 개선

#### 5-1. 과목 관리 페이지네이션
**목표**: 대량 과목 데이터 로드 시 성능 개선

**현황**: 전체 과목 한 번에 로드

**작업 내용**:
```javascript
// AdminSubjects.jsx
const [page, setPage] = useState(0)
const [rowsPerPage, setRowsPerPage] = useState(50)

const paginatedSubjects = filteredSubjects.slice(
  page * rowsPerPage,
  page * rowsPerPage + rowsPerPage
)

<TablePagination
  component="div"
  count={filteredSubjects.length}
  page={page}
  onPageChange={(e, newPage) => setPage(newPage)}
  rowsPerPage={rowsPerPage}
  onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
/>
```

**예상 시간**: 1시간

---

#### 5-2. 학생 목록 가상 스크롤
**목표**: 600명 학생 목록 렌더링 성능 개선

**작업 내용**:
```javascript
// AdminStudents.jsx - react-window 사용
import { FixedSizeList } from 'react-window'

<FixedSizeList
  height={600}
  itemCount={filteredStudents.length}
  itemSize={60}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      {/* 학생 행 렌더링 */}
    </div>
  )}
</FixedSizeList>
```

**라이브러리 추가**:
```bash
npm install react-window
```

**예상 시간**: 2시간

---

## 작업 일정 제안

### Week 1: 과목 관리 통합 (우선순위 1)
- Day 1: 1-1. 교직원 과목 배정 개선
- Day 2: 1-2. 학생 선택과목 입력 개선
- Day 3: 1-3. 과목 삭제 시 참조 확인
- Day 4-5: 테스트 및 버그 수정

### Week 2: 워크플로우 및 UX 개선 (우선순위 2-3)
- Day 1: 2-1. AdminHome 대시보드 개선
- Day 2: 2-2. 빠른 작업 가이드 추가
- Day 3: 3-1. Excel 업로드 진행률 표시
- Day 4: 3-3. 과목 관리 필터 개선
- Day 5: 테스트 및 문서화

### Week 3: 고급 기능 (우선순위 3-4, 선택)
- Day 1-2: 3-2. 자리 배치 Undo/Redo
- Day 3-5: 4-1. 부서별 관리자 권한 (필요 시)

### Week 4: 성능 최적화 (우선순위 5, 선택)
- Day 1: 5-1. 과목 관리 페이지네이션
- Day 2-3: 5-2. 학생 목록 가상 스크롤
- Day 4-5: 성능 측정 및 최적화

---

## 즉시 착수 가능한 작업 (Quick Wins)

### 1. AdminHome 진행률 바 추가 (30분)
**파일**: `AdminHome.jsx`
**난이도**: ⭐

### 2. Excel 업로드 진행률 표시 (30분)
**파일**: `AdminSubjects.jsx`
**난이도**: ⭐

### 3. 과목 관리 필터 개선 (1시간)
**파일**: `AdminSubjects.jsx`
**난이도**: ⭐⭐

### 4. 교직원 과목 배정 개선 (1시간)
**파일**: `AdminStaffSubjects.jsx`, `@shared/lib/subjectData.js`
**난이도**: ⭐⭐

### 5. 학생 선택과목 입력 개선 (1시간)
**파일**: `AdminStudents.jsx`
**난이도**: ⭐⭐

---

## 보류/검토 필요

### 1. 과목 시간표 관리
**이유**: 시간표 자동 생성 알고리즘 복잡도 높음

**대안**: 나이스 시간표 데이터 import 기능 우선

### 2. 학생 진급 처리 자동화
**이유**: Workspace 동기화로 이미 처리됨

**현황**: workspaceSync.js에서 이메일 변경 감지 → 자동 진급

### 3. 교사 평가 시스템
**이유**: 민감한 정보, 별도 프로젝트로 분리 검토

### 4. 학부모 계정 관리
**이유**: 현재 요구사항 없음

**추후 검토**: 학부모 공지 발송, 상담 예약 시스템

---

## 기술 부채 목록

### 1. AdminStaffBasic.jsx 일괄 저장 로직 개선
**현황**: WriteBatch 500개 제한 미처리

**개선**:
```javascript
// 500개씩 분할하여 저장
const batches = []
let currentBatch = writeBatch(db)
let operationCount = 0

teacherList.forEach((teacher, index) => {
  currentBatch.set(...)
  operationCount++

  if (operationCount === 500 || index === teacherList.length - 1) {
    batches.push(currentBatch.commit())
    currentBatch = writeBatch(db)
    operationCount = 0
  }
})

await Promise.all(batches)
```

### 2. OfficeLayoutEditor 좌표 검증 강화
**현황**: 클라이언트에서만 0~1 범위 clamp

**개선**: Firestore Rules에 검증 추가
```javascript
match /officeLayouts/{layoutId} {
  allow write: if request.resource.data.seats.values().all(seat =>
    seat.x >= 0 && seat.x <= 1 && seat.y >= 0 && seat.y <= 1
  );
}
```

### 3. Excel 파서 에러 핸들링 개선
**현황**: 파싱 실패 시 빈 배열 반환

**개선**: 구체적인 에러 메시지 및 복구 제안
```javascript
{
  courses: [],
  errors: [
    { row: 15, column: 'C', message: '과목명이 누락되었습니다.' },
    { row: 23, column: 'E', message: '학점이 숫자가 아닙니다. (입력값: "3단위")' },
  ]
}
```

---

## 참고 문서

- [전체 DB 구조](./DB_STRUCTURE.md)
- [관리자 페이지 구조](./ADMIN_STRUCTURE.md)
- [Phase 1A-B 완료 보고서](./MIGRATION_COMPLETE.md)

---

**마지막 업데이트**: 2026-07-31
**다음 리뷰 예정**: Week 1 완료 후
