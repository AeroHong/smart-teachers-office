import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import PushPinIcon from '@mui/icons-material/PushPin'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

function toMillis(ts) {
  return ts?.toMillis?.() ?? 0
}

export default function AnnouncementsWidget() {
  const { schoolId } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.ANNOUNCEMENTS)),
      snap => setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    )
  }, [schoolId])

  const sorted = useMemo(() => [...announcements].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return toMillis(b.createdAt) - toMillis(a.createdAt)
  }), [announcements])

  if (sorted.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 5 }}>
        <Typography fontSize="2rem" mb={0.5}>📢</Typography>
        <Typography color="text.secondary" fontSize="0.9rem">등록된 공지가 없습니다.</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {sorted.map(item => {
        const expanded = expandedId === item.id
        return (
          <Box
            key={item.id}
            onClick={() => setExpandedId(expanded ? null : item.id)}
            sx={{
              p: 1.2, borderRadius: 2, cursor: 'pointer',
              border: '1px solid #ececf1',
              transition: 'box-shadow .15s ease, border-color .15s ease',
              '&:hover': { boxShadow: '0 4px 14px rgba(15,23,42,.07)', borderColor: 'transparent' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {item.pinned && <PushPinIcon sx={{ fontSize: 16, color: '#d97706' }} />}
              <Typography fontWeight={600} fontSize="0.95rem" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                {item.title}
              </Typography>
              {item.category && (
                <Chip size="small" label={item.category} sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 600 }} />
              )}
            </Box>

            <Collapse in={expanded}>
              <Box sx={{ pt: 1 }}>
                {item.content && (
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                    {item.content}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {item.authorName}
                </Typography>
              </Box>
            </Collapse>
          </Box>
        )
      })}
    </Box>
  )
}
