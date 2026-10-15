import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import JSZip from 'jszip'
import Layout from '../../components/Layout'
import { redactNeisStamp } from '../../lib/pdfStampRedact'

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const todayStamp = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export default function PdfStampRemover() {
  // { id, name, status: 'processing'|'done'|'notfound'|'error', bytes?, removed?, pageCount?, message? }
  const [items, setItems] = useState([])
  const [dragOver, setDragOver] = useState(false)

  const processing = items.some((it) => it.status === 'processing')
  const ready = items.filter((it) => it.bytes)

  const update = (id, patch) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))

  const handleFiles = async (fileList) => {
    const files = [...fileList].filter((f) => /\.pdf$/i.test(f.name))
    if (!files.length) return
    const added = files.map((f, i) => ({ id: `${Date.now()}-${i}-${f.name}`, name: f.name, file: f, status: 'processing' }))
    setItems((prev) => [...prev, ...added])
    for (const it of added) {
      try {
        const { bytes, removed, pageCount } = await redactNeisStamp(await it.file.arrayBuffer())
        update(it.id, { status: removed.length ? 'done' : 'notfound', bytes, removed, pageCount, file: null })
      } catch (err) {
        console.error('[PdfStampRemover]', it.name, err)
        const message = /encrypt/i.test(String(err?.message))
          ? '암호가 걸린 PDF는 처리할 수 없습니다.'
          : 'PDF를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해주세요.'
        update(it.id, { status: 'error', message, file: null })
      }
    }
  }

  const blobOf = (it) => new Blob([it.bytes], { type: 'application/pdf' })

  const handleDownloadAll = async () => {
    if (ready.length === 1) return downloadBlob(blobOf(ready[0]), ready[0].name)
    const zip = new JSZip()
    const used = new Set()
    for (const it of ready) {
      let name = it.name
      for (let k = 2; used.has(name); k++) name = it.name.replace(/(\.pdf)$/i, `(${k})$1`)
      used.add(name)
      zip.file(name, it.bytes)
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `개인정보제거_PDF_${todayStamp()}.zip`)
  }

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        PDF 출력자 정보 지우기 🧽
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={1}>
        나이스에서 출력한 PDF 오른쪽 아래의 출력자 표시(학교/출력일시/IP/이름)를 자동으로 찾아 지웁니다.
        홈페이지 게시용 파일을 만들 때 사용하세요.
      </Typography>
      <Alert severity="info" sx={{ mb: 3, fontSize: '0.82rem' }}>
        파일은 서버로 전송되지 않고 이 브라우저 안에서만 처리됩니다. 덮어 가리는 방식이 아니라 글자 자체를 삭제하므로
        복사·검색해도 이름이 나오지 않습니다. 단, 본문 안에 들어 있는 다른 개인정보는 지우지 않으니 게시 전 한 번 확인해주세요.
      </Alert>

      <Paper
        variant="outlined"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        sx={{
          p: 5, mb: 3, borderRadius: '12px', textAlign: 'center',
          borderStyle: 'dashed', borderWidth: 2, borderColor: dragOver ? 'primary.main' : 'divider',
          bgcolor: dragOver ? 'action.hover' : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        <Typography fontWeight={700} mb={0.5}>PDF 파일을 여기로 끌어다 놓으세요</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>여러 개를 한꺼번에 올릴 수 있습니다.</Typography>
        <Button variant="outlined" component="label">
          PDF 파일 선택
          <input type="file" accept=".pdf,application/pdf" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
        </Button>
      </Paper>

      {items.length > 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
              처리 결과 ({ready.length}/{items.length})
            </Typography>
            <Button size="small" disabled={processing} onClick={() => setItems([])}>목록 비우기</Button>
            <Button variant="contained" disabled={processing || !ready.length} onClick={handleDownloadAll}>
              {ready.length > 1 ? `전체 다운로드 (zip, ${ready.length}개)` : '다운로드'}
            </Button>
          </Box>

          {items.map((it) => (
            <Box key={it.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, py: 1.2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ width: 20, pt: 0.3, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                {it.status === 'processing' && <CircularProgress size={16} />}
                {it.status === 'done' && <CheckCircleIcon fontSize="small" color="success" />}
                {it.status === 'notfound' && <WarningAmberIcon fontSize="small" color="warning" />}
                {it.status === 'error' && <ErrorOutlineIcon fontSize="small" color="error" />}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }} noWrap title={it.name}>{it.name}</Typography>
                {it.status === 'done' && (
                  <Box sx={{ mt: 0.5 }}>
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mb: 0.5 }}>
                      {it.pageCount}쪽 중 {new Set(it.removed.map((r) => r.page)).size}쪽에서 {it.removed.length}건 삭제
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {[...new Set(it.removed.map((r) => r.text))].map((t) => (
                        <Chip key={t} size="small" label={t} sx={{ textDecoration: 'line-through', fontSize: '0.72rem' }} />
                      ))}
                    </Box>
                  </Box>
                )}
                {it.status === 'notfound' && (
                  <Typography sx={{ fontSize: '0.78rem', color: 'warning.dark', mt: 0.5 }}>
                    출력자 표시를 찾지 못했습니다. 원본 그대로이니 직접 확인해주세요.
                  </Typography>
                )}
                {it.status === 'error' && (
                  <Typography sx={{ fontSize: '0.78rem', color: 'error.main', mt: 0.5 }}>{it.message}</Typography>
                )}
              </Box>
              {it.bytes && (
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  <Button size="small" onClick={() => window.open(URL.createObjectURL(blobOf(it)), '_blank')}>미리보기</Button>
                  <Button size="small" onClick={() => downloadBlob(blobOf(it), it.name)}>저장</Button>
                </Box>
              )}
            </Box>
          ))}
        </Paper>
      )}
    </Layout>
  )
}
