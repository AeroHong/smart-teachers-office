/**
 * 디렉터리 — 사람 · 채널 · 그룹.
 *
 * "무엇이 있는지 모른다"에 답하는 화면이다. 지금까지는 내가 속한 채널만 보였고, 사람도
 * 이름을 알아야 찾을 수 있었다. 셋을 한 화면의 탭으로 둔 이유는 찾는 동작이 같기 때문이다 —
 * 걸러내고, 고르고, 그 자리로 간다.
 *
 * 사람 카드에서 바로 대화를 열 수 있다. 계획서의 "디렉터리에서 사람 선택 → DM"이 이 자리다.
 * 채널은 참여까지 여기서 끝낸다 — 둘러보기만 되고 들어갈 수 없으면 반쪽이다.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ChatIcon from '@mui/icons-material/ChatBubbleOutline'
import SearchIcon from '@mui/icons-material/Search'
import TagIcon from '@mui/icons-material/Tag'
import { collectFacets } from '@shared/lib/targeting'
import { isMember } from '@shared/lib/channels'
import {
  autoGroups, filterMembers, groupToMemberRule, homeroomLabel, memberSubtitle, sortMembers,
} from '@shared/lib/directory'
import { SidebarEmpty, SidebarSection } from './sidebarUi'
import PersonAvatar from './PersonAvatar'
import { useProfileCard } from './ProfileCardProvider'

export default function Directory({
  members, membersLoading, myUid, busy,
  publicChannels, channelsLoading, onOpenChannel, onJoinChannel,
  onStartDm, onNewChannelFromGroup,
}) {
  const [tab, setTab] = useState('people')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flexShrink: 0, px: 2.5, pt: 2 }}>
        <Typography variant="h6" fontWeight={800}>디렉터리</Typography>
        <Typography fontSize="0.78rem" color="text.secondary">
          학교에 어떤 사람과 채널이 있는지 둘러봅니다.
        </Typography>
        <Tabs
          value={tab} onChange={(e, v) => setTab(v)}
          sx={{ minHeight: 36, mt: 1, '& .MuiTab-root': { minHeight: 36, fontSize: '0.82rem', fontWeight: 700 } }}
        >
          <Tab value="people" label={`사용자${members.length ? ` ${members.length}` : ''}`} />
          <Tab value="channels" label={`채널${publicChannels.length ? ` ${publicChannels.length}` : ''}`} />
          <Tab value="groups" label="사용자 그룹" />
        </Tabs>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 2.5, py: 1.5 }}>
        {tab === 'people' && (
          <PeopleTab
            members={members} loading={membersLoading} myUid={myUid} busy={busy}
            onStartDm={onStartDm}
          />
        )}
        {tab === 'channels' && (
          <ChannelsTab
            channels={publicChannels} loading={channelsLoading} myUid={myUid} busy={busy}
            onOpen={onOpenChannel} onJoin={onJoinChannel}
          />
        )}
        {tab === 'groups' && (
          <GroupsTab
            members={members} loading={membersLoading} myUid={myUid} busy={busy}
            onStartDm={onStartDm} onNewChannelFromGroup={onNewChannelFromGroup}
          />
        )}
      </Box>
    </Box>
  )
}

// ── 사용자 ────────────────────────────────────────────────────

/**
 * 필터는 갈래마다 하나씩 켜진다(부서 ∧ 교과). 같은 칩을 다시 누르면 꺼진다 — 끄는 방법을
 * 따로 두면 갈래마다 '전체' 칩이 하나씩 더 붙어 칩 줄이 두 배가 된다.
 */
