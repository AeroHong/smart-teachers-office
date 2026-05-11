import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import {
  doc, getDoc, collection, onSnapshot, setDoc, serverTimestamp,
  getDocs, updateDoc,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { SCHOOL_ID } from './trainingUtils'

export default function TrainingSign() {
  const { id } = useParams()
  const { user, role, loading: authLoading } = useAuth()
  const [training, setTraining] = useState(null)
  const [signatures, setSignatures] = useState({})
  const [loadingTraining, setLoadingTraining] = useState(true)

  useEffect(() => {
    getDoc(doc(db, 'schools', SCHOOL_ID, 'trainings', id)).then(d => {
      if (d.exists()) setTraining({ id: d.id, ...d.data() })
      setLoadingTraining(false)
    }).catch(() => setLoadingTraining(false))
  }, [id])

  useEffect(() => {
    if (role === 'pending') return
    const unsub = onSnapshot(
      collection(db, 'schools', SCHOOL_ID, 'trainings', id, 'signatures'),
      snap => {
        const map = {}
        snap.forEach(d => { map[d.id] = d.data() })
        setSignatures(map)
      },
      () => {}
    )
    return unsub
  }, [id, role])

  if (authLoading || loadingTraining) {
    return (
      <SignLayout>
        <Box display="flex" justifyContent="center" py={12}><CircularProgress /></Box>
      </SignLayout>
    )
  }

  // 승인 대기 중 → 관리자에게 안내
  if (role === 'pending') {
    return (
      <SignLayout>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography fontSize="2.5rem" mb={2}>⏳</Typography>
          <Typography fontWeight={700} fontSize="1.1rem" mb={1.5}>승인 대기 중입니다</Typography>
          <Typography fontSize="0.9rem" color="text.secondary" mb={0.75}>
            관리자에게 승인을 요청해주세요.
          </Typography>
          <Typography fontSize="0.84rem" color="text.secondary">
            승인 후 이 페이지를 다시 방문하면 서명할 수 있습니다.
          </Typography>
        </Box>
      </SignLayout>
    )
  }

  if (!training) {
    return (
      <SignLayout>
        <Box textAlign="center" py={8} color="text.secondary">
          <Typography fontSize="1.5rem" mb={1}>😕</Typography>
          <Typography>연수를 찾을 수 없습니다.</Typography>
        </Box>
      </SignLayout>
    )
  }

  if (training.status === 'closed') {
    return (
      <SignLayout>
        <TrainingHeader training={training} />
        <Box textAlign="center" py={6} color="text.secondary">
          <Typography fontSize="1.5rem" mb={1}>🔒</Typography>
          <Typography fontWeight={600}>서명이 마감되었습니다</Typography>
        </Box>
      </SignLayout>
    )
  }

  return (
    <SignLayout>
      <TrainingHeader training={training} />
      <MobileSignaturePad
        id={id}
        user={user}
        training={training}
        signatures={signatures}
      />
    </SignLayout>
  )
}

// ── 최소 레이아웃 (사이드바 없음 - 모바일 QR 접속용) ────────────────────────

function SignLayout({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{
        bgcolor: '#4f46e5', color: '#fff',
        px: 2.5, py: 1.5,
        display: 'flex', alignItems: 'center',
        flexShrink: 0,
      }}>
        <Typography fontWeight={700} fontSize="0.9rem" letterSpacing="-0.01em">
          🏫 선유고 스마트교무실
        </Typography>
      </Box>
      <Box sx={{ flex: 1, maxWidth: 600, width: '100%', mx: 'auto', px: 2.5, py: 3 }}>
        {children}
      </Box>
    </Box>
  )
}

// ── 연수 정보 헤더 ─────────────────────────────────────────────────────────────

function TrainingHeader({ training }) {
  const timeStr = training.startTime && training.endTime
    ? `${training.startTime}–${training.endTime}`
    : training.startTime || ''
  const metaStr = [training.date, timeStr, training.location].filter(Boolean).join(' · ')

  return (
    <Box sx={{ mb: 3, pb: 2.5, borderBottom: '1px solid #e2e8f0' }}>
      <Typography variant="h5" fontWeight={700} mb={0.5}>{training.title}</Typography>
      {metaStr && (
        <Typography fontSize="0.88rem" color="text.secondary">{metaStr}</Typography>
      )}
      {training.description && (
        <Typography fontSize="0.84rem" color="text.secondary" mt={0.25}>
          {training.description}
        </Typography>
      )}
    </Box>
  )
}

// ── 모바일 서명 패드 ──────────────────────────────────────────────────────────

