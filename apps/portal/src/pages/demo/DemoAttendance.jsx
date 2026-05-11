import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Grid from '@mui/material/Grid'
import Snackbar from '@mui/material/Snackbar'
import DemoLayout from './DemoLayout'

const EVENT = {
  title: '2학년 선택과목 영어회화',
  date: '2026-05-20',
  period: '3교시',
  teacher: '박지훈',
  location: '영어전용교실 (204호)',
}

const INITIAL_STUDENTS = [
  { id: 1, name: '강다은', grade: 2, class: '선택', number: 1,  status: 'present', checkTime: '10:05' },
  { id: 2, name: '김민재', grade: 2, class: '선택', number: 2,  status: 'present', checkTime: '10:06' },
  { id: 3, name: '나예진', grade: 2, class: '선택', number: 3,  status: 'absent',  checkTime: null },
  { id: 4, name: '류승현', grade: 2, class: '선택', number: 4,  status: 'none',    checkTime: null },
  { id: 5, name: '박서윤', grade: 2, class: '선택', number: 5,  status: 'late',    checkTime: '10:18' },
  { id: 6, name: '송하준', grade: 2, class: '선택', number: 6,  status: 'none',    checkTime: null },
  { id: 7, name: '오채린', grade: 2, class: '선택', number: 7,  status: 'present', checkTime: '10:04' },
  { id: 8, name: '윤지호', grade: 2, class: '선택', number: 8,  status: 'none',    checkTime: null },
  { id: 9, name: '이도현', grade: 2, class: '선택', number: 9,  status: 'present', checkTime: '10:07' },
  { id: 10, name: '정수아', grade: 2, class: '선택', number: 10, status: 'none',    checkTime: null },
]

const STATUS_CONFIG = {
  present: { label: '출석', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  late:    { label: '지각', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  absent:  { label: '결석', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  none:    { label: '미체크', color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}

export default function DemoAttendance() {
  const [students, setStudents] = useState(INITIAL_STUDENTS)
  const [snackbar, setSnackbar] = useState('')

  const presentCount = students.filter(s => s.status === 'present').length
  const lateCount    = students.filter(s => s.status === 'late').length
  const absentCount  = students.filter(s => s.status === 'absent').length
  const noneCount    = students.filter(s => s.status === 'none').length

  const handleCheckin = (id) => {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    setStudents(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'present', checkTime: timeStr } : s
    ))
    const student = students.find(s => s.id === id)
    setSnackbar(`📱 ${student.name} QR 체크인 — 출석 처리 (데모)`)
  }

  const handleMarkAbsent = (id) => {
    setStudents(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'absent', checkTime: null } : s
    ))
  }

  const handleReset = () => setStudents(INITIAL_STUDENTS)

  return (
    <DemoLayout>
      {/* 이벤트 정보 */}
      <Paper elevation={0} sx={{ border: '1px solid #ede9fe', borderRadius: 3, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={700} mb={0.5}>{EVENT.title}</Typography>
            <Typography fontSize="0.88rem" color="text.secondary">
              {EVENT.date} · {EVENT.period} · {EVENT.location}
            </Typography>
            <Typography fontSize="0.84rem" color="text.secondary" mt={0.25}>
              담당: {EVENT.teacher} 선생님
            </Typography>
          </Box>
          <Button variant="outlined" size="small" onClick={handleReset}
            sx={{ color: '#94a3b8', borderColor: '#e2e8f0', alignSelf: 'flex-start', fontSize: '0.78rem' }}>
            초기화
          </Button>
        </Box>

        {/* 통계 */}
        <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
          {[
            { label: '출석', count: presentCount, color: '#15803d', bg: '#f0fdf4' },
            { label: '지각', count: lateCount,    color: '#b45309', bg: '#fffbeb' },
            { label: '결석', count: absentCount,  color: '#dc2626', bg: '#fef2f2' },
            { label: '미체크', count: noneCount,  color: '#64748b', bg: '#f8fafc' },
          ].map(s => (
            <Grid item xs={3} key={s.label}>
              <Box sx={{ bgcolor: s.bg, borderRadius: 2, py: 1.25, textAlign: 'center' }}>
                <Typography fontWeight={800} fontSize="1.4rem" color={s.color}>{s.count}</Typography>
                <Typography fontSize="0.74rem" color={s.color} fontWeight={600}>{s.label}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        {/* 진행 바 */}
        <Box sx={{ mt: 2, bgcolor: '#f1f5f9', borderRadius: 1, height: 6, overflow: 'hidden', display: 'flex' }}>
          <Box sx={{ height: '100%', bgcolor: '#22c55e', width: `${presentCount / students.length * 100}%`, transition: 'width 0.3s' }} />
          <Box sx={{ height: '100%', bgcolor: '#f59e0b', width: `${lateCount / students.length * 100}%`, transition: 'width 0.3s' }} />
          <Box sx={{ height: '100%', bgcolor: '#ef4444', width: `${absentCount / students.length * 100}%`, transition: 'width 0.3s' }} />
        </Box>
      </Paper>

      {/* QR 안내 */}
      <Paper elevation={0} sx={{ border: '1.5px dashed #c4b5fd', borderRadius: 2, p: 2, mb: 3, bgcolor: '#faf5ff' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography fontSize="1.5rem">📱</Typography>
          <Box>
            <Typography fontWeight={600} fontSize="0.9rem" color="#6d28d9">QR 체크인 시뮬레이션</Typography>
            <Typography fontSize="0.82rem" color="#7c6d9a">
              실제 서비스에서는 학생이 QR 코드를 스캔하면 자동으로 출석 처리됩니다.
              데모에서는 아래 버튼으로 체험해보세요.
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* 학생 목록 */}
      <Typography fontWeight={700} mb={1.5}>학생 명단 ({students.length}명)</Typography>
      <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['번호', '이름', '상태', '체크 시각', 'QR 체크인 시뮬레이션', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map(s => {
              const sc = STATUS_CONFIG[s.status]
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 16px', fontSize: '0.84rem', color: '#94a3b8' }}>{s.number}</td>
                  <td style={{ padding: '10px 16px', fontSize: '0.9rem', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.75rem', border: `1px solid ${sc.border}` }} />
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '0.84rem', color: '#64748b', fontFamily: 'monospace' }}>
                    {s.checkTime || '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {s.status === 'none' || s.status === 'absent' ? (
                      <Button size="small" variant="outlined" onClick={() => handleCheckin(s.id)}
                        sx={{ fontSize: '0.78rem', borderColor: '#7c3aed', color: '#7c3aed',
                          '&:hover': { bgcolor: '#faf5ff', borderColor: '#6d28d9' } }}>
                        📱 QR 스캔
                      </Button>
                    ) : (
                      <Typography fontSize="0.78rem" color="text.disabled">완료</Typography>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {s.status === 'none' && (
                      <Button size="small" color="error" variant="text" onClick={() => handleMarkAbsent(s.id)}
                        sx={{ fontSize: '0.74rem', minWidth: 0 }}>
                        결석
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Paper>

      <Snackbar
        open={!!snackbar} autoHideDuration={2500}
        onClose={() => setSnackbar('')} message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </DemoLayout>
  )
}
