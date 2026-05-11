import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import DemoLayout from './DemoLayout'

const TRAINING = {
  title: '2026학년도 1학기 전체 교직원 연수',
  date: '2026-05-20',
  startTime: '15:00',
  endTime: '17:00',
  location: '시청각실',
  description: '학교 교육과정 운영 및 생활지도 역량 강화',
  createdByName: '김교감',
}

const INITIAL_MEMBERS = [
  { uid: '1',  name: '강민준', staffType: '교사',   signed: true,  signedAt: '15:02' },
  { uid: '2',  name: '김서연', staffType: '교사',   signed: true,  signedAt: '15:05' },
  { uid: '3',  name: '박지훈', staffType: '교사',   signed: true,  signedAt: '15:08' },
  { uid: '4',  name: '이수진', staffType: '교사',   signed: false, signedAt: null },
  { uid: '5',  name: '최민혁', staffType: '교사',   signed: false, signedAt: null },
  { uid: '6',  name: '정예린', staffType: '교사',   signed: true,  signedAt: '15:11' },
  { uid: '7',  name: '한도윤', staffType: '교직원', signed: false, signedAt: null },
  { uid: '8',  name: '오채원', staffType: '교직원', signed: true,  signedAt: '15:03' },
]

export default function DemoTraining() {
  const [members, setMembers] = useState(INITIAL_MEMBERS)
  const [signDialog, setSignDialog] = useState(false)
  const [signTarget, setSignTarget] = useState(null)
  const [snackbar, setSnackbar] = useState('')
  const [signedImages, setSignedImages] = useState({})

  const signedCount = members.filter(m => m.signed).length

  const handleSignSave = (uid, dataUrl) => {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    setMembers(prev => prev.map(m => m.uid === uid ? { ...m, signed: true, signedAt: timeStr } : m))
    setSignedImages(prev => ({ ...prev, [uid]: dataUrl }))
    setSignDialog(false)
    setSnackbar('✅ 서명이 완료되었습니다! (데모 — 저장되지 않습니다)')
  }

  return (
    <DemoLayout>
      {/* 연수 정보 */}
      <Paper elevation={0} sx={{ border: '1px solid #ede9fe', borderRadius: 3, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h5" fontWeight={700} mb={0.5}>{TRAINING.title}</Typography>
            <Typography fontSize="0.88rem" color="text.secondary">
              {TRAINING.date} · {TRAINING.startTime}–{TRAINING.endTime} · {TRAINING.location}
            </Typography>
            <Typography fontSize="0.84rem" color="text.secondary" mt={0.25}>{TRAINING.description}</Typography>
          </Box>
          <Box textAlign="right">
            <Typography fontSize="1.6rem" fontWeight={800}
              color={signedCount === members.length ? 'success.main' : 'text.primary'}>
              {signedCount}<Typography component="span" fontSize="1rem" color="text.secondary">/{members.length}</Typography>
            </Typography>
            <Typography fontSize="0.75rem" color="text.secondary">서명 완료</Typography>
          </Box>
        </Box>

        {/* 진행 바 */}
        <Box sx={{ mt: 2, bgcolor: '#f1f5f9', borderRadius: 1, height: 6, overflow: 'hidden' }}>
          <Box sx={{
            height: '100%', borderRadius: 1,
            bgcolor: signedCount === members.length ? '#22c55e' : '#7c3aed',
            width: `${(signedCount / members.length) * 100}%`,
            transition: 'width 0.4s ease',
          }} />
        </Box>
      </Paper>

      {/* 서명 현황 테이블 */}
      <Typography fontWeight={700} mb={1.5}>서명 현황</Typography>
      <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden', mb: 3 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['이름', '구분', '서명 시각', '서명 이미지', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.uid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 16px', fontSize: '0.88rem', fontWeight: 600 }}>{m.name}</td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
                    backgroundColor: m.staffType === '교사' ? '#e0f2fe' : '#f0fdf4',
                    color: m.staffType === '교사' ? '#0369a1' : '#15803d',
                  }}>{m.staffType}</span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: '0.84rem', color: m.signed ? '#15803d' : '#94a3b8' }}>
                  {m.signed ? m.signedAt : '—'}
                </td>
                <td style={{ padding: '10px 16px' }}>
                  {signedImages[m.uid] ? (
                    <img src={signedImages[m.uid]} alt="서명" style={{ height: 36, maxWidth: 100, objectFit: 'contain' }} />
                  ) : m.signed ? (
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>✓ 완료</span>
                  ) : '—'}
                </td>
                <td style={{ padding: '10px 16px' }}>
                  {!m.signed ? (
                    <Button size="small" variant="outlined" color="primary"
                      onClick={() => { setSignTarget(m); setSignDialog(true) }}
                      sx={{ fontSize: '0.78rem' }}>
                      서명하기
                    </Button>
                  ) : (
                    <Chip label="완료" size="small" color="success" variant="outlined" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Paper>

      {/* 서명 다이얼로그 */}
      {signTarget && (
        <SignDialog
          open={signDialog}
          member={signTarget}
          onClose={() => setSignDialog(false)}
          onSave={handleSignSave}
        />
      )}

      <Snackbar
        open={!!snackbar} autoHideDuration={4000}
        onClose={() => setSnackbar('')} message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </DemoLayout>
  )
}

// ── 서명 다이얼로그 ─────────────────────────────────────────
function SignDialog({ open, member, onClose, onSave }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [SignaturePad, setSignaturePad] = useState(null)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    import('react-signature-canvas')
      .then(m => { setSignaturePad(() => m.default); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setCanvasWidth(containerRef.current.offsetWidth)
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [open])

  const handleSave = () => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) {
      alert('서명을 입력해주세요.')
      return
    }
    const dataUrl = canvasRef.current.getTrimmedCanvas().toDataURL('image/png')
    onSave(member.uid, dataUrl)
  }

  const canvasHeight = canvasWidth > 0 ? Math.max(130, Math.round(canvasWidth * 0.36)) : 160

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {member.name} 서명
        <Typography variant="body2" color="text.secondary" fontWeight={400} mt={0.25}>
          아래 영역에 손가락 또는 펜으로 서명하세요.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box ref={containerRef} sx={{ width: '100%', mt: 1 }}>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress size={24} /></Box>
          ) : SignaturePad && canvasWidth > 0 ? (
            <Box sx={{ border: '2px solid #7c3aed', borderRadius: 2, overflow: 'hidden', touchAction: 'none' }}>
              <SignaturePad
                ref={canvasRef}
                canvasProps={{ width: canvasWidth, height: canvasHeight, style: { display: 'block', touchAction: 'none' } }}
                backgroundColor="white"
                penColor="#1e293b"
                dotSize={2.5} minWidth={1.5} maxWidth={3.5}
              />
            </Box>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={() => canvasRef.current?.clear()} color="inherit">다시 그리기</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
          서명 저장
        </Button>
      </DialogActions>
    </Dialog>
  )
}
