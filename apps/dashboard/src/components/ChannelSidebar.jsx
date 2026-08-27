/**
 * 채널 사이드바 — 즐겨찾기 · 사용자 섹션 · 기본 목록 · 보관/나간 채널.
 *
 * 목록이 스무 줄을 넘어가면 "매일 여는 서너 개"를 눈으로 찾는 시간이 매번 든다. 즐겨찾기는
 * 그걸 맨 위로 올리고, 섹션은 성격이 다른 묶음을 갈라 놓는다. 어떻게 묶을지는 사람마다
 * 다르므로(같은 채널이라도 담당자에게는 매일 볼 것이고 나머지에게는 가끔 볼 것이다)
 * 학교 공통 설정이 아니라 개인 설정이다 — channelPrefs.js 참고.
 *
 * Channels.jsx에서 떼어낸 이유는 길이만이 아니다. 이쪽은 "내 목록을 어떻게 보여줄까"이고
 * 저쪽은 "채널을 어떻게 다루는가"라, 건드리는 데이터도 users/{uid}와 schools/{id}로 갈린다.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined'
import BookmarkIcon from '@mui/icons-material/BookmarkBorder'
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolderOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import ForumIcon from '@mui/icons-material/ForumOutlined'
import GroupsIcon from '@mui/icons-material/Groups'
import LaunchIcon from '@mui/icons-material/LaunchOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import LogoutIcon from '@mui/icons-material/LogoutOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined'
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import TagIcon from '@mui/icons-material/Tag'
import { dmTitle, isPrivateChannel } from '@shared/lib/channels'
import { hasUnread } from '@shared/lib/channelMessages'
import {
  DEFAULT_ID, FAVORITES_ID, SECTION_MAX, SECTION_NAME_MAX,
  createSection, groupChannels, isCollapsed, isFavorite, isMuted, moveToSection,
  removeSection, renameSection, sectionOf, toggleCollapsed, toggleFavorite, toggleMuted,
  validateSectionName,
} from '@shared/lib/channelPrefs'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from './sidebarUi'
import { useToast } from './ToastProvider'
import useChannelPrefs from '../lib/useChannelPrefs'
import { EXTERNAL_LINKS } from '../lib/externalLinks'

// 'default'(기본 "채널" 묶음)에 아이콘이 없어서 디렉터리·섹션·다이렉트 메시지·보관함·
// 바로가기는 다 아이콘이 있는데 채널만 없었다(사용자 지적, 2026-08-26). 개별 채널
// 줄과 같은 태그(#) 아이콘을 준다.
const GROUP_ICON = { favorites: StarIcon, section: FolderIcon, default: TagIcon }

export default function ChannelSidebar({
  channels, archivedChannels, leftChannels, dms = [], myUid,
  loading, activeChannelId, directoryActive, onNewChannel, onNewDm, onSelfDm,
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const { prefs, reads, update } = useChannelPrefs()

  const [rowMenu, setRowMenu] = useState(null)        // { anchor, channelId }
  const [sectionMenu, setSectionMenu] = useState(null) // { anchor, sectionId }
  const [nameDialog, setNameDialog] = useState(null)   // { mode, sectionId, value, error }
  const [deleting, setDeleting] = useState(null)       // 섹션 객체
  const [openArchived, setOpenArchived] = useState(false)
  const [openLeft, setOpenLeft] = useState(false)
  const [openLinks, setOpenLinks] = useState(false)
  // DM은 기본으로 펼쳐 둔다. 보관·나간 채널과 달리 매일 들여다보는 자리라, 접혀 있으면
  // 안읽음 표시가 있는 줄이 한 번 더 눌러야 보인다.
  const [openDms, setOpenDms] = useState(true)

  const groups = useMemo(() => groupChannels(channels, prefs), [channels, prefs])
  const sections = prefs.sections

  // 나와의 대화 — memberUids가 [나, 나]뿐인 DM(자기 자신과의 DM). 목록에 자연스럽게
  // 섞이면 lastMessageAt 정렬에 따라 자리가 흔들린다 — 메모장처럼 쓰는 자리라 늘 같은
  // 자리(맨 위)에 있어야 찾기 쉽다. 그래서 목록에서 빼내 별도로 그린다.
  const selfDm = useMemo(
    () => dms.find(c => (c.memberUids || []).every(uid => uid === myUid)),
    [dms, myUid],
  )
  const otherDms = selfDm ? dms.filter(c => c.id !== selfDm.id) : dms

  // 실패를 삼키면 즐겨찾기를 눌렀는데 아무 일도 안 일어난 것처럼 보이고, 사용자는 계속 누른다.
  const run = (fn, failure) => update(fn).catch(e => toast.error(failure, e))

  const closeMenus = () => { setRowMenu(null); setSectionMenu(null) }

  const openNameDialog = (mode, section) => {
    closeMenus()
    setNameDialog({ mode, sectionId: section?.id ?? null, value: section?.name ?? '', error: null })
  }

  const submitName = () => {
    const { mode, sectionId, value } = nameDialog
    const others = sections.filter(s => s.id !== sectionId).map(s => s.name)
    const error = validateSectionName(value, others)
    if (error) { setNameDialog(d => ({ ...d, error })); return }

    // 새 섹션을 만들면서 채널을 함께 옮기는 경로가 있다(줄 메뉴 → '새 섹션으로'). 그때는
    // 섹션 id를 알아야 옮길 수 있어서 여기서 만들어 넘긴다.
    const newId = `sec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const movingChannelId = nameDialog.movingChannelId
    run(
      (p) => {
        if (mode === 'rename') return renameSection(p, sectionId, value)
        const created = createSection(p, value, newId)
        return movingChannelId ? moveToSection(created, movingChannelId, newId) : created
      },
      mode === 'rename' ? '섹션 이름을 바꾸지 못했습니다.' : '섹션을 만들지 못했습니다.',
    )
    setNameDialog(null)
  }

  const channelRow = (c, opts = {}) => (
    <SidebarItem
      key={c.id}
      // 비공개 채널은 목록에서도 자물쇠로 구분한다. 참여자에게만 보이는 줄이라 굳이
      // 표시할 이유가 없어 보이지만, 여기서 글을 쓰면 어디까지 퍼지는지가 달라진다.
      label={(
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, minWidth: 0 }}>
          {/* opacity로 흐리게 하지 않는다 — 아이콘마다 다른 opacity를 주다 보니 진하기가
              제각각이었다(사용자 지적, 2026-08-26). color를 지정하지 않고 줄 색을
              그대로 상속해, 선택된 줄(크림 알약 위 짙은 글자)에서도 자동으로 맞는
              색이 된다. */}
          {isPrivateChannel(c) ? (
            <LockIcon sx={{ fontSize: 14, flexShrink: 0 }} />
          ) : (
            <TagIcon sx={{ fontSize: 15, flexShrink: 0 }} />
          )}
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</Box>
          {/* 알림 끈 채널 표시(P4-D). opts.muted(보관·나간 채널 흐림)와는 다른 개념이라
              같은 이름을 안 쓴다 — 이건 "알림을 안 받는다"는 뜻이지 채널이 흐려 보이는
              것과는 무관하다. */}
          {isMuted(prefs, c.id) && (
            <NotificationsOffOutlinedIcon sx={{ fontSize: 13, flexShrink: 0, color: 'text.disabled' }} />
          )}
        </Box>
      )}
      selected={c.id === activeChannelId}
      // 안 읽은 대화가 있으면 굵게. 점을 따로 찍지 않는 이유는 오른쪽에 이미 마감·진행 중
      // 칩이 있어서다 — 표시가 둘이면 어느 쪽이 급한 것인지 매번 다시 읽어야 한다.
      strong={!opts.muted && hasUnread(c, reads)}
      muted={opts.muted}
      onClick={() => navigate(`/channels/${c.id}`)}
      chip={badgeFor(c, activeChannelId, opts.muted)}
      // 보관·나간 채널에는 개인화 메뉴를 달지 않는다. 목록에서 접혀 있는 줄을 즐겨찾기에
      // 넣을 수 있으면 접어둔 의미가 없다.
      action={opts.muted ? undefined : (
        <IconButton
          size="small"
          aria-label={`${c.name} 채널 설정`}
          onClick={(e) => { e.stopPropagation(); setRowMenu({ anchor: e.currentTarget, channelId: c.id }) }}
          sx={{ p: 0.25 }}
        >
          <MoreVertIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}
      actionActive={rowMenu?.channelId === c.id}
    />
  )

  const menuChannel = channels.find(c => c.id === rowMenu?.channelId) || null
  const menuFavorite = menuChannel ? isFavorite(prefs, menuChannel.id) : false
  const menuMuted = menuChannel ? isMuted(prefs, menuChannel.id) : false
  const menuSectionId = menuChannel ? sectionOf(prefs, menuChannel.id) : null
  const menuSection = sections.find(s => s.id === sectionMenu?.sectionId) || null

  return (
    <>
      {/* 디렉터리 — 채널 목록 위에 고정. 이 화면에 오는 이유가 "아직 내 목록에 없는 것을
          찾는다"라서, 내 목록 아래에 두면 정작 목록이 빈 사람에게 제일 안 보인다. */}
      <SidebarItem
        label={(
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
            <GroupsIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            디렉터리
          </Box>
        )}
        selected={!!directoryActive}
        onClick={() => navigate('/channels/directory')}
      />

      {loading ? null : channels.length === 0 ? (
        <SidebarEmpty>참여 중인 채널이 없습니다</SidebarEmpty>
      ) : groups.map(g => {
        const isUserSection = g.kind === 'section'
        return (
          <SidebarSection
            key={g.id}
            label={g.name}
            icon={GROUP_ICON[g.kind]}
            count={g.channels.length}
            open={!isCollapsed(prefs, g.id)}
            onToggle={() => run(p => toggleCollapsed(p, g.id), '접기 상태를 저장하지 못했습니다.')}
            actionOnHover
            actionActive={sectionMenu?.sectionId === g.id}
            action={isUserSection ? (
              <IconButton
                size="small"
                aria-label={`${g.name} 섹션 설정`}
                onClick={(e) => setSectionMenu({ anchor: e.currentTarget, sectionId: g.id })}
                sx={{ p: 0.25 }}
              >
                <MoreVertIcon sx={{ fontSize: 16 }} />
              </IconButton>
            ) : undefined}
          >
            {g.channels.length === 0 ? (
              <SidebarEmpty>채널의 ⋮ 에서 이 섹션으로 옮기세요</SidebarEmpty>
            ) : g.channels.map(c => channelRow(c))}
          </SidebarSection>
        )
      })}

      {/* 채널 추가 — 목록 아래. 위에 두면 목록보다 먼저 눈에 띄어, 매일 쓰는 목록을
          훑기 전에 "새로 만들기"부터 마주친다(사용자 요청, 2026-08-26 — Slack도
          목록 아래에 둔다). Button이 아니라 SidebarItem으로 그린다 — MUI 기본
          Button은 primary(파란) 색에 hover 박스가 도드라져 목록과 따로 논다.
          Slack의 "+채널 추가"도 다른 줄과 같은 모양이다(사용자 지적, 2026-08-26). */}
      <SidebarItem
        label={(
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, color: 'text.secondary' }}>
            <AddIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            새 채널
          </Box>
        )}
        onClick={onNewChannel}
      />

      {channels.length > 0 && sections.length < SECTION_MAX && (
        <Button
          fullWidth size="small" startIcon={<CreateNewFolderIcon sx={{ fontSize: 16 }} />}
          onClick={() => openNameDialog('new')}
          sx={{ justifyContent: 'flex-start', color: 'text.disabled', fontSize: '0.8rem', mt: 0.1 }}
        >
          새 섹션
        </Button>
      )}

      {/* 다이렉트 메시지 — 채널에 물을 자리가 없을 때의 폴백이다. 채널 아래에 두는 것은
          순서가 곧 권유이기 때문이다("채널 우선, DM은 폴백" · PLAN_channels.md 메시징 모델).
          비어 있어도 그리는 이유는 여기가 대화를 시작하는 유일한 입구라서다 — 채널·보관함처럼
          숨기면 첫 DM을 보낼 방법이 없다. */}
      <SidebarSection
        label="다이렉트 메시지" icon={ForumIcon} count={dms.length}
        // 접었을 때도 안 읽은 대화가 몇 개인지는 보여야 한다. 채널 줄과 달리 DM은 굵은
        // 글씨가 접힘 뒤로 사라지면 온 줄도 모른다.
        badge={openDms ? 0 : otherDms.filter(c => hasUnread(c, reads)).length}
        open={openDms} onToggle={() => setOpenDms(v => !v)}
      >
        {/* 나와의 대화 — 늘 맨 위 고정. 아직 만들어지지 않았어도(첫 방문) 눌러 바로
            만들 수 있어야 발견된다 — 채널 목록에 안 뜨는 것을 찾아 헤매게 두지 않는다. */}
        <SidebarItem
          label={(
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, minWidth: 0 }}>
              <BookmarkIcon sx={{ fontSize: 15, flexShrink: 0 }} />
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>나와의 대화</Box>
            </Box>
          )}
          selected={!!selfDm && selfDm.id === activeChannelId}
          strong={!!selfDm && hasUnread(selfDm, reads)}
          onClick={() => (selfDm ? navigate(`/channels/${selfDm.id}`) : onSelfDm?.())}
        />
        {otherDms.length === 0 ? (
          <SidebarEmpty>대화가 없습니다</SidebarEmpty>
        ) : otherDms.map(c => (
          <SidebarItem
            key={c.id}
            label={dmTitle(c, myUid)}
            selected={c.id === activeChannelId}
            strong={hasUnread(c, reads)}
            onClick={() => navigate(`/channels/${c.id}`)}
          />
        ))}
        <SidebarItem
          label={(
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, color: 'text.secondary' }}>
              <AddIcon sx={{ fontSize: 16, flexShrink: 0 }} />
              새 대화 시작
            </Box>
          )}
          onClick={onNewDm}
        />
      </SidebarSection>

      {leftChannels.length > 0 && (
        <SidebarSection
          label="나간 채널" icon={LogoutIcon} count={leftChannels.length}
          open={openLeft} onToggle={() => setOpenLeft(v => !v)}
        >
          {leftChannels.map(c => channelRow(c, { muted: true }))}
        </SidebarSection>
      )}

      {archivedChannels.length > 0 && (
        <SidebarSection
          label="보관함" icon={ArchiveIcon} count={archivedChannels.length}
          open={openArchived} onToggle={() => setOpenArchived(v => !v)}
        >
          {archivedChannels.map(c => channelRow(c, { muted: true }))}
        </SidebarSection>
      )}

      {/* 바로가기 — 스마트교무실 밖 링크. 쪽지마다 붙는 드라이브 링크를 매번 다시 찾지
          않도록 같은 자리에 고정한다(externalLinks.js). 매일 누르는 목록이 아니라 접어 둔다. */}
      <SidebarSection
        label="바로가기" icon={LaunchIcon} count={EXTERNAL_LINKS.length}
        open={openLinks} onToggle={() => setOpenLinks(v => !v)}
      >
        {EXTERNAL_LINKS.map(link => (
          <SidebarItem key={link.href} label={link.label} href={link.href} />
        ))}
      </SidebarSection>

      {/* 채널 줄 메뉴 — 즐겨찾기와 섹션 이동을 한 판에 둔다. 하위 메뉴로 접으면 섹션이
          두어 개뿐인데도 한 번 더 눌러야 한다. */}
      <Menu
        anchorEl={rowMenu?.anchor} open={!!rowMenu} onClose={closeMenus}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          sx={{ fontSize: '0.85rem', gap: 1 }}
          onClick={() => {
            run(p => toggleFavorite(p, menuChannel.id), '즐겨찾기를 바꾸지 못했습니다.')
            closeMenus()
          }}
        >
          {menuFavorite
            ? <><StarIcon sx={{ fontSize: 17, color: 'warning.main' }} />즐겨찾기 해제</>
            : <><StarBorderIcon sx={{ fontSize: 17 }} />즐겨찾기에 추가</>}
        </MenuItem>

        <MenuItem
          sx={{ fontSize: '0.85rem', gap: 1 }}
          onClick={() => {
            run(p => toggleMuted(p, menuChannel.id), '알림 설정을 바꾸지 못했습니다.')
            closeMenus()
          }}
        >
          {menuMuted
            ? <><NotificationsOutlinedIcon sx={{ fontSize: 17 }} />알림 켜기</>
            : <><NotificationsOffOutlinedIcon sx={{ fontSize: 17 }} />알림 끄기</>}
        </MenuItem>

        <Divider />
        <Typography sx={{ px: 2, py: 0.5, fontSize: '0.7rem', fontWeight: 800, color: 'text.disabled' }}>
          섹션으로 이동
        </Typography>

        <MenuItem
          selected={!menuFavorite && !menuSectionId}
          sx={{ fontSize: '0.85rem' }}
          onClick={() => {
            run(p => moveToSection(p, menuChannel.id, null), '섹션을 바꾸지 못했습니다.')
            closeMenus()
          }}
        >
          채널 (기본)
        </MenuItem>
        {sections.map(s => (
          <MenuItem
            key={s.id}
            selected={menuSectionId === s.id}
            sx={{ fontSize: '0.85rem' }}
            onClick={() => {
              run(p => moveToSection(p, menuChannel.id, s.id), '섹션을 바꾸지 못했습니다.')
              closeMenus()
            }}
          >
            {s.name}
          </MenuItem>
        ))}
        {sections.length < SECTION_MAX && (
          <MenuItem
            sx={{ fontSize: '0.85rem', gap: 1, color: 'text.secondary' }}
            onClick={() => {
              const channelId = menuChannel.id
              closeMenus()
              setNameDialog({ mode: 'new', sectionId: null, value: '', error: null, movingChannelId: channelId })
            }}
          >
            <CreateNewFolderIcon sx={{ fontSize: 16 }} />새 섹션으로…
          </MenuItem>
        )}
      </Menu>

      {/* 섹션 머리 메뉴 */}
      <Menu
        anchorEl={sectionMenu?.anchor} open={!!sectionMenu} onClose={closeMenus}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem sx={{ fontSize: '0.85rem' }} onClick={() => openNameDialog('rename', menuSection)}>
          이름 바꾸기
        </MenuItem>
        <MenuItem
          sx={{ fontSize: '0.85rem' }}
          onClick={() => { const s = menuSection; closeMenus(); setDeleting(s) }}
        >
          섹션 지우기
        </MenuItem>
      </Menu>

      <Dialog open={!!nameDialog} onClose={() => setNameDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800 }}>
          {nameDialog?.mode === 'rename' ? '섹션 이름 바꾸기' : '새 섹션'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" margin="dense"
            label="섹션 이름"
            placeholder="예: 고사 관련"
            value={nameDialog?.value ?? ''}
            error={!!nameDialog?.error}
            helperText={nameDialog?.error || `${SECTION_NAME_MAX}자까지`}
            inputProps={{ maxLength: SECTION_NAME_MAX }}
            onChange={e => setNameDialog(d => ({ ...d, value: e.target.value, error: null }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitName() } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNameDialog(null)}>취소</Button>
          <Button variant="contained" onClick={submitName}>
            {nameDialog?.mode === 'rename' ? '저장' : '만들기'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800 }}>이 섹션을 지울까요?</DialogTitle>
        <DialogContent>
          <Typography fontSize="0.9rem"><strong>{deleting?.name}</strong></Typography>
          {/* 섹션은 보기 좋게 묶어둔 것일 뿐 채널 참여와 무관하다. 그걸 안 적으면
              정리해야 할 사람이 채널이 사라질까 봐 손을 못 댄다. */}
          <Typography color="text.secondary" fontSize="0.85rem" sx={{ mt: 1 }}>
            묶음만 없어지고 채널은 그대로 있습니다. 안에 있던 채널은 '채널' 목록으로 돌아갑니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleting(null)}>취소</Button>
          <Button
            variant="contained"
            onClick={() => {
              run(p => removeSection(p, deleting.id), '섹션을 지우지 못했습니다.')
              setDeleting(null)
            }}
          >
            지우기
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/** 사이드바 뱃지 — 보관·나간 채널은 흐린 줄이라 급한 표시를 달지 않는다. */
function badgeFor(c, activeChannelId, muted) {
  if (muted) return null
  const selected = c.id === activeChannelId
  if (c.stats.overdueCount > 0) {
    return <MiniChip label={`마감 ${c.stats.overdueCount}`} tone="danger" selected={selected} />
  }
  if (c.stats.openCount > 0) {
    return <MiniChip label={c.stats.openCount} tone="neutral" selected={selected} />
  }
  return null
}

export { FAVORITES_ID, DEFAULT_ID }
