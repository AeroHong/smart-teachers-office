import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Slide from '@mui/material/Slide'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'

/**
 * 학생 호출 알림 — 화면 오른쪽 아래에서 올라오는 카드
 *
 * 어느 화면에 있든 뜨도록 레이아웃 레벨에 둔다. 이미 떠 있는 동안 다른 호출이 오면
 * 큐에 쌓았다가 순서대로 보여준다.
 */
export default function CallAlert() {
  const { user, schoolId } = useAuth()
  const [queue, setQueue] = useState([])       // 아직 확인하지 않은 호출
  const seenRef = useRef(new Set())            // 이미 띄운 호출 (재구독 시 중복 방지)
  const firstLoadRef = useRef(true)

  useEffect(() => {
    if (!schoolId || !user) return
    const q = query(
      collection(db, 'schools', schoolId, 'callRequests'),
      where('teacherUid', '==', user.uid),
      where('status', '==', 'pending'),
    )
    return onSnapshot(q, snap => {
      const incoming = []
      snap.docs.forEach(d => {
        if (seenRef.current.has(d.id)) return
        seenRef.current.add(d.id)
        incoming.push({ id: d.id, ...d.data() })
      })

      // 첫 구독 때 쌓여 있던 것도 보여준다 (로그인 전에 온 호출을 놓치지 않도록)
      if (incoming.length > 0) setQueue(prev => [...prev, ...incoming])
      firstLoadRef.current = false

      // 다른 기기에서 확인 처리하면 큐에서도 사라지게
      const stillPending = new Set(snap.docs.map(d => d.id))
      setQueue(prev => prev.filter(c => stillPending.has(c.id)))
    }, () => {})
  }, [schoolId, user])

  const acknowledge = async (call) => {
    setQueue(prev => prev.filter(c => c.id !== call.id))
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'callRequests', call.id), {
        status: 'acknowledged', acknowledgedAt: serverTimestamp(),
      })
    } catch (e) {
      console.error('확인 처리 실패:', e)
    }
  }

  const current = queue[0]

  return (
    <Slide direction="up" in={!!current} mountOnEnter unmountOnExit>
      <Box sx={{
        position: 'fixed', right: 24, bottom: 24, zIndex: 1400,
        width: 360, borderRadius: 1.25, overflow: 'hidden',
        bgcolor: '#fff', border: '1px solid #fecaca',
        boxShadow: '0 18px 40px rgba(15,23,42,.22)',
      }}>
        <Box sx={{ px: 2.5, py: 1.2, bgcolor: '#ef4444', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography fontSize="1.05rem" fontWeight={800} color="#fff">🔔 학생이 찾아왔습니다</Typography>
          {queue.length > 1 && (
            <Typography fontSize="0.8rem" sx={{ ml: 'auto', color: 'rgba(255,255,255,.85)' }}>
              +{queue.length - 1}건 대기
            </Typography>
          )}
        </Box>

        {current && (
          <Box sx={{ px: 2.5, py: 2 }}>
            <Typography fontSize="1.3rem" fontWeight={800} lineHeight={1.3}>
              {current.grade}학년 {current.classNo}반 {current.number}번 {current.studentName}
            </Typography>
            <Typography fontSize="0.9rem" color="text.secondary" mt={0.3}>
              {current.department}
            </Typography>
            <Button
              variant="contained"
              fullWidth
              onClick={() => acknowledge(current)}
              sx={{ mt: 2, py: 1.2, fontSize: '1rem', fontWeight: 700 }}
            >
              확인 — 들어오라고 알리기
            </Button>
            <Typography fontSize="0.72rem" color="text.secondary" textAlign="center" mt={1}>
              확인을 누르면 학생 화면이 &ldquo;들어오세요!&rdquo;로 바뀝니다
            </Typography>
          </Box>
        )}
      </Box>
    </Slide>
  )
}
