import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { functions } from '@shared/lib/firebase'

const label = (s) => `${s.schoolName}${s.office ? ` · ${s.office}` : ''}`

/**
 * 새 초안 창의 '나이스에서 가져오기' 칸 — 나이스 학교 고르기 + 가져올 학년도.
 * value: { school: {atptCode, schoolCode, schoolName} | null, year }
 */
export default function NeisImportFields({ schoolId, year, value, onChange }) {
  const [candidates, setCandidates] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const search = async (q) => {
    setBusy(true)
    setErr('')
    try {
      const { data } = await httpsCallable(functions, 'neisSchedule')({ schoolId, action: 'school', query: q || undefined })
      const list = data.saved && !q ? [data.saved, ...data.candidates.filter((c) => c.schoolCode !== data.saved.schoolCode)] : data.candidates
      setCandidates(list)
      // 학교에 저장된 나이스 학교, 없으면 후보가 하나일 때 그것을 고른다
      if (!value.school && (data.saved || list.length === 1)) onChange({ ...value, school: data.saved || list[0] })
      if (!list.length) setErr('나이스에서 학교를 찾지 못했습니다. 학교 이름으로 다시 찾아보세요.')
    } catch (e) {
      setErr(`나이스에 연결하지 못했습니다: ${e.message}`)
    } finally { setBusy(false) }
  }
  useEffect(() => { search('') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, ml: 4 }}>
      {busy && !candidates ? <CircularProgress size={20} /> : (
        <TextField select size="small" label="나이스 학교" value={value.school?.schoolCode || ''}
          onChange={(e) => onChange({ ...value, school: candidates.find((c) => c.schoolCode === e.target.value) })}>
          {(candidates || []).map((c) => <MenuItem key={c.schoolCode} value={c.schoolCode}>{label(c)}</MenuItem>)}
        </TextField>
      )}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField size="small" placeholder="다른 학교 이름으로 찾기" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) search(query.trim()) }} sx={{ flex: 1 }} />
        <Button size="small" onClick={() => search(query.trim())} disabled={busy || !query.trim()}>찾기</Button>
      </Box>
      <TextField select size="small" label="가져올 학년도" value={value.year} onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}>
        <MenuItem value={year}>{year}학년도 — 날짜 그대로 표에 넣기</MenuItem>
        <MenuItem value={year - 1}>{year - 1}학년도 — 일정 카드로 넣고 날짜는 새로 정하기</MenuItem>
      </TextField>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        나이스에 입력된 학사일정을 가져옵니다. 자율·동아리 시수와 부서는 나이스에 없어서 비어 있고,
        수학여행·체육대회 같은 행사는 전일행사로 넣으니 가져온 뒤 확인해 주세요.
      </Typography>
      {err && <Typography variant="caption" sx={{ color: 'error.main' }}>{err}</Typography>}
    </Box>
  )
}
