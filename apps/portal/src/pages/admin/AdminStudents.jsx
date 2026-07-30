import { useEffect, useState } from 'react'
import { collection, getDocs, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
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
import IconButton from '@mui/material/IconButton'
import UploadIcon from '@mui/icons-material/Upload'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'

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

  useEffect(() => {
    if (!schoolId) return
    fetchStudents()
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
    const electiveIndices = []
    header.forEach((h, idx) => {
      if (h.startsWith('선택과목') || h.toLowerCase().startsWith('elective')) {
        electiveIndices.push(idx)
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
      const electives = electiveIndices.map(idx => cells[idx] || '').filter(Boolean)

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

      uploadParsedRows.forEach(row => {
        // 학번으로 학생 찾기 (마지막 5자리)
        const student = studentList.find(s =>
          s.studentId === row.studentId ||
          s.studentId?.endsWith(row.studentId.slice(-5))
        )

        if (student) {
          const studentRef = doc(db, 'schools', schoolId, 'students', student.id)
          batch.update(studentRef, {
            electiveSubjects: row.electives,
            electiveSubjectsUpdatedAt: new Date()
          })
          updated++
        }
      })

      await batch.commit()
      await fetchStudents() // 새로고침
      setUploadMsg(`${updated}명의 선택과목 정보를 업데이트했습니다.`)
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
    const maxElectives = Math.max(...studentList.map(s => (s.electiveSubjects || []).length), 0)
    const electiveHeaders = Array.from({ length: maxElectives }, (_, i) => `선택과목${i + 1}`)
    const header = ['학년', '반', '번호', '이름', '학번', '이메일', ...electiveHeaders]

    // CSV 데이터 생성
    const rows = studentList.map(s => {
      const electives = s.electiveSubjects || []
      const electiveValues = Array.from({ length: maxElectives }, (_, i) => electives[i] || '')
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
      electiveSubjects: student.electiveSubjects || []
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
        electiveSubjects: editForm.electiveSubjects.filter(s => s.trim()),
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
  const addElectiveSubject = () => {
    setEditForm(prev => ({
      ...prev,
      electiveSubjects: [...prev.electiveSubjects, '']
    }))
  }

  // 선택과목 수정
  const updateElectiveSubject = (index, value) => {
    setEditForm(prev => ({
      ...prev,
      electiveSubjects: prev.electiveSubjects.map((s, i) => i === index ? value : s)
    }))
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
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>학년</th>
                <th style={styles.th}>반</th>
                <th style={styles.th}>번호</th>
                <th style={styles.th}>이름</th>
                <th style={styles.th}>학번</th>
                <th style={styles.th}>이메일</th>
                <th style={styles.th}>선택과목</th>
                <th style={styles.th}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(s => (
                <tr key={s.id}>
                  <td style={styles.td}>{s.grade ?? '—'}</td>
                  <td style={styles.td}>{s.class ?? '—'}</td>
                  <td style={styles.td}>{s.number ?? '—'}</td>
                  <td style={styles.td}>
                    {s.name || '—'}
                  </td>
                  <td style={styles.td}>{s.studentId}</td>
                  <td style={styles.td}>{s.email || '—'}</td>
                  <td style={styles.td}>
                    {s.electiveSubjects && s.electiveSubjects.length > 0 ? (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                        {s.electiveSubjects.map((subj, idx) => (
                          <Chip key={idx} label={subj} size="small" variant="outlined" />
                        ))}
                        <IconButton
                          size="small"
                          onClick={() => openEditStudent(s)}
                          title="선택과목 편집"
                          sx={{ ml: 0.5 }}
                        >
                          <EditIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span style={{ color: '#999' }}>—</span>
                        <IconButton
                          size="small"
                          onClick={() => openEditStudent(s)}
                          title="선택과목 추가"
                        >
                          <EditIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Box>
                    )}
                  </td>
                  <td style={styles.td}>
                    <IconButton
                      size="small"
                      onClick={() => deleteStudent(s.id, s.name || s.studentId)}
                      title="삭제"
                      color="error"
                    >
                      <DeleteIcon sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
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
            학생의 선택과목을 개별적으로 추가하거나 삭제할 수 있습니다.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {editForm.electiveSubjects.map((subject, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  fullWidth
                  size="small"
                  value={subject}
                  onChange={(e) => updateElectiveSubject(index, e.target.value)}
                  placeholder={`선택과목 ${index + 1}`}
                  disabled={editSaving}
                />
                <IconButton
                  size="small"
                  onClick={() => removeElectiveSubject(index)}
                  disabled={editSaving}
                  color="error"
                  title="삭제"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}

            <Button
              variant="outlined"
              onClick={addElectiveSubject}
              disabled={editSaving}
              sx={{ mt: 1 }}
            >
              + 선택과목 추가
            </Button>
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

const styles = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: '0.6rem 0.8rem',
    backgroundColor: '#f0f0f0',
    fontSize: '0.85rem',
    fontWeight: 600
  },
  td: {
    padding: '0.6rem 0.8rem',
    borderBottom: '1px solid #eee',
    fontSize: '0.9rem',
    verticalAlign: 'middle'
  },
}
