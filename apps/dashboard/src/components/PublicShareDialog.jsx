/**
 * 캔버스 공유 — 교직원용 링크 복사 + "링크가 있는 누구나 보기" 공개 링크 켜고 끄기.
 *
 * 공개는 글쓴이·담당자(ownerUids)·관리자만 켜고 끌 수 있다(원본 글 수정 권한과 같은 기준 —
 * 규칙도 그 update 조건으로 막는다). 그 밖의 사람에게는 켜져 있으면 링크를, 꺼져 있으면
 * 누가 켤 수 있는지만 보여준다.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PublicIcon from '@mui/icons-material/Public'
import LockIcon from '@mui/icons-material/LockOutlined'
import { useAuth } from '@shared/contexts/AuthContext'
import { enablePublicShare, disablePublicShare, publicShareUrl } from '@shared/lib/publicCanvas'
import { useToast } from './ToastProvider'

export default function PublicShareDialog({ open, onClose, post, staffUrl, canManage, onForward }) {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const token = post?.publicShare?.token || null
  const publicUrl = token ? publicShareUrl(token) : ''

  const copy = async (text, msg) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(msg)
    } catch (e) {
      toast.error('링크를 복사하지 못했습니다.', e)
    }
  }

  const toggle = async (on) => {
    if (!post) return
    if (!on && !window.confirm('공개 링크를 끌까요?\n이미 보낸 링크로는 더 이상 볼 수 없습니다. 다시 켜면 새 링크가 만들어집니다.')) return
    setBusy(true)
    try {
      if (on) {
        const t = await enablePublicShare({ schoolId, requestId: post.id, uid: user.uid, existing: post.publicShare })
        await copy(publicShareUrl(t), '공개 링크를 만들고 복사했습니다.')
      } else {
        await disablePublicShare({ schoolId, requestId: post.id })
        toast.success('공개 링크를 껐습니다.')
      }
    } catch (e) {
      toast.error(on ? '공개 링크를 만들지 못했습니다.' : '공개 링크를 끄지 못했습니다.', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        공유
        <Typography fontSize="0.8rem" color="text.secondary" noWrap>{post?.title || '(제목 없음)'}</Typography>
      </DialogTitle>
      <DialogContent>
        {/* 교직원용 — 로그인한 같은 학교 교직원이 앱에서 바로 연다(글 읽기 권한은 그대로) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
          <LockIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography fontSize="0.88rem" fontWeight={700}>교직원용 링크</Typography>
            <Typography fontSize="0.74rem" color="text.secondary">로그인한 우리 학교 교직원만 열 수 있습니다</Typography>
          </Box>
          <Button size="small" onClick={() => copy(staffUrl, '교직원용 링크를 복사했습니다.')} disabled={!staffUrl}>복사</Button>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <PublicIcon sx={{ fontSize: 20, color: token ? 'success.main' : 'text.secondary' }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography fontSize="0.88rem" fontWeight={700}>링크가 있는 누구나 보기</Typography>
            <Typography fontSize="0.74rem" color="text.secondary">
              {token ? '로그인 없이 읽을 수 있습니다(수정 불가)' : '켜면 학생·학부모 등 누구나 링크로 읽을 수 있습니다'}
            </Typography>
          </Box>
          {canManage && <Switch checked={!!token} disabled={busy} onChange={(e) => toggle(e.target.checked)} />}
        </Box>

        {token && (
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
            <TextField size="small" fullWidth value={publicUrl} InputProps={{ readOnly: true, sx: { fontSize: '0.8rem' } }} onFocus={(e) => e.target.select()} />
            <Button variant="contained" size="small" onClick={() => copy(publicUrl, '공개 링크를 복사했습니다.')} sx={{ flexShrink: 0 }}>복사</Button>
          </Box>
        )}

        {canManage ? (
          <Typography fontSize="0.74rem" color="text.disabled" sx={{ mt: 1.5 }}>
            글을 고치면 공개 화면에도 자동으로 반영됩니다. 대상자 명단·완료 현황·댓글은 공개되지 않습니다.
            개인정보가 담긴 글은 공개하지 마세요.
          </Typography>
        ) : !token && (
          <Typography fontSize="0.74rem" color="text.disabled" sx={{ mt: 1.5 }}>
            공개 링크는 글쓴이·담당자·관리자가 켤 수 있습니다.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: onForward ? 'space-between' : 'flex-end', px: 3, pb: 2 }}>
        {/* 교내 채널·사람에게 넘기는 기존 '이 글 전달'로 가는 길도 여기서 열어 둔다 */}
        {onForward && <Button onClick={onForward} sx={{ fontSize: '0.8rem' }}>채널·사람에게 전달</Button>}
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}
