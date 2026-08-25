/**
 * 글쓰기·고치기 — 채널 3단 안에서 그대로 쓴다.
 *
 * 예전에는 `/requests/new`가 별도 페이지였다. 채널을 보다가 '글 쓰기'를 누르면 2단(채널
 * 목록)이 사라지고 3단이 전체 폭을 차지하는 화면으로 튀었다 — 쓰는 동안 어느 채널에
 * 쓰는 중인지, 그 채널에 무슨 말이 오갔는지가 화면에서 없어졌다. 그래서 여기서는 채널
 * 화면(Channels.jsx)의 3단 자리에 그대로 얹힌다(`PLAN_composer.md` §2).
 *
 * 채널을 고르는 화면이 아니다 — 채널은 이미 정해져 있다(부모가 넘겨주는 `channel`).
 * "채널 없음"과 채널 <Select>는 P3-A(모든 글이 채널을 갖는다) 이후로 뜻이 없어져 없앴다.
 * 글을 쓴 뒤 다른 채널로 옮길 일은 남아 있지만, 그건 쓰는 중이 아니라 쓴 뒤에 '전달'로
 * 하는 일이다(`PLAN_composer.md` §4).
 *
 * 대상도 기본은 "이 채널 참여자 전원"이고 좁히는 것은 예외라, 한 줄로만 알리고 눌러야
 * TargetPicker가 펼쳐진다. 고치는 글이 이미 좁혀져 있으면(채널 전원과 다르면) 처음부터
 * 펼쳐 보여준다 — 좁혀둔 걸 숨기면 고치는 사람이 그 사실을 놓친다.
 *
 * 문서 ID를 화면에 들어올 때 미리 만들어 두는 이유는 첨부와 본문 이미지 때문이다. 둘 다
 * 고르는 즉시 schools/{schoolId}/requests/{requestId}/ 아래로 올라가야 하는데, 저장
 * 시점에 ID를 만들면 그 전에 올린 파일의 경로를 정할 수 없다(PostNew.jsx 시절부터의 이유).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { describeRule, resolveTargets } from '@shared/lib/targeting'
import { isRequest, newRequestPayload } from '@shared/lib/workRequests'
import { postVisibilityFor } from '@shared/lib/channels'
import { deleteAttachment } from '@shared/lib/requestAttachments'
import { htmlToText, sanitizeHtml } from '@shared/lib/richText'
import TargetPicker from './TargetPicker'
import AttachmentPicker from './AttachmentPicker'
import RichTextEditor from './RichTextEditor'
import { useToast } from './ToastProvider'
import { updatePostContent } from '../lib/requestActions'

const EMPTY_RULE = { conditions: [], includeUids: [], excludeUids: [] }

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** 다음 금요일. 오늘이 금요일이면 이번 주가 아니라 다음 주를 준다. */
function comingFriday() {
  const d = new Date()
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
  return ymd(d)
}

const DUE_PRESETS = [
  { label: '오늘', get: () => shiftDays(0) },
  { label: '내일', get: () => shiftDays(1) },
  { label: '금요일', get: comingFriday },
  { label: '1주 뒤', get: () => shiftDays(7) },
]

