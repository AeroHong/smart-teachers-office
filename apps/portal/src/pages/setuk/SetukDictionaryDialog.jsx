import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { getDictionary, saveDictionary } from '@shared/lib/setukCheck'
import { loadDictionary, AUTHORITY_LABELS, SEVERITY_LABELS } from './setukUtils'

function fmtDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * 점검 기준(오타·금지어·유의어 등) 보기/편집 다이얼로그.
 *
 * 기본 제공 항목을 포함한 모든 그룹이 완전히 편집 가능하다 — "고정 기본값 + 학교
 * 추가분" 모델이 아니라, 관리자가 저장한 groups가 곧 그 학교의 전체 규칙 상태가 된다
 * (setukUtils.js의 loadDictionary 참고). 저장하면 기본 제공 항목도 그대로 대체된다.
 *
 * 저장할 때마다 version이 1씩 올라간다(setukCheck.js의 saveDictionary) — 이미 끝난
 * 점검 건이 그 뒤에 바뀐 기준을 만나면 "다시 점검하라" 경고를 띄우는 데 쓰인다
 * (SetukCheckDetail.jsx). 그래서 이 화면에 버전·수정일을 눈에 보이게 표시해 둔다.
 */
export default function SetukDictionaryDialog({ open, onClose, schoolId, isAdmin, uid, userName }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState([])
  const [meta, setMeta] = useState(null) // { version, updatedAt, updatedByName }

  useEffect(() => {
    if (!open || !schoolId) return
    setLoading(true)
    getDictionary(schoolId)
      .then((custom) => {
        setGroups(loadDictionary(custom).groups.map((g) => ({ ...g, items: [...g.items] })))
        setMeta(custom ? { version: custom.version || 0, updatedAt: custom.updatedAt, updatedByName: custom.updatedByName } : { version: 0 })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, schoolId])

  const updateGroup = (id, patch) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await saveDictionary(schoolId, groups, uid, userName)
      const fresh = await getDictionary(schoolId)
      setMeta({ version: fresh?.version || 0, updatedAt: fresh?.updatedAt, updatedByName: fresh?.updatedByName })
    } catch (e) {
      setError(`저장 실패: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        점검 기준
        <Typography variant="caption" color="text.secondary" display="block">
          업로드한 세특 텍스트에서 아래 기준으로 점검합니다. 기본 제공 항목도{isAdmin ? ' 자유롭게 고치거나 지울 수 있습니다' : ''}.
          숨은 문자, 괄호 짝, 공백 이상, 존댓말체 종결, 학생 이름 반복, 외국어 표기(아래 허용 목록 제외), 반복 표현은
          목록이 아니라 정해진 규칙으로 자동 점검되어 이 화면에서 편집할 수 없습니다.
          "외국어 표기 허용 목록"에 등록한 단어는 외국어 표기 점검에서 제외됩니다. "사교육기관 관련 언급"은
          학원·과외 등 고정된 표현만 잡아낼 수 있고, 실제 기관 고유명사(특정 학원·대학교 이름 등)는
          자동으로 알아낼 수 없어 발견하는 대로 "학교 자체 추가 규칙"에 직접 등록해야 합니다.
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {!loading && meta && (
          <Chip
            size="small" variant="outlined"
            label={meta.updatedAt ? `버전 ${meta.version} · ${fmtDate(meta.updatedAt)} 수정${meta.updatedByName ? ` (${meta.updatedByName})` : ''}` : '버전 0 · 기본 제공 상태(아직 수정한 적 없음)'}
            sx={{ mb: 2 }}
          />
        )}
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress size={28} /></Box>
        ) : (
          <>
            {groups.map((group, gi) => (
              <Box key={group.id} sx={{ mb: 2.5, opacity: group.enabled ? 1 : 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700}>{group.title}</Typography>
                  {isAdmin ? (
                    <>
                      <FormControl size="small" sx={{ minWidth: 110 }}>
                        <Select value={group.authority} onChange={(e) => updateGroup(group.id, { authority: e.target.value })}>
                          {Object.entries(AUTHORITY_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ minWidth: 100 }}>
                        <Select value={group.severity} onChange={(e) => updateGroup(group.id, { severity: e.target.value })}>
                          {Object.entries(SEVERITY_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <FormControlLabel
                        sx={{ ml: 'auto', mr: 0 }}
                        control={<Switch size="small" checked={group.enabled} onChange={(e) => updateGroup(group.id, { enabled: e.target.checked })} />}
                        label={<Typography sx={{ fontSize: '0.78rem' }}>{group.enabled ? '사용' : '사용 안 함'}</Typography>}
                      />
                    </>
                  ) : (
                    <>
                      <Chip size="small" variant="outlined" label={AUTHORITY_LABELS[group.authority]} />
                      <Chip size="small" label={SEVERITY_LABELS[group.severity]} />
                      {!group.enabled && <Chip size="small" label="사용 안 함" />}
                    </>
                  )}
                </Box>

                {group.type === 'pair' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {group.items.map((pair, i) => (
                      <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <TextField
                          size="small" label="오타" sx={{ flex: 1 }} value={pair.wrong} disabled={!isAdmin}
                          onChange={(e) => {
                            const items = group.items.map((p, idx) => (idx === i ? { ...p, wrong: e.target.value } : p))
                            updateGroup(group.id, { items })
                          }}
                        />
                        <TextField
                          size="small" label="올바른 표현" sx={{ flex: 1 }} value={pair.right} disabled={!isAdmin}
                          onChange={(e) => {
                            const items = group.items.map((p, idx) => (idx === i ? { ...p, right: e.target.value } : p))
                            updateGroup(group.id, { items })
                          }}
                        />
                        {isAdmin && (
                          <IconButton size="small" onClick={() => updateGroup(group.id, { items: group.items.filter((_, idx) => idx !== i) })}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    ))}
                    {isAdmin && (
                      <Button
                        size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }}
                        onClick={() => updateGroup(group.id, { items: [...group.items, { wrong: '', right: '' }] })}
                      >
                        추가
                      </Button>
                    )}
                  </Box>
                ) : isAdmin ? (
                  <Autocomplete
                    multiple freeSolo size="small"
                    options={[]}
                    value={group.items}
                    onChange={(_, value) => updateGroup(group.id, { items: value })}
                    renderInput={(params) => <TextField {...params} placeholder="입력 후 Enter로 추가" />}
                  />
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                    {group.items.length === 0
                      ? <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>등록된 항목이 없습니다.</Typography>
                      : group.items.map((phrase, i) => <Chip key={i} size="small" label={phrase} />)}
                  </Box>
                )}

                {gi < groups.length - 1 && <Divider sx={{ mt: 2.5 }} />}
              </Box>
            ))}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
        {isAdmin && (
          <Button variant="contained" disabled={saving || loading} onClick={handleSave}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
