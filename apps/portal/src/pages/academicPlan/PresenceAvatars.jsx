import { useEffect, useState } from 'react'
import Avatar from '@mui/material/Avatar'
import AvatarGroup from '@mui/material/AvatarGroup'
import Tooltip from '@mui/material/Tooltip'
import { PRESENCE_BEAT_MS, PRESENCE_STALE_MS, beatPresence, leavePresence, subscribeViewers } from './planRepo'

const COLORS = ['#0f766e', '#7c3aed', '#c2410c', '#1d4ed8', '#be185d', '#15803d', '#a16207', '#4338ca']
const colorOf = (uid = '') => COLORS[[...uid].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length]

/**
 * 지금 이 초안을 보고 있는 다른 사람 — 구글 문서처럼 프로필 사진(없으면 이름 첫 글자).
 * 화면이 보이는 동안만 2분마다 '있음'을 알리고, 탭을 숨기거나 떠나면 지운다.
 */
export default function PresenceAvatars({ schoolId, planId, me }) {
  const [viewers, setViewers] = useState([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!schoolId || !planId || !me?.uid) return undefined
    const beat = () => { if (document.visibilityState === 'visible') beatPresence(schoolId, planId, me).catch(() => {}) }
    const leave = () => leavePresence(schoolId, planId, me.uid).catch(() => {})
    beat()
    const timer = setInterval(() => { beat(); setNow(Date.now()) }, PRESENCE_BEAT_MS)
    const onVis = () => (document.visibilityState === 'visible' ? beat() : leave())
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', leave)
    const unsub = subscribeViewers(schoolId, planId, (list) => { setViewers(list); setNow(Date.now()) })
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', leave)
      unsub()
      leave()
    }
  }, [schoolId, planId, me?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  const others = viewers.filter((v) => v.uid !== me?.uid && now - (v.lastSeen || 0) < PRESENCE_STALE_MS)
  if (!others.length) return null
  return (
    <AvatarGroup max={5} sx={{ mr: 0.5, '& .MuiAvatar-root': { width: 28, height: 28, fontSize: '0.8rem', borderWidth: 2 } }}>
      {others.map((v) => (
        <Tooltip key={v.uid} title={`${v.name || '알 수 없음'} — 보는 중`}>
          <Avatar alt={v.name} src={v.photoURL || undefined} imgProps={{ referrerPolicy: 'no-referrer' }} sx={{ bgcolor: colorOf(v.uid) }}>
            {(v.name || '?').slice(0, 1)}
          </Avatar>
        </Tooltip>
      ))}
    </AvatarGroup>
  )
}
