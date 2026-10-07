import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { readElectives, electiveLabel } from '@shared/lib/subjectData'
import { table } from './adminUi'
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
import Chip from '@mui/material/Chip'
import DownloadIcon from '@mui/icons-material/Download'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'

/**
 * 학생 명단 조회. 학생 데이터의 쓰기 주체는 StudentHub(학적·고사 관리)다(2026-10) —
 * 학적 변동·명단 삭제·선택과목 업로드/편집·Workspace 학생 동기화는 StudentHub에서 한다.
 * 이 화면은 조회와 CSV 내려받기만 남긴다.
 */
export default function AdminStudents() {
  const { schoolId } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [studentList, setStudentList] = useState([])
  const [studentSearch, setStudentSearch] = useState('')

  // 필터
  const [gradeFilter, setGradeFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')

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
            variant="outlined"
            endIcon={<OpenInNewIcon />}
            onClick={() => navigate('/studenthub?next=/electives')}
          >
            선택과목 관리
          </Button>
          <Button
            variant="contained"
            endIcon={<OpenInNewIcon />}
            onClick={() => navigate('/studenthub?next=/students')}
          >
            학적 관리
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        학생 명단은 <strong>StudentHub(학적·고사 관리)</strong>에서 관리합니다. 학적 변동·명단 삭제·선택과목 업로드와 편집,
        Workspace 학생 동기화는 위 버튼으로 StudentHub에서 하세요. 여기서는 조회와 CSV 내려받기만 할 수 있습니다.
      </Alert>

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
          등록된 학생이 없습니다. StudentHub 「Workspace 학생 동기화」에서 동기화를 실행해 보세요.
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
                      </Box>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
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

    </Box>
  )
}