/** 마감일까지 며칠 남았는지. 날짜만 보고는 감이 안 와서 옆에 붙여둔다. */
function dueLabel(value) {
  if (!value) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${value}T00:00:00`)
  const days = Math.round((due - today) / 86400000)
  if (days === 0) return '오늘'
  if (days < 0) return `${-days}일 지남`
  return `${days}일 뒤`
}

/**
 * @param {object} channel 지금 글을 쓰는 채널. 대상 기본값과 열람 범위가 여기서 나온다.
 * @param {string} [editingId] 있으면 고치기 모드 — 그 글을 읽어와 채운다.
 * @param {(requestId: string) => void} onSaved 저장 뒤(새 글이면 새로 만든 id).
 * @param {() => void} onCancel 취소 — 업로드해 둔 파일 정리는 여기 안에서 처리한다.
 * @param {object[]} members 학교 구성원 — 부모(Channels.jsx)가 이미 구독 중인 것을 그대로 받는다.
 * @param {boolean} membersLoading
 */
export default function PostComposer({ channel, editingId, onSaved, onCancel, members, membersLoading }) {
  const { user, userName, schoolId } = useAuth()
  const toast = useToast()

  // 새 글은 첨부 경로에 쓸 ID를 미리 만들고, 고칠 때는 이미 있는 문서를 그대로 쓴다
  const draftId = useMemo(
    () => (schoolId && !editingId ? doc(collection(db, ...schoolPath(schoolId, COL.REQUESTS))).id : null),
    [schoolId, editingId],
  )
  const requestId = editingId || draftId

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [needsCompletion, setNeedsCompletion] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [rule, setRule] = useState(channel?.memberRule || EMPTY_RULE)
  const [targetOpen, setTargetOpen] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [bodyImages, setBodyImages] = useState([])   // 본문에 넣은 이미지 (버릴 때 정리용)
  const [links, setLinks] = useState([])
  const [saving, setSaving] = useState(false)
  const [loadingPost, setLoadingPost] = useState(!!editingId)

  // 고치기를 시작한 시점에 이미 붙어 있던 파일. 도중에 그만둬도 이건 지우면 안 된다.
  const keptFiles = useRef(new Set())

  /**
   * 고칠 글을 한 번만 읽어온다. onSnapshot으로 구독하지 않는 이유: 쓰는 도중에 서버 값이
   * 들어오면 방금 친 내용이 덮인다.
   */
  useEffect(() => {
    if (!editingId || !schoolId) return
    let alive = true
    getDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), editingId))
      .then(snap => {
        if (!alive) return
        if (!snap.exists()) {
          toast.error('글을 찾을 수 없습니다. 삭제되었을 수 있습니다.')
          onCancel()
          return
        }
        const post = snap.data()
        setTitle(post.title || '')
        setBodyHtml(post.bodyHtml || '')
        setNeedsCompletion(isRequest(post))
        setPinned(!!post.pinned)
        setDueDate(post.dueDate?.toDate ? ymd(post.dueDate.toDate()) : '')
        setRule(post.targetRule || channel?.memberRule || EMPTY_RULE)
        // 채널 참여자 전원과 다르면 처음부터 펼친다 — 접어두면 이미 좁혀 놓은 대상을
        // 고치는 사람이 못 보고 "채널 전체 대상"으로 착각한 채 저장할 수 있다.
        const channelUids = new Set(channel?.memberUids || [])
        const savedUids = post.targetUids || []
        const narrowed = savedUids.length !== channelUids.size || savedUids.some(uid => !channelUids.has(uid))
        setTargetOpen(narrowed)
        setAttachments(post.attachments || [])
        setLinks(post.links || [])
        keptFiles.current = new Set((post.attachments || []).map(a => a.path))
        setLoadingPost(false)
      })
      .catch(e => {
        if (!alive) return
        toast.error('글을 불러오지 못했습니다.', e)
        setLoadingPost(false)
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, schoolId])

  const targets = useMemo(() => resolveTargets(rule, members).members, [rule, members])
  const canSave = title.trim() && targets.length > 0 && !saving && !loadingPost

  const blockReason = !title.trim() ? '제목을 입력해 주세요'
    : targets.length === 0 ? '조건에 맞는 대상이 없습니다'
    : null

  /**
   * 취소하면 이번에 올린 파일을 지운다. 첨부와 본문 이미지는 문서를 저장하기 전에
   * 업로드된다(경로에 문서 ID가 필요해서). 쓰다가 그만두면 아무도 참조하지 않는 파일이
   * 저장소에 남으므로 나가는 길에 치운다. 고치는 중이라면 원래 붙어 있던 파일(keptFiles)은
   * 건드리지 않는다.
   */
  const discardAndLeave = () => {
    const uploaded = [...attachments, ...bodyImages].filter(a => !keptFiles.current.has(a.path))
    setAttachments([])
    setBodyImages([])
    onCancel()
    Promise.all(uploaded.map(a => deleteAttachment(a).catch(() => {})))
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const safeHtml = sanitizeHtml(bodyHtml)
      const payload = newRequestPayload({
        kind: needsCompletion ? 'request' : 'notice',
        title,
        description: htmlToText(safeHtml),
        dueDate: dueDate ? new Date(dueDate) : null,
        pinned,
        attachments,
        links,
        targetRule: rule,
        targetRuleText: describeRule(rule),
        targets,
        createdBy: user.uid,
        createdByName: userName,
      })

      if (editingId) {
        // 고칠 때 넘기지 않는 것 — completedUids(이미 한 사람의 기록), status(마감 여부),
        // createdBy/createdByName(글쓴이). 채널은 프롭으로 고정이라 옮길 수 없다(전달로 한다).
        await updatePostContent({
          schoolId,
          requestId,
          patch: {
            kind: payload.kind,
            title: payload.title,
            description: payload.description,
            dueDate: payload.dueDate,
            pinned: payload.pinned,
            attachments: payload.attachments,
            links: payload.links,
            targetRule: payload.targetRule,
            targetRuleText: payload.targetRuleText,
            targetUids: payload.targetUids,
            targetNames: payload.targetNames,
            bodyHtml: safeHtml,
            channelId: channel.id,
            ...postVisibilityFor(channel),
          },
        })
        const kept = new Set(attachments.map(a => a.path))
        await Promise.all([...keptFiles.current]
          .filter(path => !kept.has(path))
          .map(path => deleteAttachment({ path }).catch(() => {})))
        toast.success('수정한 내용을 저장했습니다.')
      } else {
        await setDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId), {
          ...payload,
          bodyHtml: safeHtml,
          channelId: channel.id,
          ...postVisibilityFor(channel),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        toast.success(`${targets.length}명에게 ${needsCompletion ? '요청을' : '안내를'} 보냈습니다.`)
      }
      onSaved(requestId)
    } catch (e) {
      toast.error(editingId ? '수정 내용을 저장하지 못했습니다.' : '글을 보내지 못했습니다.', e)
    } finally {
      setSaving(false)
    }
  }

  if (loadingPost) {
    return <Typography color="text.secondary" sx={{ p: 2.5 }}>글을 불러오는 중…</Typography>
  }

  const due = dueLabel(dueDate)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flexShrink: 0, px: 2, pt: 1.5 }}>
        <TextField
          fullWidth autoFocus variant="standard"
          placeholder="제목"
          value={title} onChange={e => setTitle(e.target.value)}
          inputProps={{ style: { fontSize: '1.05rem', fontWeight: 700 } }}
          sx={{ mb: 1.2 }}
        />

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
          <SegChoice
            value={needsCompletion ? 'request' : 'notice'}
            onChange={v => setNeedsCompletion(v === 'request')}
            options={[
              { value: 'request', label: '요청', Icon: CheckCircleOutlineIcon },
              { value: 'notice', label: '안내', Icon: CampaignOutlinedIcon },
            ]}
          />
          {needsCompletion ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <TextField
                type="date" size="small"
                value={dueDate} onChange={e => setDueDate(e.target.value)}
                inputProps={{ style: { fontSize: '0.8rem' } }}
                sx={{ width: 148 }}
              />
              {DUE_PRESETS.map(p => (
                <Chip
                  key={p.label} size="small" variant="outlined" label={p.label}
                  onClick={() => setDueDate(p.get())}
                  sx={{ fontSize: '0.72rem', height: 22 }}
                />
              ))}
              {due && <Typography fontSize="0.74rem" color="text.secondary">{due}</Typography>}
            </Box>
          ) : (
            <FormControlLabel
              sx={{ ml: 0 }}
              control={<Checkbox size="small" checked={pinned} onChange={e => setPinned(e.target.checked)} />}
              label={<Typography fontSize="0.8rem">목록 맨 위에 고정</Typography>}
            />
          )}
        </Box>

        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Typography fontSize="0.8rem" color="text.secondary" sx={{ flexGrow: 1 }}>
              이 채널 참여자 {targets.length}명이 대상입니다
            </Typography>
            <Button size="small" onClick={() => setTargetOpen(v => !v)} sx={{ fontSize: '0.76rem' }}>
              {targetOpen ? '접기' : '대상 좁히기'}
            </Button>
          </Box>
          <Collapse in={targetOpen}>
            <Box sx={{ mt: 1, maxWidth: 420 }}>
              {membersLoading
                ? <Typography color="text.secondary" fontSize="0.85rem">구성원 불러오는 중…</Typography>
                : <TargetPicker members={members} value={rule} onChange={setRule} />}
            </Box>
          </Collapse>
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 2 }}>
        <RichTextEditor
          docId={requestId}
          value={bodyHtml}
          onChange={setBodyHtml}
          onImageUploaded={img => setBodyImages(prev => [...prev, img])}
          placeholder="무엇을 어떻게 하면 되는지 적어주세요. 이미지는 붙여넣거나 끌어다 놓으면 됩니다."
        />
        <Box sx={{ my: 1.5 }}>
          <AttachmentPicker
            requestId={requestId}
            deferRemove={!!editingId}
            attachments={attachments}
            links={links}
            onChange={({ attachments: a, links: l }) => { setAttachments(a); setLinks(l) }}
          />
        </Box>
      </Box>

      <Box sx={{
        flexShrink: 0, borderTop: '1px solid', borderColor: 'divider',
        px: 2, py: 1.1, display: 'flex', alignItems: 'center', gap: 1.2,
      }}>
        {blockReason && (
          <Typography fontSize="0.76rem" color="text.secondary">{blockReason}</Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" onClick={discardAndLeave}>취소</Button>
        <Button variant="contained" size="small" onClick={handleSave} disabled={!canSave}>
          {editingId
            ? '수정한 내용 저장'
            : targets.length > 0
              ? `${targets.length}명에게 ${needsCompletion ? '요청' : '안내'} 보내기`
              : '보내기'}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * 둘 중 하나 고르기. 체크상자로 두면 "완료 확인 받기"를 껐을 때 무엇이 되는지가 안
 * 보인다. 요청과 안내를 나란히 놓아 지금 어느 쪽으로 나가는지 한눈에 보이게 한다.
 */
function SegChoice({ value, onChange, options }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.3, p: 0.3, borderRadius: 1, bgcolor: 'action.hover' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <Box
            key={o.value} component="button" type="button"
            onClick={() => onChange(o.value)}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
              border: 0, borderRadius: 0.75, py: 0.4, px: 1, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.8rem',
              fontWeight: on ? 700 : 500,
              bgcolor: on ? 'background.paper' : 'transparent',
              boxShadow: on ? 1 : 0,
              color: on ? 'primary.main' : 'text.secondary',
            }}
          >
            <o.Icon sx={{ fontSize: 15 }} />{o.label}
          </Box>
        )
      })}
    </Box>
  )
}