function PeopleTab({ members, loading, myUid, busy, onStartDm }) {
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState({})

  const facets = useMemo(() => collectFacets(members), [members])
  const shown = useMemo(
    () => sortMembers(filterMembers(members, { ...filter, keyword })),
    [members, filter, keyword],
  )

  const toggle = (key, value) => setFilter(
    f => (f[key] === value ? { ...f, [key]: undefined } : { ...f, [key]: value }),
  )

  const chipRow = (key, values) => values.length > 0 && (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.6 }}>
      {values.map(v => (
        <Chip
          key={`${key}-${v}`}
          label={v} size="small"
          color={filter[key] === v ? 'primary' : 'default'}
          variant={filter[key] === v ? 'filled' : 'outlined'}
          onClick={() => toggle(key, v)}
          sx={{ fontSize: '0.74rem', height: 24 }}
        />
      ))}
    </Box>
  )

  return (
    <>
      <TextField
        fullWidth size="small"
        placeholder="이름 · 부서 · 교과 · 사무실로 찾기"
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
        }}
        sx={{ mb: 1.2 }}
      />

      {chipRow('department', facets.departments)}
      {chipRow('subject', facets.subjects)}
      {chipRow('office', facets.offices)}
      {chipRow('rank', facets.ranks)}

      <Typography fontSize="0.76rem" color="text.disabled" sx={{ mt: 1.2, mb: 0.8 }}>
        {loading ? '명단을 읽는 중입니다…' : `${shown.length}명`}
      </Typography>

      {/* 고정 폭 카드를 흘려 담는다. 창을 좁히면 한 줄에 두 장, 넓히면 네 장이 된다 —
          교무실 PC와 데스크톱 앱의 창 크기가 제각각이라 열 수를 못 박을 수 없다. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1 }}>
        {shown.map(m => (
          <MemberCard
            key={m.uid} member={m} isMe={m.uid === myUid} busy={busy}
            onStartDm={() => onStartDm(m)}
          />
        ))}
      </Box>
    </>
  )
}

function MemberCard({ member, isMe, busy, onStartDm }) {
  const subtitle = memberSubtitle(member)
  const homeroom = homeroomLabel(member)
  const { open: openProfile } = useProfileCard()

  return (
    <Box sx={{
      border: '1px solid', borderColor: 'divider', borderRadius: 1,
      bgcolor: 'background.paper', px: 1.3, py: 1.1,
      display: 'flex', flexDirection: 'column', gap: 0.4,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, minWidth: 0 }}>
        {/* 아바타를 누르면 프로필 카드 — 이름 자체는 안 눌려도 되게 아바타에만 건다
            (카드 전체를 누르면 아래 '대화' 버튼과 눌림 영역이 겹친다). */}
        <Box
          component="button" type="button"
          onClick={e => openProfile(member.uid, e.currentTarget)}
          sx={{ border: 0, background: 'none', p: 0, cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}
          aria-label={`${member.name} 프로필`}
        >
          <PersonAvatar name={member.name} photoURL={member.photoURL} size={28} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6, minWidth: 0 }}>
          <Typography fontSize="0.92rem" fontWeight={700} noWrap>{member.name}</Typography>
          {isMe && <Typography fontSize="0.7rem" color="text.disabled">나</Typography>}
        </Box>
      </Box>
      {subtitle && (
        <Typography fontSize="0.76rem" color="text.secondary" noWrap>{subtitle}</Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 24 }}>
        {homeroom && <Chip label={homeroom} size="small" sx={{ fontSize: '0.68rem', height: 20 }} />}
        {member.office && (
          <Typography fontSize="0.72rem" color="text.disabled" noWrap>{member.office}</Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {/* 나 자신에게 말을 걸 자리는 만들지 않는다. 메모 용도의 '나와의 대화'는 뜻이
            다른 기능이라, 여기 섞으면 잘못 누르는 쪽이 더 잦다. */}
        {!isMe && (
          <Button
            size="small" disabled={busy} onClick={onStartDm}
            startIcon={<ChatIcon sx={{ fontSize: 15 }} />}
            sx={{ fontSize: '0.74rem', minWidth: 0, px: 0.8 }}
          >
            대화
          </Button>
        )}
      </Box>
    </Box>
  )
}

// ── 채널 ──────────────────────────────────────────────────────

/**
 * 공개 채널만 나온다. 비공개는 쿼리 조건에 걸리지 않아 이름조차 오지 않는데, 그게
 * 비공개의 뜻이다("참여자가 아니면 존재 자체를 모른다").
 */
