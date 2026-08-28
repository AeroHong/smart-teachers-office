/**
 * 캔버스 표지 고르기 팝오버 — "라이브러리"(관리자가 채운 학교 사진)와 "업로드"(개인
 * 1회용 사진) 두 탭 + "표지 제거". Google Sites의 표지 고르기 UI를 참고했다(사용자
 * 제공 스크린샷, 2026-08-28).
 *
 * anchorEl을 쓴다 — 트리거(빈 상태 박스·"바꾸기" 버튼)가 팝오버가 열려 있는 동안 계속
 * 같은 자리에 살아있어서(ReactionPicker처럼 hover로 사라지는 손잡이가 아니다) anchorEl
 * 방식이 그대로 안전하다.
 *
 * 이 앱은 처음부터 "자동저장, 별도 저장 버튼 없음"으로 일관해 왔다 — 그래서 Google처럼
 * 취소/저장 버튼 쌍을 새로 두지 않는다. 라이브러리 썸네일을 클릭하거나 업로드가 끝나면
 * 그 즉시 적용되고 팝오버가 닫힌다.
 */
import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import CloseIcon from '@mui/icons-material/Close'
import { useAuth } from '@shared/contexts/AuthContext'
import { uploadAttachment } from '@shared/lib/requestAttachments'
import { addCoverTemplate, deleteCoverTemplate } from '../lib/coverTemplateActions'
import useCoverTemplates from '../lib/useCoverTemplates'
import { useToast } from './ToastProvider'

export default function CoverPicker({ anchorEl, open, onClose, docId, folder = 'requests', hasCover, onSelect, onRemove }) {
  const { schoolId, user, isAdmin } = useAuth()
  const toast = useToast()
  const templates = useCoverTemplates()
  const [tab, setTab] = useState('library')
  const [uploading, setUploading] = useState(false)
  const personalInputRef = useRef(null)
  const libraryInputRef = useRef(null)

  const handlePersonalUpload = async (file) => {
    setUploading(true)
    try {
      const uploaded = await uploadAttachment({ schoolId, docId, folder, file })
      onSelect(uploaded)
      onClose()
    } catch (e) {
      toast.error(`표지를 올리지 못했습니다: ${e.message}`, e)
    } finally {
      setUploading(false)
    }
  }

  const handleLibraryAdd = async (file) => {
    setUploading(true)
    try {
      const uploaded = await addCoverTemplate({ schoolId, uid: user.uid, file })
      onSelect(uploaded)
      onClose()
    } catch (e) {
      toast.error(`템플릿을 올리지 못했습니다: ${e.message}`, e)
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteTemplate = async (e, template) => {
    e.stopPropagation()
    try {
      await deleteCoverTemplate({ schoolId, template })
    } catch (err) {
      toast.error('템플릿을 지우지 못했습니다.', err)
    }
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Box sx={{ width: 340 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="fullWidth" sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '0.82rem' } }}>
          <Tab value="library" label="라이브러리" />
          <Tab value="upload" label="업로드" />
        </Tabs>

        {tab === 'library' ? (
          <Box sx={{ p: 1.2, maxHeight: 320, overflowY: 'auto' }}>
            {templates.length === 0 && !isAdmin && (
              <Typography color="text.secondary" fontSize="0.8rem" sx={{ py: 3, textAlign: 'center' }}>
                아직 준비된 템플릿이 없습니다.
              </Typography>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.8 }}>
              {isAdmin && (
                <Box
                  component="button" type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={uploading}
                  sx={{
                    height: 72, borderRadius: 1, cursor: 'pointer',
                    border: '1.5px dashed', borderColor: 'divider', background: 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.3,
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover', borderColor: 'text.disabled' },
                  }}
                >
                  {uploading ? <CircularProgress size={16} /> : <AddIcon sx={{ fontSize: 18 }} />}
                  <Typography fontSize="0.68rem" fontWeight={600}>추가</Typography>
                </Box>
              )}
              {templates.map(t => (
                <Box
                  key={t.id}
                  component="button" type="button"
                  onClick={() => { onSelect(t); onClose() }}
                  sx={{
                    position: 'relative', height: 72, p: 0, border: 0, borderRadius: 1,
                    overflow: 'hidden', cursor: 'pointer',
                    '&:hover .template-delete': { opacity: 1 },
                  }}
                >
                  <Box component="img" src={t.url} alt="표지 템플릿" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {isAdmin && (
                    <Tooltip title="삭제">
                      <IconButton
                        className="template-delete"
                        size="small"
                        onClick={e => handleDeleteTemplate(e, t)}
                        sx={{
                          position: 'absolute', top: 2, right: 2, opacity: 0, transition: 'opacity .12s ease',
                          bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', p: 0.3,
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <AddPhotoAlternateOutlinedIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
            <Typography fontWeight={700} fontSize="0.92rem">이미지 업로드</Typography>
            <Typography color="text.secondary" fontSize="0.76rem" textAlign="center">
              20MB까지 올릴 수 있습니다.
            </Typography>
            <Button
              variant="outlined" size="small"
              onClick={() => personalInputRef.current?.click()}
              disabled={uploading}
              sx={{ mt: 0.5 }}
            >
              {uploading ? <CircularProgress size={16} /> : '업로드'}
            </Button>
          </Box>
        )}

        {hasCover && (
          <Button
            fullWidth size="small" color="error"
            onClick={() => { onRemove(); onClose() }}
            sx={{ fontSize: '0.78rem', borderTop: '1px solid', borderColor: 'divider', borderRadius: 0, py: 0.9 }}
          >
            표지 제거
          </Button>
        )}
      </Box>

      <input
        ref={personalInputRef} type="file" accept="image/*" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handlePersonalUpload(f) }}
      />
      <input
        ref={libraryInputRef} type="file" accept="image/*" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleLibraryAdd(f) }}
      />
    </Popover>
  )
}
