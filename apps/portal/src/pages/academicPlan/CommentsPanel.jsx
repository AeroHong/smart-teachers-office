import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import * as planRepo from './planRepo'

const fmt = (d) => (d ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '방금')

/**
 * 이 초안에 대한 의견 — 교직원 누구나 쓰고, 내 글만 고치고 지운다(다른 사람 글은 읽기만, 관리자는 지우기 가능).
 */
export default function CommentsPanel({ schoolId, planId, me, canAdmin, repo = planRepo, canWrite = true, placeholder = '이 학사일정에 대한 의견을 남겨 주세요 (Ctrl+Enter로 등록)', accent = '#0f766e' }) {
  // repo: 다른 모듈(업무분장)이 같은 모양의 함수 묶음을 넘긴다. canWrite false면 읽기만(공람이 끝난 확정본 등)
  const { addComment, deleteComment, subscribeComments, updateComment } = repo
  const [items, setItems] = useState(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(null) // { id, text }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    if (!schoolId || !planId) return undefined
    return subscribeComments(schoolId, planId, setItems, (e) => setError(e.message))
  }, [schoolId, planId])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [items?.length])

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try { await fn() } catch (e) { setError(`저장하지 못했습니다: ${e.message}`) } finally { setBusy(false) }
  }
  const submit = () => {
    const t = text.trim()
    if (!t) return
    run(async () => { await addComment(schoolId, planId, t.slice(0, 2000), me); setText('') })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>
        의견 <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>{items?.length || 0}</Box>
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {(items || []).map((c) => {
          const mine = c.by?.uid === me?.uid
          const isEditing = editing?.id === c.id
          return (
            <Box key={c.id} sx={{ border: '1px solid', borderColor: mine ? '#99f6e4' : '#e2e8f0', bgcolor: mine ? '#f0fdfa' : '#f8fafc', borderRadius: 1.5, px: 1, py: 0.6 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                <Typography variant="caption" sx={{ fontWeight: 800 }}>{c.by?.name || '알 수 없음'}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmt(c.createdAt)}{c.updatedAt ? ' · 고침' : ''}</Typography>
                <Box sx={{ flex: 1 }} />
                {mine && !isEditing && (
                  <Button size="small" sx={{ minWidth: 0, p: 0, fontSize: '0.72rem' }} onClick={() => setEditing({ id: c.id, text: c.text })}>고치기</Button>
                )}
                {(mine || canAdmin) && !isEditing && (
                  <Button size="small" color="error" sx={{ minWidth: 0, p: 0, ml: 0.5, fontSize: '0.72rem' }}
                    onClick={() => { if (window.confirm('이 의견을 지울까요?')) run(() => deleteComment(schoolId, planId, c.id)) }}>지우기</Button>
                )}
              </Box>
              {isEditing ? (
                <Box sx={{ mt: 0.5 }}>
                  <TextField size="small" fullWidth multiline minRows={2} autoFocus value={editing.text}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })} inputProps={{ maxLength: 2000 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 0.5 }}>
                    <Button size="small" onClick={() => setEditing(null)}>취소</Button>
                    <Button size="small" variant="contained" disableElevation disabled={busy || !editing.text.trim()}
                      onClick={() => run(async () => { await updateComment(schoolId, planId, c.id, editing.text.trim()); setEditing(null) })}>저장</Button>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mt: 0.25, fontSize: '0.82rem' }}>{c.text}</Typography>
              )}
            </Box>
          )
        })}
        <div ref={endRef} />
      </Box>
      {canWrite && (
        <>
          <TextField size="small" fullWidth multiline minRows={2} placeholder={placeholder}
            value={text} onChange={(e) => setText(e.target.value)} inputProps={{ maxLength: 2000 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" variant="contained" disableElevation onClick={submit} disabled={busy || !text.trim()} sx={{ bgcolor: accent }}>등록</Button>
          </Box>
        </>
      )}
      {error && <Typography variant="caption" sx={{ color: 'error.main' }}>{error}</Typography>}
    </Box>
  )
}
