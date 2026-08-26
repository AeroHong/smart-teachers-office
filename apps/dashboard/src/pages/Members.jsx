/**
 * 구성원 — 조직도 트리와 교사 상세.
 *
 * 오른쪽 칸이 상세 영역으로 바뀌면서 명단을 별도 탭으로 옮겼다. 쿨메신저식 조직도 구조는
 * 그대로다 — 사무실·교과·부서가 동시에 최상위 토글로 있고 한 사람이 여러 그룹에 등장한다.
 * 교사들이 이미 그 구조에 익숙해서 학습 비용이 없다.
 *
 * 여러 명을 골라 한 번에 쪽지를 보낼 수 있다. 쿨메신저에서 부서를 펼쳐 이름을 하나씩
 * 찍던 동작 그대로다. 그룹 머리의 '전체'로 부서·교과를 통째로 담을 수 있는데, 실제로
 * 대상이 되는 단위가 대개 그것이기 때문이다.
 *
 * 업무 요청 대상 지정과 다른 점: 이쪽은 조건이 아니라 사람을 직접 고른다. 조건으로
 * 뽑아야 할 일이면 애초에 쪽지가 아니라 업무 요청으로 보내는 편이 맞다.
 */
import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
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
import PersonAvatar from '../components/PersonAvatar'
import EditableAvatar from '../components/EditableAvatar'
import useSchoolMembers from '../lib/useSchoolMembers'
import useMyAvatar from '../lib/useMyAvatar'
import { ROOT_GROUPS, buildRosterTree, defaultExpanded, memberSubtitle, nodeId, searchMembers } from '../lib/rosterTree'