function MobileSignaturePad({ id, user, training, signatures }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [SignaturePad, setSignaturePad] = useState(null)
  const [padLoading, setPadLoading] = useState(true)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showPad, setShowPad] = useState(false)

  const myUid = user?.uid
  const existing = signatures[myUid]
  const isMember = training.members?.some(m => m.uid === myUid)
  const myMemberName = training.members?.find(m => m.uid === myUid)?.name || user?.displayName || ''

  // 컨테이너 폭 기반 캔버스 크기 결정
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setCanvasWidth(containerRef.current.offsetWidth)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    import('react-signature-canvas')
      .then(m => { setSignaturePad(() => m.default); setPadLoading(false) })
      .catch(() => setPadLoading(false))
  }, [])

  const canvasHeight = canvasWidth > 0 ? Math.max(130, Math.round(canvasWidth * 0.36)) : 180

  const handleSave = async () => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) {
      alert('서명을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const dataUrl = canvasRef.current.getTrimmedCanvas().toDataURL('image/png')
      await setDoc(
        doc(db, 'schools', SCHOOL_ID, 'trainings', id, 'signatures', myUid),
        {
          uid: myUid,
          name: myMemberName,
          email: user.email,
          signedAt: serverTimestamp(),
          signatureData: dataUrl,
        }
      )
      const sigSnap = await getDocs(collection(db, 'schools', SCHOOL_ID, 'trainings', id, 'signatures'))
      await updateDoc(doc(db, 'schools', SCHOOL_ID, 'trainings', id), { signedCount: sigSnap.size })
      setShowPad(false)
    } catch {
      alert('서명 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (!isMember) {
    return (
      <Box textAlign="center" py={6} color="text.secondary">
        <Typography fontSize="2rem" mb={1}>🔒</Typography>
        <Typography fontWeight={600} mb={0.5} color="text.primary">서명 대상자가 아닙니다</Typography>
        <Typography fontSize="0.84rem">명단에 포함되어 있지 않습니다. 주관자에게 문의하세요.</Typography>
        {training.createdByName && (
          <Typography fontSize="0.84rem" mt={1.5}>
            주관자: <strong style={{ color: '#1e293b' }}>{training.createdByName}</strong>
          </Typography>
        )}
      </Box>
    )
  }

  if (existing && !showPad) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75,
            bgcolor: '#f0fdf4', color: '#15803d',
            px: 1.5, py: 0.5, borderRadius: 2, fontSize: '0.9rem', fontWeight: 700,
          }}>
            ✓ 서명 완료
          </Box>
          {existing.signedAt && (
            <Typography fontSize="0.82rem" color="text.secondary">
              {existing.signedAt.toDate().toLocaleString('ko-KR')}
            </Typography>
          )}
        </Box>

        <Box sx={{
          border: '1px solid #e2e8f0', borderRadius: 2,
          p: 1.5, bgcolor: '#fafafa', mb: 2.5, display: 'inline-block', maxWidth: '100%',
        }}>
          <img src={existing.signatureData} alt="내 서명"
            style={{ display: 'block', maxWidth: '100%', maxHeight: 130 }} />
        </Box>

        <Box>
          <Button variant="outlined" color="warning" size="small" onClick={() => setShowPad(true)}>
            재서명
          </Button>
        </Box>
      </Box>
    )
  }

  return (
    <Box>
      <Typography fontWeight={600} mb={0.5}>{existing ? '재서명' : '서명 입력'}</Typography>
      <Typography fontSize="0.84rem" color="text.secondary" mb={2}>
        아래 영역에 손가락 또는 펜으로 서명하세요.
      </Typography>

      <Box ref={containerRef} sx={{ width: '100%' }}>
        {padLoading ? (
          <Box display="flex" alignItems="center" gap={1.5} py={4}>
            <CircularProgress size={18} />
            <Typography fontSize="0.88rem" color="text.secondary">서명 패드 로드 중...</Typography>
          </Box>
        ) : SignaturePad && canvasWidth > 0 ? (
          <>
            <Box sx={{
              border: '2px solid #4f46e5', borderRadius: 2, mb: 2,
              boxShadow: '0 2px 16px rgba(79,70,229,0.14)',
              overflow: 'hidden', touchAction: 'none',
            }}>
              <SignaturePad
                ref={canvasRef}
                canvasProps={{
                  width: canvasWidth,
                  height: canvasHeight,
                  style: { display: 'block', touchAction: 'none' },
                }}
                backgroundColor="white"
                penColor="#1e293b"
                dotSize={2.5}
                minWidth={1.5}
                maxWidth={3.5}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={handleSave} disabled={saving} size="large">
                {saving ? <CircularProgress size={22} /> : '서명 저장'}
              </Button>
              <Button variant="outlined" onClick={() => canvasRef.current?.clear()} disabled={saving}>
                다시 그리기
              </Button>
              {existing && (
                <Button variant="text" color="inherit" onClick={() => setShowPad(false)} disabled={saving}>
                  취소
                </Button>
              )}
            </Box>
          </>
        ) : (
          <Typography color="error" fontSize="0.88rem">
            서명 패드를 불러올 수 없습니다. 페이지를 새로고침해 주세요.
          </Typography>
        )}
      </Box>
    </Box>
  )
}
