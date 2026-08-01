/**
 * 구성원 명단 (3분할의 오른쪽 칸).
 *
 * 재실 점은 아직 그리지 않는다. 지금 presence는 교사가 직접 누르는 수동 값이고 4시간이
 * 지나면 '확인 안 됨'으로 떨어져서, 명단에 점을 그리면 대부분 회색이 된다. 자동 재실 감지
 * (Phase B, Electron)가 붙은 뒤에 점만 켜면 된다 — 그때 '자리 비움'과 '앱 미설치'를
 * 구분해서 표시한다. PLAN_dashboardElectron.md 참고.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, USERS, schoolPath, teacherAssignmentId, currentSchoolYear } from '@shared/lib/schema'
import { useToast } from './ToastProvider'
import NoticeComposeModal from './NoticeComposeModal'
import { buildRosterTree, defaultExpanded, memberSubtitle, nodeId, searchMembers } from '../lib/rosterTree'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function MemberRoster({ onClose }) {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(null)   // Set | null (미로드)
  const [keyword, setKeyword] = useState('')
  const [composeTo, setComposeTo] = useState(null)

  // 명단은 학년도가 바뀔 때나 인사이동이 있을 때만 변하므로 실시간 구독하지 않고 한 번만 읽는다
  useEffect(() => {
    if (!schoolId || !user) return
    let alive = true

    ;(async () => {
      try {
        const year = currentSchoolYear()
        const [usersSnap, assignSnap] = await Promise.all([
          getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES))),
          getDocs(query(collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)), where('year', '==', year))),
        ])
        if (!alive) return

        // 이름은 users, 소속(사무실·교과·부서)은 teacherAssignments에 있어 uid로 잇는다
        const assignByUid = new Map(assignSnap.docs.map(d => [d.data().uid, d.data()]))
        const list = usersSnap.docs.map(d => {
          const a = assignByUid.get(d.id) || {}
          return {
            uid: d.id,
            name: d.data().name || d.data().email || '(이름 없음)',
            office: a.office || '',
            subject: a.subject || '',
            department: a.department || '',
          }
        })
        setMembers(list)

        // 저장된 펼침 상태가 있으면 그대로, 없으면 '사무실 > 내 사무실'만 편다
        const meSnap = await getDoc(doc(db, USERS, user.uid))
        if (!alive) return
        const saved = meSnap.data()?.rosterExpanded
        const myOffice = assignByUid.get(user.uid)?.office || ''
        setExpanded(new Set(Array.isArray(saved) ? saved : defaultExpanded(myOffice)))
      } catch (e) {
        if (alive) toast.error('구성원 명단을 불러오지 못했습니다.', e)
      } finally {
        if (alive) setLoaded(true)
      }
    })()

    return () => { alive = false }
  }, [schoolId, user, toast])

  const tree = useMemo(() => buildRosterTree(members), [members])
  const results = useMemo(() => searchMembers(members, keyword), [members, keyword])
  const searching = keyword.trim().length > 0

  const toggle = (id) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      // 매번 다시 접히면 못 쓴다. 위젯 배치와 같은 문서에 붙여 다음 접속에도 유지한다.
      if (user) {
        updateDoc(doc(db, USERS, user.uid), { rosterExpanded: [...next] })
          .catch(e => console.error('명단 펼침 상태 저장 실패:', e))
      }
      return next
    })
  }

  const isOpen = (id) => !!expanded?.has(id)

  return (
    <>
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1.2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography fontSize="0.875rem" fontWeight={800} sx={{ flexGrow: 1 }}>구성원</Typography>
          {onClose && (
            <IconButton size="small" onClick={onClose} aria-label="명단 닫기">
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
        <TextField
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="이름 검색"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
              </InputAdornment>
            ),
            sx: { fontSize: '0.83rem', '& input': { py: 0.7 } },
          }}
        />
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 1, py: 1 }}>
        {!loaded ? null : searching ? (
          results.length === 0 ? (
            <Typography color="text.secondary" fontSize="0.85rem" sx={{ px: 1.2, py: 2 }}>
              "{keyword.trim()}" 검색 결과가 없습니다.
            </Typography>
          ) : (
            results.map(m => (
              <MemberRow key={m.uid} member={m} subtitle={memberSubtitle(m)} onClick={() => setComposeTo(m)} />
            ))
          )
        ) : (
          tree.map(root => (
            <Box key={root.key} sx={{ mb: 0.5 }}>
              <TreeToggle
                label={root.label}
                open={isOpen(root.id)}
                onClick={() => toggle(root.id)}
                level={0}
              />
              <Collapse in={isOpen(root.id)} unmountOnExit>
                {root.groups.map(g => (
                  <Box key={g.id}>
                    <TreeToggle
                      label={g.name}
                      count={g.members.length}
                      open={isOpen(g.id)}
                      onClick={() => toggle(g.id)}
                      level={1}
                    />
                    <Collapse in={isOpen(g.id)} unmountOnExit>
                      {g.members.map(m => (
                        <MemberRow
                          key={`${g.id}:${m.uid}`}
                          member={m}
                          subtitle={root.key === 'office' ? m.subject : m.office}
                          onClick={() => setComposeTo(m)}
                          indent
                        />
                      ))}
                    </Collapse>
                  </Box>
                ))}
              </Collapse>
            </Box>
          ))
        )}
      </Box>

      <NoticeComposeModal
        open={!!composeTo}
        presetRecipient={composeTo}
        onClose={() => setComposeTo(null)}
      />
    </>
  )
}

function TreeToggle({ label, count, open, onClick, level }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-expanded={open}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.4, width: '100%',
        border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
        pl: level === 0 ? 0.6 : 1.8, pr: 1, py: level === 0 ? 0.45 : 0.3,
        borderRadius: 0.75, color: 'text.primary',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <ChevronRightIcon
        sx={{
          fontSize: 17, color: 'text.disabled', flexShrink: 0,
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform .15s ease',
        }}
      />
      <Typography
        sx={{
          flexGrow: 1, minWidth: 0,
          fontSize: level === 0 ? '0.73rem' : '0.82rem',
          fontWeight: level === 0 ? 800 : 600,
          letterSpacing: level === 0 ? '.04em' : 0,
          color: level === 0 ? 'text.secondary' : 'text.primary',
        }}
        noWrap
      >
        {label}
      </Typography>
      {count != null && (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', flexShrink: 0 }}>
          {count}
        </Typography>
      )}
    </Box>
  )
}

function MemberRow({ member, subtitle, onClick, indent = false }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      title={`${member.name} 님에게 쪽지 보내기`}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, width: '100%',
        border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
        pl: indent ? 3.5 : 1.1, pr: 1.1, py: 0.32, borderRadius: 0.75,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* 재실 점이 들어갈 자리를 미리 비워둔다 — Phase B에서 점만 채우면 줄이 안 흔들린다 */}
      <Box sx={{ width: 8, flexShrink: 0 }} />
      <Typography fontSize="0.82rem" fontWeight={600} noWrap sx={{ flexShrink: 0 }}>
        {member.name}
      </Typography>
      {subtitle && (
        <Typography fontSize="0.75rem" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  )
}
