import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { loadSubjects, readElectives, electiveLabel } from '@shared/lib/subjectData'
import { entryYearFor, currentSchoolYear } from '@shared/lib/schema'
import Autocomplete from '@mui/material/Autocomplete'
import { RowActions, EditAction, DeleteAction, table } from './adminUi'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Chip from '@mui/material/Chip'
import UploadIcon from '@mui/icons-material/Upload'
import DownloadIcon from '@mui/icons-material/Download'

export default function AdminStudents() {
  const { schoolId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [studentList, setStudentList] = useState([])
  const [studentSearch, setStudentSearch] = useState('')

  // 필터
  const [gradeFilter, setGradeFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')

  // 선택과목 업로드
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadGrade, setUploadGrade] = useState(2)
  const [uploadParsedRows, setUploadParsedRows] = useState([])
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadSaving, setUploadSaving] = useState(false)

  // 학생 편집 모달
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [editForm, setEditForm] = useState({ electiveSubjects: [] })
  const [editSaving, setEditSaving] = useState(false)

  // 교육과정 과목 카탈로그 — 선택과목 편집에서 참조한다
  const [catalog, setCatalog] = useState([])

  // 편집 중인 학생의 학년에 해당하는 선택 가능 과목.
  // 학년 하나만 해도 과목이 수십 개라 학년으로 먼저 좁힌다.
  const electiveOptionsFor = useMemo(() => {
    const grade = Number(editingStudent?.grade) || null
    if (!grade) return () => []
    const entryYear = entryYearFor(currentSchoolYear(), grade)
    const base = catalog
      .filter(c => c.grade === grade && c.entryYear === entryYear && c.category === '학생선택')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    // 1·2학기 편성이 다르므로 학기에 맞는 과목만 준다 (양학기 과목은 두 학기 모두)
    return (semester) => base.filter(c => c.semester === 'both' || Number(c.semester) === semester)
  }, [catalog, editingStudent])

  useEffect(() => {
    if (!schoolId) return
    fetchStudents()
    loadSubjects(schoolId).then(setCatalog).catch(err => console.error('과목 카탈로그 로드 실패:', err))
  }, [schoolId])

  const fetchStudents = async () => {
    if (!schoolId) return
    setLoading(true)
    const snap = await getDocs(collection(db, 'schools', schoolId, 'students'))
    setStudentList(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          if (a.grade !== b.grade) return (a.grade || 0) - (b.grade || 0)
          if (a.class !== b.class) return (a.class || 0) - (b.class || 0)
          return (a.number || 0) - (b.number || 0)
        })
    )
    setLoading(false)
  }


  const deleteStudent = async (studentId, name) => {
    if (!window.confirm(`${name}님을 학생 명단에서 삭제하시겠습니까?\n\nWorkspace 동기화가 켜져 있으면 다음 동기화 때 다시 추가될 수 있습니다.`)) return
    await deleteDoc(doc(db, 'schools', schoolId, 'students', studentId))
    setStudentList(prev => prev.filter(s => s.id !== studentId))
  }

  // CSV 파싱 함수
  const parseElectiveCsv = (text) => {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return []

    // 헤더 확인 (학번, 이름, 선택과목1, 선택과목2, ...)
    const header = lines[0].split(',').map(h => h.trim())
    const studentIdIdx = header.findIndex(h => h === '학번' || h.toLowerCase() === 'studentid')
    const nameIdx = header.findIndex(h => h === '이름' || h.toLowerCase() === 'name')

    if (studentIdIdx === -1) {
      throw new Error('CSV 파일에 "학번" 열이 없습니다.')
    }

    // 선택과목 열 찾기 (선택과목1, 선택과목2, ... or elective1, elective2, ...)
    // 선택과목N 열과 짝이 되는 분반N 열을 함께 찾는다 (분반 열은 없어도 된다)
    const electiveIndices = []
    header.forEach((h, idx) => {
      if (h.startsWith('선택과목') || h.toLowerCase().startsWith('elective')) {
        const n = h.replace(/[^0-9]/g, '')
        const classIdx = header.findIndex(x => x === `분반${n}` || x.toLowerCase() === `division${n}`)
        const semIdx = header.findIndex(x => x === `학기${n}` || x.toLowerCase() === `semester${n}`)
        electiveIndices.push({ idx, classIdx, semIdx })
      }
    })

    if (electiveIndices.length === 0) {
      throw new Error('CSV 파일에 "선택과목" 열이 없습니다. (예: 선택과목1, 선택과목2)')
    }

    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim())
      if (cells.length < 2) continue

      const studentId = cells[studentIdIdx]
      if (!studentId) continue

      const name = nameIdx !== -1 ? cells[nameIdx] : ''
      const electives = electiveIndices
        .map(({ idx, classIdx, semIdx }) => ({
          subjectId: '',
          subjectName: (cells[idx] || '').trim(),
          classNo: classIdx !== -1 ? (cells[classIdx] || '').trim() : '',
          // 학기 열이 없는 기존 파일은 1학기로 본다
          semester: semIdx !== -1 && Number(cells[semIdx]) === 2 ? 2 : 1,
        }))
        .filter(e => e.subjectName)

      rows.push({ studentId, name, electives })
    }

    return rows
  }

  const handleElectiveUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadMsg('')
    setUploadParsedRows([])

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result
        const rows = parseElectiveCsv(text)

        if (rows.length === 0) {
          setUploadMsg('업로드된 파일에 유효한 데이터가 없습니다.')
          return
        }

        setUploadParsedRows(rows)
        setUploadMsg(`${rows.length}명의 선택과목 데이터를 불러왔습니다.`)
      } catch (err) {
        setUploadMsg(`파일 파싱 실패: ${err.message}`)
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = '' // 같은 파일 재업로드 가능하도록
  }

  const applyElectiveUpload = async () => {
    if (uploadParsedRows.length === 0) return
    setUploadSaving(true)
    try {
      const batch = writeBatch(db)
      let updated = 0
      const unmatchedNames = new Set()

      uploadParsedRows.forEach(row => {
        // 학번으로 학생 찾기 (마지막 5자리)
        const student = studentList.find(s =>
          s.studentId === row.studentId ||
          s.studentId?.endsWith(row.studentId.slice(-5))
        )

        if (student) {
          // 업로드된 과목명을 학생 학년의 교육과정 과목과 맞춰 subjectId를 붙인다.
          // 못 찾으면 이름만 저장되고 목록에서 주황색으로 표시된다.
          const grade = Number(student.grade) || null
          const entryYear = grade ? entryYearFor(currentSchoolYear(), grade) : null
          const withRefs = row.electives.map(e => {
            const hit = catalog.find(c =>
              (c.name || '').trim() === e.subjectName &&
              (!grade || c.grade === grade) &&
              (!entryYear || c.entryYear === entryYear) &&
              (c.semester === 'both' || Number(c.semester) === e.semester)
            )
            if (!hit) unmatchedNames.add(e.subjectName)
            return { ...e, subjectId: hit?.id || '', subjectName: hit?.name || e.subjectName }
          })

          const studentRef = doc(db, 'schools', schoolId, 'students', student.id)
          batch.update(studentRef, {
            electiveSubjects: withRefs,
            electiveSubjectsUpdatedAt: new Date()
          })
          updated++
        }
      })

      await batch.commit()
      await fetchStudents() // 새로고침
      setUploadMsg(
        `${updated}명의 선택과목 정보를 업데이트했습니다.` +
        (unmatchedNames.size > 0
          ? ` ⚠️ 교육과정 과목 목록에서 찾지 못한 과목 ${unmatchedNames.size}건: ${[...unmatchedNames].join(', ')}`
          : '')
      )
      setUploadParsedRows([])
    } catch (err) {
      setUploadMsg(`업로드 실패: ${err.message}`)
    } finally {
      setUploadSaving(false)
    }
  }

  // CSV 다운로드 함수
  const downloadStudentCsv = () => {
    if (studentList.length === 0) {
      alert('다운로드할 학생 데이터가 없습니다.')
      return
    }

    // CSV 헤더 생성
    // 선택과목은 과목마다 분반이 다르므로 과목명과 분반을 짝으로 내보낸다
    const maxElectives = Math.max(...studentList.map(s => readElectives(s).length), 0)
    const electiveHeaders = Array.from({ length: maxElectives },
      (_, i) => [`학기${i + 1}`, `선택과목${i + 1}`, `분반${i + 1}`]).flat()
    const header = ['학년', '반', '번호', '이름', '학번', '이메일', ...electiveHeaders]

    // CSV 데이터 생성
    const rows = studentList.map(s => {
      const electives = readElectives(s)
      const electiveValues = Array.from({ length: maxElectives }, (_, i) =>
        [electives[i]?.semester || '', electives[i]?.subjectName || '', electives[i]?.classNo || '']).flat()
      return [
        s.grade ?? '',
        s.class ?? '',
        s.number ?? '',
        s.name || '',
        s.studentId || '',
        s.email || '',
        ...electiveValues
      ]
    })

    // CSV 문자열 생성
    const csvContent = [
      header.join(','),
      ...rows.map(row => row.map(cell => {
        // 쉼표나 줄바꿈이 포함된 경우 따옴표로 감싸기
        const cellStr = String(cell)
        if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
          return `"${cellStr.replace(/"/g, '""')}"`
        }
        return cellStr
      }).join(','))
    ].join('\n')

    // BOM 추가 (Excel에서 한글 깨짐 방지)
    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    link.download = `학생명단_${dateStr}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 학생 편집 열기
  const openEditStudent = (student) => {
    setEditingStudent(student)
    setEditForm({
      electiveSubjects: readElectives(student)
    })
    setEditDialogOpen(true)
  }

  // 학생 편집 저장
  const saveStudentEdit = async () => {
    if (!editingStudent) return
    setEditSaving(true)
    try {
      const studentRef = doc(db, 'schools', schoolId, 'students', editingStudent.id)
      await updateDoc(studentRef, {
        // 과목명이 빈 행은 버리고, 분반은 숫자로 정규화해 저장한다
        electiveSubjects: editForm.electiveSubjects
          .filter(e => e.subjectName.trim())
          .map(e => ({
            subjectId: e.subjectId || '',
            subjectName: e.subjectName.trim(),
            classNo: e.classNo === '' ? '' : String(e.classNo).trim(),
            semester: Number(e.semester) === 2 ? 2 : 1,
          })),
        electiveSubjectsUpdatedAt: new Date()
      })
      await fetchStudents()
      setEditDialogOpen(false)
      setEditingStudent(null)
    } catch (err) {
      alert(`저장 실패: ${err.message}`)
    } finally {
      setEditSaving(false)
    }
  }

  // 선택과목 추가
  const addElectiveSubject = (semester) => {
    setEditForm(prev => ({
      ...prev,
      electiveSubjects: [...prev.electiveSubjects, { subjectId: '', subjectName: '', classNo: '', semester }]
    }))
  }

  // 선택과목 한 칸의 필드 수정
  const updateElectiveField = (index, patch) => {
    setEditForm(prev => ({
      ...prev,
      electiveSubjects: prev.electiveSubjects.map((s, i) => i === index ? { ...s, ...patch } : s)
    }))
  }

  // 과목명 칸에서 카탈로그 과목을 고르거나 직접 입력했을 때.
  // 카탈로그에서 고르면 subjectId가 붙어 과목명이 바뀌어도 연결이 유지된다.
  const selectElectiveSubject = (index, value) => {
    updateElectiveField(index, typeof value === 'string' || value == null
      ? { subjectId: '', subjectName: value || '' }
      : { subjectId: value.id, subjectName: value.name || '' })
  }

  // 선택과목 삭제
  const removeElectiveSubject = (index) => {
    setEditForm(prev => ({
      ...prev,
      electiveSubjects: prev.electiveSubjects.filter((_, i) => i !== index)
    }))
  }

  // 필터링
  const filteredStudents = studentList.filter(s => {
    // 학년 필터
    if (gradeFilter !== 'all' && String(s.grade) !== gradeFilter) return false

    // 학급 필터
    if (classFilter !== 'all' && String(s.class) !== classFilter) return false

    // 검색어 필터
    if (studentSearch.trim()) {
      const q = studentSearch.trim().toLowerCase()
      if (
        !(s.name || '').toLowerCase().includes(q) &&
        !(s.studentId || '').includes(q) &&
        !(s.email || '').toLowerCase().includes(q)
      ) return false
    }

    return true
  })

  // 사용 가능한 학급 목록 (현재 학년 필터에 따라)
  const availableClasses = gradeFilter === 'all'
    ? []
    : [...new Set(
        studentList
          .filter(s => String(s.grade) === gradeFilter)
          .map(s => s.class)
          .filter(Boolean)
      )].sort((a, b) => a - b)

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          학생 관리
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={downloadStudentCsv}
            disabled={studentList.length === 0}
          >
            CSV 다운로드
          </Button>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setUploadDialogOpen(true)}
          >
            선택과목 업로드
          </Button>
        </Box>
      </Box>

      {/* 필터 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>학년</InputLabel>
          <Select
            value={gradeFilter}
            label="학년"
            onChange={(e) => {
              setGradeFilter(e.target.value)
              setClassFilter('all') // 학년 변경 시 반 필터 초기화
            }}
          >
            <MenuItem value="all">전체</MenuItem>
            <MenuItem value="1">1학년</MenuItem>
            <MenuItem value="2">2학년</MenuItem>
            <MenuItem value="3">3학년</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 100 }} disabled={gradeFilter === 'all'}>
          <InputLabel>반</InputLabel>
          <Select
            value={classFilter}
            label="반"
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <MenuItem value="all">전체</MenuItem>
            {availableClasses.map(c => (
              <MenuItem key={c} value={String(c)}>{c}반</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          value={studentSearch}
          onChange={e => setStudentSearch(e.target.value)}
          placeholder="이름·학번·이메일 검색"
          size="small"
          sx={{ maxWidth: 300 }}
        />
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : studentList.length === 0 ? (
        <Alert severity="info">
          등록된 학생이 없습니다. Workspace 동기화를 사용 중이면 계정 관리 탭에서 동기화를 실행해보세요.
        </Alert>
      ) : filteredStudents.length === 0 ? (
        <Typography color="text.secondary">검색 결과가 없습니다.</Typography>
      ) : (
        <>
          <table style={table.table}>
            <thead style={table.thead}>
              <tr>
                <th style={table.th}>학년</th>
                <th style={table.th}>반</th>
                <th style={table.th}>번호</th>
                <th style={table.th}>이름</th>
                <th style={table.th}>학번</th>
                <th style={table.th}>이메일</th>
                <th style={table.th}>선택과목</th>
                <th style={table.th}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(s => (
                <tr key={s.id} style={table.tr}>
                  <td style={table.td}>{s.grade ?? '—'}</td>
                  <td style={table.td}>{s.class ?? '—'}</td>
                  <td style={table.td}>{s.number ?? '—'}</td>
                  <td style={table.td}>
                    {s.name || '—'}
                  </td>
                  <td style={table.td}>{s.studentId}</td>
                  <td style={table.td}>{s.email || '—'}</td>
                  <td style={table.td}>
                    {s.electiveSubjects && s.electiveSubjects.length > 0 ? (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                        {[1, 2].map(sem => {
                          const list = readElectives(s).filter(e => e.semester === sem)
                          if (!list.length) return null
                          return (
                            <Box key={sem} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', width: '100%' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28 }}>{sem}학기</Typography>
                              {list.map((e, idx) => (
                                <Chip
                                  key={idx}
                                  label={electiveLabel(e)}
                                  size="small"
                                  variant="outlined"
                                  color={e.subjectId ? 'default' : 'warning'}
                                  title={e.subjectId ? '' : '교육과정 과목 목록에 없는 과목'}
                                />
                              ))}
                            </Box>
                          )
                        })}
                        <EditAction onClick={() => openEditStudent(s)} title="선택과목 편집" />
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span style={{ color: '#999' }}>—</span>
                        <EditAction onClick={() => openEditStudent(s)} title="선택과목 추가" />
                      </Box>
                    )}
                  </td>
                  <td style={table.td}>
                    <RowActions>
                      <DeleteAction onClick={() => deleteStudent(s.id, s.name || s.studentId)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            총 {studentList.length}명
            {(gradeFilter !== 'all' || classFilter !== 'all' || studentSearch.trim()) &&
              ` · 필터 결과 ${filteredStudents.length}명`}
          </Typography>
        </>
      )}

      {/* 선택과목 업로드 다이얼로그 */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>선택과목 분반 정보 업로드</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            CSV 파일 형식: <code>학번, 이름, 선택과목1, 선택과목2, ...</code>
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>학년</InputLabel>
            <Select
              value={uploadGrade}
              label="학년"
              onChange={(e) => setUploadGrade(e.target.value)}
            >
              <MenuItem value={2}>2학년</MenuItem>
              <MenuItem value={3}>3학년</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            component="label"
            fullWidth
            sx={{ mb: 2 }}
          >
            CSV 파일 선택
            <input
              type="file"
              hidden
              accept=".csv"
              onChange={handleElectiveUpload}
            />
          </Button>

          {uploadMsg && (
            <Alert severity={uploadMsg.includes('실패') ? 'error' : 'success'} sx={{ mb: 2 }}>
              {uploadMsg}
            </Alert>
          )}

          {uploadParsedRows.length > 0 && (
            <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: 1, p: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                미리보기 (처음 10명)
              </Typography>
              {uploadParsedRows.slice(0, 10).map((row, idx) => (
                <Box key={idx} sx={{ fontSize: '0.85rem', mb: 0.5 }}>
                  <strong>{row.studentId}</strong> {row.name} → {row.electives.join(', ')}
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)} disabled={uploadSaving}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={applyElectiveUpload}
            disabled={uploadParsedRows.length === 0 || uploadSaving}
          >
            {uploadSaving ? '저장 중...' : '적용'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 학생 선택과목 편집 다이얼로그 */}
      <Dialog open={editDialogOpen} onClose={() => !editSaving && setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          선택과목 편집 - {editingStudent?.name} ({editingStudent?.grade}학년 {editingStudent?.class}반 {editingStudent?.number}번)
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            과목명은 <strong>과목 관리</strong>에 등록된 목록에서 고르세요. 목록에서 고르면 과목명이 바뀌어도 연결이 유지됩니다.
            선택과목은 과목마다 분반 편성이 다르므로 <strong>분반</strong>을 함께 입력합니다.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[1, 2].map(semester => {
              const options = electiveOptionsFor(semester)
              return (
                <Box key={semester}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700}>{semester}학기 선택과목</Typography>
                    <Button size="small" onClick={() => addElectiveSubject(semester)} disabled={editSaving}>
                      + 과목 추가
                    </Button>
                  </Box>

                  {options.length === 0 && (
                    <Alert severity="info" sx={{ mb: 1 }}>
                      {editingStudent?.grade}학년 {semester}학기에 등록된 학생선택 과목이 없습니다. 과목 관리에서 먼저 등록하세요.
                    </Alert>
                  )}

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {editForm.electiveSubjects.map((elective, index) => {
                      if (Number(elective.semester) !== semester) return null
                      const matched = options.find(o => o.id === elective.subjectId) || null
                      return (
                        <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Autocomplete
                            freeSolo
                            fullWidth
                            options={options}
                            value={matched || elective.subjectName || ''}
                            getOptionLabel={(o) => (typeof o === 'string' ? o : o?.name || '')}
                            isOptionEqualToValue={(opt, val) => opt.id === val?.id}
                            disabled={editSaving}
                            onChange={(_, val) => selectElectiveSubject(index, val)}
                            onInputChange={(_, val, reason) => {
                              if (reason === 'input') selectElectiveSubject(index, val)
                            }}
                            renderOption={(props, option) => (
                              <li {...props} key={option.id}>
                                {option.name}
                                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                  {option.courseType} · {option.credits}학점
                                </Typography>
                              </li>
                            )}
                            renderInput={(params) => (
                              <TextField {...params} size="small" placeholder="과목명" />
                            )}
                          />
                          <TextField
                            label="분반"
                            size="small"
                            type="number"
                            value={elective.classNo}
                            onChange={(e) => updateElectiveField(index, { classNo: e.target.value })}
                            disabled={editSaving}
                            sx={{ width: 90 }}
                          />
                          <DeleteAction onClick={() => removeElectiveSubject(index)} disabled={editSaving} />
                        </Box>
                      )
                    })}
                  </Box>
                </Box>
              )
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={editSaving}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={saveStudentEdit}
            disabled={editSaving}
          >
            {editSaving ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