export default function Members() {
  const { user } = useAuth()
  const { members, loading, refetch } = useSchoolMembers()
  const [expanded, setExpanded] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState(null)
  const [compose, setCompose] = useState(null)
  // 여러 명 고르기 — 켜면 이름을 눌러도 상세로 가지 않고 담긴다
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState([])   // [{ uid, name }]

  // 저장된 펼침 상태가 있으면 그대로, 없으면 '사무실 > 내 사무실'만 편다.
  //
  // 저장된 값이 지금 트리에 하나도 안 맞으면 없는 것으로 친다. 최상위 기준을 한 번
  // 바꿔봤을 때(사무실→부서) 옛 ID만 남은 사람은 전부 접힌 빈 화면을 보게 됐는데,
  // 접힌 이유가 화면에 드러나지 않아 고장으로 보인다.
  useEffect(() => {
    if (!user || members.length === 0 || expanded) return
    let alive = true
    getDoc(doc(db, USERS, user.uid))
      .then(snap => {
        if (!alive) return
        const saved = snap.data()?.rosterExpanded
        const myOffice = members.find(m => m.uid === user.uid)?.office || ''
        const known = new Set(ROOT_GROUPS.map(g => g.key))
        const usable = Array.isArray(saved) && saved.some(id => known.has(String(id).split('/')[0]))
        setExpanded(new Set(usable ? saved : defaultExpanded(myOffice)))
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

  const pickedUids = useMemo(() => new Set(picked.map(m => m.uid)), [picked])
  const isPicked = (uid) => pickedUids.has(uid)

  const togglePick = (m) => {
    setPicked(prev => prev.some(p => p.uid === m.uid)
      ? prev.filter(p => p.uid !== m.uid)
      : [...prev, { uid: m.uid, name: m.name }])
  }

  /** 그룹 통째로 담고 빼기. 이미 다 담겨 있으면 빼는 쪽으로 동작한다. */
  const toggleGroup = (members) => {
    const allIn = members.every(m => pickedUids.has(m.uid))
    setPicked(prev => allIn
      ? prev.filter(p => !members.some(m => m.uid === p.uid))
      : [...prev, ...members.filter(m => !pickedUids.has(m.uid)).map(m => ({ uid: m.uid, name: m.name }))])
  }

  const stopPicking = () => { setPicking(false); setPicked([]) }

  // 이름을 누르면 — 고르는 중이면 담고, 아니면 상세를 연다
  const onMemberClick = (m) => (picking ? togglePick(m) : setSelected(m))

  // 내 프로필 사진 — useMyAvatar.js가 실제 업로드·저장을 한다. useSchoolMembers()는
  // 한 번만 읽으므로 바뀐 뒤 refetch()로 다시 읽어야 이 화면(selected)에도 반영된다
  // (훅 주석의 "쓰기로 이어지는 자리는 refetch" 원칙).
  const { uploading: uploadingAvatar, uploadAvatar, resetToGoogleAvatar } = useMyAvatar({
    onChanged: async () => {
      const fresh = await refetch()
      setSelected(prev => fresh.find(m => m.uid === user?.uid) || prev)
    },
  })

  const sidebar = (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.3 }}>
        <Button
          size="small"
          onClick={() => (picking ? stopPicking() : setPicking(true))}
          sx={{ fontSize: '0.75rem', minWidth: 0, px: 0.8 }}
        >
          {picking ? '고르기 끝' : '여러 명 고르기'}
        </Button>
      </Box>

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
              selected={!picking && selected?.uid === m.uid}
              onClick={() => onMemberClick(m)}
              chip={picking ? <PickMark on={isPicked(m.uid)} /> : null}
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
              count={picking ? null : g.members.length}
              open={isOpen(g.id)}
              onToggle={() => toggle(g.id)}
              action={picking ? (
                <Button
                  size="small"
                  onClick={() => toggleGroup(g.members)}
                  sx={{ fontSize: '0.7rem', minWidth: 0, px: 0.6, py: 0 }}
                >
                  {g.members.every(m => isPicked(m.uid)) ? '해제' : '전체'}
                </Button>
              ) : null}
            >
              {g.members.map(m => (
                <SidebarItem
                  key={`${g.id}:${m.uid}`}
                  label={m.name}
                  indent={1.2}
                  selected={!picking && selected?.uid === m.uid}
                  onClick={() => onMemberClick(m)}
                  chip={picking ? <PickMark on={isPicked(m.uid)} /> : null}
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
      {picking ? (
        <PickedPanel
          picked={picked}
          onRemove={m => togglePick(m)}
          onClear={() => setPicked([])}
          onSend={() => setCompose({ recipients: picked })}
        />
      ) : selected ? (
        <Box sx={{ p: 2.5, maxWidth: 560 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            {/* 본인 사진만 바꿀 수 있다 — 눌러도 아무 일 없는 사진은 오히려 "고장 났나"로
                읽힌다, 그래서 본인일 때만 EditableAvatar(눌러서 바꾸기)를 쓴다. */}
            {selected.uid === user?.uid ? (
              <EditableAvatar
                name={selected.name} photoURL={selected.photoURL} size={56}
                uploading={uploadingAvatar} onPick={uploadAvatar}
              />
            ) : (
              <PersonAvatar name={selected.name} photoURL={selected.photoURL} size={56} />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={800}>{selected.name}</Typography>
              <Typography color="text.secondary" fontSize="0.88rem">
                {memberSubtitle(selected) || '소속 정보가 없습니다'}
              </Typography>
              {selected.uid === user?.uid && selected.photoSource === 'custom' && user?.photoURL && (
                <Button
                  size="small" onClick={resetToGoogleAvatar}
                  sx={{ fontSize: '0.72rem', minWidth: 0, px: 0, mt: 0.2 }}
                >
                  구글 계정 사진으로 되돌리기
                </Button>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, mb: 2.5 }}>
            <Field label="사무실" value={selected.office} />
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
              onClick={() => setCompose({ recipients: [{ uid: selected.uid, name: selected.name }] })}
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
        presetRecipients={compose?.recipients}
        onClose={() => {
          setCompose(null)
          stopPicking()
        }}
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

/** 고른 표시 — 체크박스 하나를 줄 오른쪽에 둔다. 좁은 사이드바라 아이콘 하나가 한계다. */
function PickMark({ on }) {
  return (
    <Checkbox
      checked={on}
      size="small"
      tabIndex={-1}
      disableRipple
      sx={{ p: 0, pointerEvents: 'none' }}
    />
  )
}

/**
 * 고르는 중일 때 오른쪽에 뜨는 담긴 사람들.
 *
 * 사이드바에서는 지금 몇 명이 담겼는지 한눈에 안 보인다 — 부서를 접었다 폈다 하면
 * 체크가 화면 밖으로 나간다. 담은 결과를 따로 보여주고 여기서 빼낼 수 있게 한다.
 */
function PickedPanel({ picked, onRemove, onClear, onSend }) {
  if (picked.length === 0) {
    return (
      <DetailPlaceholder
        emoji="✅"
        message="왼쪽에서 보낼 분들을 고르세요. 부서 옆 '전체'로 한 번에 담을 수 있습니다."
      />
    )
  }

  return (
    <Box sx={{ p: 2.5, maxWidth: 640 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6, mb: 1.5 }}>
        <Typography variant="h6" fontWeight={800}>{picked.length}</Typography>
        <Typography fontSize="0.9rem" color="text.secondary" sx={{ flexGrow: 1 }}>명 선택</Typography>
        <Button size="small" onClick={onClear} sx={{ fontSize: '0.78rem' }}>모두 해제</Button>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 2.5 }}>
        {picked.map(m => (
          <Chip
            key={m.uid} size="small" label={m.name}
            onDelete={() => onRemove(m)}
            sx={{ fontSize: '0.78rem' }}
          />
        ))}
      </Box>

      <Button
        variant="contained"
        startIcon={<SendIcon sx={{ fontSize: 16 }} />}
        onClick={onSend}
      >
        {picked.length}명에게 쪽지 보내기
      </Button>
    </Box>
  )
}
