import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { PRESENCE, PRESENCE_ORDER, effectivePresence } from '@shared/lib/presence'

/**
 * 내 재실 상태 위젯
 *
 * 지금은 교사가 직접 고르는 수동 방식. 웹은 브라우저 밖의 활동을 감지할 수 없어서다.
 * 추후 Electron 데스크톱 클라이언트가 OS 유휴시간을 보고 같은 문서를 자동 갱신하면,
 * 이 화면은 그대로 두고 source만 'desktop'으로 바뀐다.
 */
export default function PresenceWidget() {
  const { user, schoolId } = useAuth()
  const [current, setCurrent] = useState('unknown')
  const [source, setSource] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!schoolId || !user) return
    return onSnapshot(doc(db, 'schools', schoolId, 'presence', user.uid), snap => {
      const data = snap.data()
      setCurrent(effectivePresence(data))
      setSource(data?.source || null)
    }, () => {})
  }, [schoolId, user])

  const setStatus = async (status) => {
    if (saving) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'schools', schoolId, 'presence', user.uid), {
        uid: user.uid, status, source: 'manual', updatedAt: serverTimestamp(),
      }, { merge: true })
    } catch (e) {
      console.error('상태 변경 실패:', e)
    } finally {
      setSaving(false)
    }
  }

  const p = PRESENCE[current]

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: p.color }} />
        <Typography fontSize="1.15rem" fontWeight={800} sx={{ color: p.color }}>{p.label}</Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {PRESENCE_ORDER.map(key => {
          const s = PRESENCE[key]
          const active = current === key
          return (
            <Button
              key={key}
              onClick={() => setStatus(key)}
              disabled={saving}
              sx={{
                px: 2, py: 0.9, borderRadius: 2, fontWeight: 700, fontSize: '0.88rem',
                border: '1px solid', borderColor: active ? s.color : '#e2e8f0',
                bgcolor: active ? s.bg : '#fff',
                color: active ? s.color : '#64748b',
                '&:hover': { bgcolor: s.bg, borderColor: s.color },
              }}
            >
              {s.label}
            </Button>
          )
        })}
      </Box>

      <Typography fontSize="0.75rem" color="text.secondary" mt={1.5}>
        {source === 'desktop'
          ? '데스크톱 앱이 자동으로 갱신하고 있습니다.'
          : '학생용 키오스크 화면에 이 상태가 표시됩니다.'}
      </Typography>
    </Box>
  )
}
