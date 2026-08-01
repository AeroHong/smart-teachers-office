/**
 * 구성원 — 조직도 트리와 교사 상세.
 *
 * 오른쪽 칸이 상세 영역으로 바뀌면서 명단을 별도 탭으로 옮겼다. 쿨메신저식 조직도 구조는
 * 그대로다 — 부서·교과가 동시에 최상위 토글로 있고 한 사람이 여러 그룹에 등장한다.
 * 교사들이 이미 그 구조에 익숙해서 학습 비용이 없다.
 */
import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import SendIcon from '@mui/icons-material/Send'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { USERS } from '@shared/lib/schema'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import NoticeComposeModal from '../components/NoticeComposeModal'
import useSchoolMembers from '../lib/useSchoolMembers'
import { ROOT_GROUPS, buildRosterTree, defaultExpanded, memberSubtitle, nodeId, searchMembers } from '../lib/rosterTree'

export default function Members() {
  const { user } = useAuth()
  const { members, loading } = useSchoolMembers()
  const [expanded, setExpanded] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState(null)
  const [compose, setCompose] = useState(null)

  // 저장된 펼침 상태가 있으면 그대로, 없으면 '부서 > 내 부서'만 편다.
  //
  // 저장된 값이 지금 트리에 하나도 안 맞으면 없는 것으로 친다. 최상위 기준을
  // 사무실에서 부서로 옮겼을 때 옛 'office/…' ID만 남은 사람은 전부 접힌 빈 화면을
  // 보게 되는데, 접힌 이유가 화면에 드러나지 않아 고장으로 보인다.
  useEffect(() => {
    if (!user || members.length === 0 || expanded) return
    let alive = true
    getDoc(doc(db, USERS, user.uid))
      .then(snap => {
        if (!alive) return
        const saved = snap.data()?.rosterExpanded
        const myDepartment = members.find(m => m.uid === user.uid)?.department || ''
        const known = new Set(ROOT_GROUPS.map(g => g.key))
        const usable = Array.isArray(saved) && saved.some(id => known.has(String(id).split('/')[0]))
        setExpanded(new Set(usable ? saved : defaultExpanded(myDepartment)))
      })
      .catch(() => { if (alive) setExpanded(new Set(defaultExpanded(''))) })
    return () => { alive = false }
  }, [user, members, expanded])

  const tree = useMemo(() => buildRosterTree(members), [members])
  const results = useMemo(() => searchMembers(members, keyword), [members, keyword])
  const searching = keyword.trim().length > 0

  const toggle = (id) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      // 매번 다시 접히면 못 쓴다. 다음 접속에도 유지한다.
      if (user) {
        updateDoc(doc(db, USERS, user.uid), { rosterExpanded: [...next] })
          .catch(e => console.error('명단 펼침 상태 저장 실패:', e))
      }
      return next
    })
  }

  const isOpen = (id) => !!expanded?.has(id)

  const sidebar = (
    <>
      <TextField
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        placeholder="이름 검색"
        fullWidth
        sx={{ mb: 1 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
            </InputAdornment>
          ),
          sx: { fontSize: '0.83rem', '& input': { py: 0.7 } },
        }}
      />

      {loading ? null : searching ? (
        results.length === 0
          ? <SidebarEmpty>"{keyword.trim()}" 검색 결과가 없습니다</SidebarEmpty>
          : results.map(m => (
            <SidebarItem
              key={m.uid}
              label={m.name}
              selected={selected?.uid === m.uid}
              onClick={() => setSelected(m)}
            />
          ))
      ) : tree.map(root => (
        <SidebarSection
          key={root.key}
          label={root.label}
          open={isOpen(root.id)}
          onToggle={() => toggle(root.id)}
        >
          {root.groups.map(g => (
            <SidebarSection
              key={g.id}
              label={g.name}
              count={g.members.length}
              open={isOpen(g.id)}
              onToggle={() => toggle(g.id)}
            >
              {g.members.map(m => (
                <SidebarItem
                  key={`${g.id}:${m.uid}`}
                  label={m.name}
                  indent={1.2}
                  selected={selected?.uid === m.uid}
                  onClick={() => setSelected(m)}
                />
              ))}
            </SidebarSection>
          ))}
        </SidebarSection>
      ))}
    </>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {selected ? (
        <Box sx={{ p: 2.5, maxWidth: 560 }}>
          <Typography variant="h6" fontWeight={800} mb={0.5}>{selected.name}</Typography>
          <Typography color="text.secondary" fontSize="0.88rem" mb={2.5}>
            {memberSubtitle(selected) || '소속 정보가 없습니다'}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, mb: 2.5 }}>
            <Field label="교과" value={selected.subject} />
            <Field label="부서" value={selected.department} />
            <Field
              label="담임"
              value={selected.isHomeroom
                ? `${selected.homeroomGrade}학년 ${selected.homeroomClassNo ?? ''}반`.trim()
                : ''}
            />
            <Field
              label="수업 학년"
              value={selected.teachingGrades?.length ? selected.teachingGrades.map(g => `${g}학년`).join(', ') : ''}
            />
          </Box>

          {selected.uid !== user?.uid && (
            <Button
              variant="outlined"
              startIcon={<SendIcon sx={{ fontSize: 16 }} />}
              onClick={() => setCompose(selected)}
            >
              쪽지 보내기
            </Button>
          )}
        </Box>
      ) : (
        <DetailPlaceholder emoji="👥" message="왼쪽에서 선생님을 선택하세요." />
      )}

      <NoticeComposeModal
        open={!!compose}
        presetRecipient={compose}
        onClose={() => setCompose(null)}
      />
    </WorkspaceLayout>
  )
}

function Field({ label, value }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5 }}>
      <Typography fontSize="0.85rem" color="text.secondary" sx={{ width: 72, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography fontSize="0.85rem" fontWeight={value ? 600 : 400} color={value ? 'text.primary' : 'text.disabled'}>
        {value || '—'}
      </Typography>
    </Box>
  )
}
