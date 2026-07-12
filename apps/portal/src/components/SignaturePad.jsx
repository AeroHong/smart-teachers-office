import { useRef, useState, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

/**
 * 순수 Canvas API 기반 서명 컴포넌트 (외부 라이브러리 없음)
 *
 * Props:
 *   onSave(dataUrl)    - 서명 저장 시 PNG dataUrl 반환
 *   existingDataUrl    - 기존 서명 (미리보기)
 *   disabled           - true면 미리보기만 표시
 *   label              - 서명자 이름 표시
 */
export default function SignaturePad({ onSave, existingDataUrl, disabled = false, label }) {
  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const hasStrokeRef = useRef(false)
  const [isPreviewMode, setIsPreviewMode] = useState(!!existingDataUrl)

  useEffect(() => {
    if (existingDataUrl) setIsPreviewMode(true)
  }, [existingDataUrl])

  // 캔버스 초기화 (흰 배경)
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    hasStrokeRef.current = false
  }, [])

  useEffect(() => {
    if (disabled || isPreviewMode) return
    initCanvas()
  }, [disabled, isPreviewMode, initCanvas])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const handlePointerDown = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    isDrawingRef.current = true
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const handlePointerMove = (e) => {
    e.preventDefault()
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasStrokeRef.current = true
  }

  const handlePointerUp = (e) => {
    e.preventDefault()
    isDrawingRef.current = false
  }

  const handleClear = () => {
    initCanvas()
  }

  const handleSave = () => {
    if (!hasStrokeRef.current) {
      alert('서명을 그려주세요.')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
    setIsPreviewMode(true)
  }

  const handleResign = () => {
    setIsPreviewMode(false)
  }

  // ── disabled: 미리보기만 ──────────────────────────────────────────────
  if (disabled) {
    return (
      <Box>
        {label && <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{label}</Typography>}
        {existingDataUrl ? (
          <Box component="img" src={existingDataUrl} alt="서명"
            sx={{ width: 400, height: 150, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'block', objectFit: 'contain', background: '#fff' }} />
        ) : (
          <Box sx={{ width: 400, height: 150, border: '1px dashed', borderColor: 'divider', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
            <Typography variant="body2" color="text.disabled">서명 없음</Typography>
          </Box>
        )}
      </Box>
    )
  }

  // ── 미리보기 모드 ────────────────────────────────────────────────────
  if (isPreviewMode && existingDataUrl) {
    return (
      <Box>
        {label && <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{label}</Typography>}
        <Box component="img" src={existingDataUrl} alt="서명"
          sx={{ width: 400, height: 150, border: '1px solid', borderColor: 'success.light', borderRadius: 1, display: 'block', objectFit: 'contain', background: '#fff' }} />
        <Box sx={{ mt: 1 }}>
          <Button size="small" variant="outlined" onClick={handleResign}>다시 서명</Button>
        </Box>
      </Box>
    )
  }

  // ── 서명 입력 모드 ───────────────────────────────────────────────────
  return (
    <Box>
      {label && <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{label}</Typography>}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'inline-block', background: '#fff', touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />
      </Box>
      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
        <Button size="small" variant="outlined" color="inherit" onClick={handleClear}>지우기</Button>
        <Button size="small" variant="contained" onClick={handleSave}>서명 저장</Button>
      </Box>
    </Box>
  )
}