function ChannelsTab({ channels, loading, myUid, busy, onOpen, onJoin }) {
  const [keyword, setKeyword] = useState('')

  const shown = useMemo(() => {
    const k = keyword.trim()
    const mine = c => (isMember(c, myUid) ? 1 : 0)
    return [...channels]
      .filter(c => !k || (c.name || '').includes(k) || (c.description || '').includes(k))
      // 참여 중인 채널을 아래로 내린다. 이 화면에 오는 이유는 아직 안 들어간 채널을 찾기
      // 위해서라, 이미 사이드바에 있는 것들이 위를 차지하면 헛수고가 된다.
      .sort((a, b) => {
        if (mine(a) !== mine(b)) return mine(a) - mine(b)
        return (a.name || '').localeCompare(b.name || '', 'ko')
      })
  }, [channels, keyword, myUid])

  return (
    <>
      <TextField
        fullWidth size="small"
        placeholder="채널 이름 · 설명으로 찾기"
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
        }}
        sx={{ mb: 1.2 }}
      />

      {loading ? (
        <Typography fontSize="0.85rem" color="text.disabled" sx={{ py: 3 }}>채널을 읽는 중입니다…</Typography>
      ) : shown.length === 0 ? (
        <Typography fontSize="0.85rem" color="text.disabled" sx={{ py: 3 }}>
          공개 채널이 없습니다. 비공개 채널은 참여자에게만 보입니다.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
          {shown.map((c) => {
            const joined = isMember(c, myUid)
            return (
              <Box key={c.id} sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                border: '1px solid', borderColor: 'divider', borderRadius: 1,
                bgcolor: 'background.paper', px: 1.3, py: 1,
              }}>
                <TagIcon sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
                <Box
                  component="button" type="button" onClick={() => onOpen(c)}
                  sx={{
                    flexGrow: 1, minWidth: 0, border: 0, background: 'none', textAlign: 'left',
                    cursor: 'pointer', fontFamily: 'inherit', p: 0,
                  }}
                >
                  <Typography fontSize="0.9rem" fontWeight={700} noWrap>{c.name}</Typography>
                  <Typography fontSize="0.75rem" color="text.secondary" noWrap>
                    참여 {c.memberUids?.length ?? 0}명
                    {c.description && ` · ${c.description}`}
                  </Typography>
                </Box>
                {joined ? (
                  <Typography fontSize="0.74rem" color="text.disabled" sx={{ flexShrink: 0 }}>참여 중</Typography>
                ) : (
                  <Button
                    size="small" variant="outlined" disabled={busy}
                    onClick={() => onJoin(c)}
                    sx={{ flexShrink: 0, fontSize: '0.74rem' }}
                  >
                    참여
                  </Button>
                )}
              </Box>
            )
          })}
        </Box>
      )}
    </>
  )
}

// ── 사용자 그룹 ───────────────────────────────────────────────

/**
 * 배정 데이터에서 저절로 나오는 그룹들. 손으로 관리하는 명단이 아니라 조건이라, 인사이동이
 * 반영되는 순간 그룹도 같이 맞는다(directory.js 참고).
 *
 * 구성원 화면의 조직도 트리와 같은 구조다 — 한 사람이 부서·교과·사무실·담임 여러 곳에
 * 등장하고, 그 각각이 그 사람을 찾는 경로다.
 */
function GroupsTab({ members, loading, myUid, busy, onStartDm, onNewChannelFromGroup }) {
  const sections = useMemo(() => autoGroups(members), [members])
  const [open, setOpen] = useState({})

  if (loading) {
    return <Typography fontSize="0.85rem" color="text.disabled" sx={{ py: 3 }}>명단을 읽는 중입니다…</Typography>
  }
  if (sections.length === 0) {
    return (
      <Typography fontSize="0.85rem" color="text.disabled" sx={{ py: 3 }}>
        부서·교과 배정이 아직 들어오지 않아 만들 수 있는 그룹이 없습니다.
      </Typography>
    )
  }

  return (
    <>
      <Typography fontSize="0.78rem" color="text.secondary" sx={{ mb: 1.2 }}>
        부서·교과·사무실·담임 배정에서 저절로 만들어집니다. 인사이동이 반영되면 그룹도 같이
        바뀌므로 따로 손볼 것이 없습니다.
      </Typography>

      {sections.map(section => (
        <Box key={section.key} sx={{ mb: 1.5 }}>
          <Typography fontSize="0.72rem" fontWeight={800} color="text.disabled" sx={{ mb: 0.5, letterSpacing: '.03em' }}>
            {section.label}
          </Typography>
          {section.groups.map((g) => {
            const id = `${section.key}:${g.name}`
            const rule = groupToMemberRule(section.key, g.name)
            return (
              <SidebarSection
                key={id}
                label={g.name}
                count={g.members.length}
                open={!!open[id]}
                onToggle={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
                actionOnHover
                action={rule ? (
                  <Button
                    size="small" disabled={busy}
                    onClick={() => onNewChannelFromGroup({ name: g.name, rule })}
                    sx={{ fontSize: '0.72rem', minWidth: 0, px: 0.8 }}
                  >
                    채널 만들기
                  </Button>
                ) : undefined}
              >
                {g.members.length === 0 ? (
                  <SidebarEmpty>아무도 없습니다</SidebarEmpty>
                ) : (
                  <Box sx={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 0.8, px: 1, pb: 0.8,
                  }}>
                    {g.members.map(m => (
                      <MemberCard
                        key={m.uid} member={m} isMe={m.uid === myUid} busy={busy}
                        onStartDm={() => onStartDm(m)}
                      />
                    ))}
                  </Box>
                )}
              </SidebarSection>
            )
          })}
        </Box>
      ))}
    </>
  )
}
