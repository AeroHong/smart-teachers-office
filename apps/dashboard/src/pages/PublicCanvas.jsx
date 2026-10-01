/**
 * 캔버스 공개 보기 — /share/:token (로그인 불필요, 읽기 전용).
 *
 * 링크를 받은 학생·학부모·외부인이 여는 화면이라 교무실 앱의 틀(사이드바·상단바)을 쓰지
 * 않고 문서 한 장만 보여준다. 데이터는 공개용 사본(publicCanvases/{token})뿐이고, 글쓴이가
 * 공개를 끄면 사본이 지워져 이 화면은 "볼 수 없는 링크"로 바뀐다.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { sanitizeHtml } from '@shared/lib/richText'
import { hydrateDateChips } from '@shared/lib/dateChips'
import { loadPublicCanvas } from '@shared/lib/publicCanvas'
import { RICH_TEXT_SX } from '../components/richTextStyles'
import RequestMaterials from '../components/RequestMaterials'

function fmtDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function PublicCanvas() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, canvas: null, error: false })
  const bodyRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    loadPublicCanvas(token)
      .then((canvas) => { if (!cancelled) setState({ loading: false, canvas, error: false }) })
      .catch(() => { if (!cancelled) setState({ loading: false, canvas: null, error: true }) })
    return () => { cancelled = true }
  }, [token])

  const { loading, canvas, error } = state

  useEffect(() => {
    if (canvas?.title) document.title = canvas.title
    hydrateDateChips(bodyRef.current)
  }, [canvas])

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}><CircularProgress /></Box>
  }

  if (!canvas) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: '2.2rem', mb: 1 }}>🔒</Typography>
          <Typography fontWeight={800} fontSize="1.1rem" mb={0.5}>볼 수 없는 링크입니다</Typography>
          <Typography color="text.secondary" fontSize="0.9rem">
            {error ? '문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : '공유가 중지되었거나 잘못된 주소입니다.'}
          </Typography>
        </Box>
      </Box>
    )
  }

  const hasMaterials = (canvas.attachments || []).length > 0 || (canvas.links || []).length > 0

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', py: { xs: 0, sm: 4 } }}>
      <Box sx={{
        maxWidth: 860, mx: 'auto', bgcolor: '#fff',
        borderRadius: { xs: 0, sm: '14px' }, border: { xs: 'none', sm: '1px solid #e2e8f0' }, overflow: 'hidden',
      }}>
        {canvas.coverImageUrl && (
          <Box
            component="img" src={canvas.coverImageUrl} alt="표지"
            sx={{ width: '100%', height: 180, objectFit: 'cover', display: 'block', objectPosition: `center ${canvas.coverImagePosition ?? 50}%` }}
          />
        )}
        <Box sx={{ px: { xs: 2, sm: 5 }, py: { xs: 3, sm: 4 } }}>
          <Typography variant="h5" fontWeight={800} sx={{ wordBreak: 'keep-all' }}>{canvas.title || '(제목 없음)'}</Typography>
          <Typography color="text.secondary" fontSize="0.84rem" mt={0.75} mb={3}>
            {[canvas.schoolName, canvas.createdByName, fmtDate(canvas.updatedAt)].filter(Boolean).join(' · ')}
          </Typography>

          {canvas.bodyHtml ? (
            <Box
              ref={bodyRef}
              sx={{ fontSize: '0.98rem', lineHeight: 1.8, ...RICH_TEXT_SX }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(canvas.bodyHtml) }}
            />
          ) : canvas.description ? (
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{canvas.description}</Typography>
          ) : null}

          {hasMaterials && (
            <Box sx={{ mt: 4 }}>
              <Typography fontWeight={700} fontSize="0.9rem" mb={1}>자료</Typography>
              <RequestMaterials attachments={canvas.attachments || []} links={canvas.links || []} />
            </Box>
          )}
        </Box>
      </Box>
      <Typography sx={{ textAlign: 'center', fontSize: '0.75rem', color: 'text.disabled', py: 3 }}>
        스마트 교무실에서 공유한 읽기 전용 문서입니다
      </Typography>
    </Box>
  )
}
