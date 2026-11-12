import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SendIcon from '@mui/icons-material/Send'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import { highlight, searchRegulations } from '@shared/lib/regulationSearch'
import { nodeHref } from './RegulationBody'

const EXAMPLES = ['벌점 15점이 넘으면 어떻게 되나요?', '교외체험학습은 며칠까지 되나요?', '학교운영위원회 위원 구성', '결석 처리 기준']

function Snippet({ text, terms }) {
  const t = text.length > 140 ? `${text.slice(0, 140)}…` : text
  return highlight(t, terms).map((h, i) => (h.hit ? <b key={i}>{h.text}</b> : h.text))
}

/** AI 답변의 [1] [2] 표시를 근거 조문 링크로 */
function AiAnswer({ answer, sources, base }) {
  const parts = String(answer || '').split(/(\[\d+\])/g)
  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/)
        const s = m && sources[Number(m[1]) - 1]
        return s ? <RouterLink key={i} to={nodeHref(base, s.r, s.n)} title={`${s.title} ${s.p}`}>{p}</RouterLink> : p
      })}
    </Typography>
  )
}

/**
 * 오른쪽 규정 찾기 도우미.
 * 1단계: 물음을 검색 색인에서 찾아 관련 조문을 링크로 보여 준다(AI 없음, 비용 없음).
 * 2단계: askAi가 있으면 「AI로 답 정리」 — 찾은 조문만 근거로 Claude가 답을 쓰고 [n]으로 근거를 단다.
 * @param {{ book, entries, base?, onClose?, askAi?: (q, sources) => Promise<{answer}> }} p
 */
export default function AssistantPanel({ book, entries, base = '', onClose, askAi }) {
  const [q, setQ] = useState('')
  const [msgs, setMsgs] = useState([])
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs])

  const ask = (question) => {
    const text = question.trim()
    if (!text) return
    setQ('')
    const { terms, results } = searchRegulations(entries || [], text, { regs: book?.regulations || [], limit: 6 })
    const sources = results.flatMap((r) => r.hits.slice(0, 2).map((h) => ({ ...h, r: r.r, a: r.a, title: r.title }))).slice(0, 8)
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'bot', terms, results, sources, question: text }])
  }

  const runAi = async (idx) => {
    const msg = msgs[idx]
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, aiLoading: true, aiError: null } : x)))
    try {
      const res = await askAi(msg.question, msg.sources)
      setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, aiLoading: false, ai: res.answer, sources: res.sources || x.sources } : x)))
    } catch (e) {
      setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, aiLoading: false, aiError: e.message || 'AI 답변을 받지 못했습니다.' } : x)))
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <AutoAwesomeIcon fontSize="small" color="primary" sx={{ mr: 1 }} />
        <Typography fontWeight={800} flex={1}>규정 찾기 도우미</Typography>
        {onClose && <IconButton size="small" onClick={onClose} aria-label="도우미 닫기"><CloseIcon fontSize="small" /></IconButton>}
      </Stack>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        {!msgs.length && (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">찾고 싶은 내용을 평소 말로 물어보세요. 관련 조문을 찾아 드립니다.</Typography>
            {EXAMPLES.map((e) => <Button key={e} size="small" variant="outlined" onClick={() => ask(e)} sx={{ justifyContent: 'flex-start', textAlign: 'left' }}>{e}</Button>)}
          </Stack>
        )}
        <Stack spacing={1.25}>
          {msgs.map((m, i) => (m.role === 'user' ? (
            <Paper key={i} sx={{ alignSelf: 'flex-end', px: 1.5, py: 1, bgcolor: 'primary.main', color: 'primary.contrastText', maxWidth: '85%' }}>
              <Typography variant="body2">{m.text}</Typography>
            </Paper>
          ) : (
            <Paper key={i} variant="outlined" sx={{ p: 1.25 }}>
              {!m.results.length ? (
                <Typography variant="body2" color="text.secondary">관련 조문을 찾지 못했습니다. 다른 낱말로 물어보세요(예: 「체험학습」, 「벌점」).</Typography>
              ) : (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">관련 조문 {m.results.length}곳</Typography>
                  {m.results.map((r) => (
                    <Box key={r.a} component={RouterLink} to={nodeHref(base, r.r, r.hits[0].n)} sx={{ display: 'block', textDecoration: 'none', color: 'inherit', p: 1, borderRadius: 1, bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}>
                      <Typography variant="caption" fontWeight={800} color="primary">{r.title} {r.hits[0].p}</Typography>
                      <Typography variant="body2"><Snippet text={r.hits[0].t} terms={m.terms} /></Typography>
                    </Box>
                  ))}
                  {askAi && !m.ai && (
                    <Button size="small" startIcon={m.aiLoading ? <CircularProgress size={14} /> : <AutoAwesomeIcon />} disabled={m.aiLoading} onClick={() => runAi(i)}>
                      AI로 답 정리하기
                    </Button>
                  )}
                  {m.aiError && <Typography variant="caption" color="error">{m.aiError}</Typography>}
                  {m.ai && (
                    <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 1 }}>
                      <Typography variant="caption" color="text.secondary">AI 답변 — 위 조문만 근거로 썼습니다. 판단은 원문으로 확인하세요.</Typography>
                      <AiAnswer answer={m.ai} sources={m.sources} base={base} />
                    </Box>
                  )}
                </Stack>
              )}
            </Paper>
          )))}
        </Stack>
        <div ref={endRef} />
      </Box>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); ask(q) }} sx={{ p: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
        <TextField
          size="small" fullWidth value={q} onChange={(e) => setQ(e.target.value)} placeholder={entries ? '예: 체험학습 신청 기한' : '색인을 불러오는 중…'} disabled={!entries}
          InputProps={{ endAdornment: <IconButton type="submit" size="small" disabled={!q.trim()} aria-label="묻기"><SendIcon fontSize="small" /></IconButton> }}
        />
      </Box>
    </Box>
  )
}
