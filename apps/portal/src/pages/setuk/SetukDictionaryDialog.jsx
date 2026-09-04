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
import Paper from '@mui/material/Paper'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { getDictionary, saveDictionary } from '@shared/lib/setukCheck'
import { loadDictionary, AUTHORITY_LABELS, SEVERITY_LABELS, NAMED_ENTITY_TYPES, AMBIGUITY_LABELS } from './setukUtils'

function blankEntity() {
  return { canonical: '', aliases: [], type: 'institution', ambiguity: 'medium', authority: 'official_2026', severity: 'WARNING', enabled: true }
}

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
  const [namedEntities, setNamedEntities] = useState([])
  const [meta, setMeta] = useState(null) // { version, updatedAt, updatedByName }
  // 정부 공개데이터로 받아온 대학명·공공기관명처럼 항목이 수백 개인 그룹은 펼쳐두면
  // 다이얼로그가 감당 안 될 만큼 길어진다 — 기본은 접어두고 개수만 보여준다.
  const [expandedGroups, setExpandedGroups] = useState({})
  const LARGE_GROUP_THRESHOLD = 30

  useEffect(() => {
    if (!open || !schoolId) return
    setLoading(true)
    getDictionary(schoolId)
      .then((custom) => {
        const loaded = loadDictionary(custom)
        setGroups(loaded.groups.map((g) => ({ ...g, items: [...g.items] })))
        setNamedEntities(loaded.namedEntities.map((e) => ({ ...e, aliases: [...(e.aliases || [])] })))
        setMeta(custom ? { version: custom.version || 0, updatedAt: custom.updatedAt, updatedByName: custom.updatedByName } : { version: 0 })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, schoolId])

  const updateGroup = (id, patch) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }

  const updateEntity = (i, patch) => {
    setNamedEntities((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  }
  const removeEntity = (i) => setNamedEntities((prev) => prev.filter((_, idx) => idx !== i))
  const addEntity = () => setNamedEntities((prev) => [...prev, blankEntity()])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const cleanedEntities = namedEntities.filter((e) => e.canonical.trim())
      await saveDictionary(schoolId, groups, cleanedEntities, uid, userName)
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
          학원·과외 등 고정된 표현만 잡아냅니다. 실제 특정 대학·기관·기업 이름은 맨 아래
          "상호명·기관명 사전"에 등록해야 잡아낼 수 있고, 등록하지 않은 이름도 "~대학교·~협회·~재단" 같은
          접미사 패턴이면 미등록 후보로 참고 표시됩니다(확정 판정 아님).
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
                  {group.type !== 'pair' && group.items.length > LARGE_GROUP_THRESHOLD && (
                    <Chip size="small" variant="outlined" label={`${group.items.length}개`} />
                  )}
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
                ) : group.items.length > LARGE_GROUP_THRESHOLD && !expandedGroups[group.id] ? (
                  <Button
                    size="small" sx={{ textTransform: 'none' }}
                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: true }))}
                  >
                    목록 펼치기 ({group.items.length}개)
                  </Button>
                ) : isAdmin ? (
                  <>
                    <Autocomplete
                      multiple freeSolo size="small"
                      options={[]}
                      value={group.items}
                      onChange={(_, value) => updateGroup(group.id, { items: value })}
                      renderInput={(params) => <TextField {...params} placeholder="입력 후 Enter로 추가" />}
                    />
                    {group.items.length > LARGE_GROUP_THRESHOLD && (
                      <Button
                        size="small" sx={{ textTransform: 'none', mt: 0.5 }}
                        onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: false }))}
                      >
                        목록 접기
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                      {group.items.length === 0
                        ? <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>등록된 항목이 없습니다.</Typography>
                        : group.items.map((phrase, i) => <Chip key={i} size="small" label={phrase} />)}
                    </Box>
                    {group.items.length > LARGE_GROUP_THRESHOLD && (
                      <Button
                        size="small" sx={{ textTransform: 'none', mt: 0.5 }}
                        onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: false }))}
                      >
                        목록 접기
                      </Button>
                    )}
                  </>
                )}

                {gi < groups.length - 1 && <Divider sx={{ mt: 2.5 }} />}
              </Box>
            ))}

            <Divider sx={{ mb: 2.5 }} />

            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>상호명·기관명 사전</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              특정 대학·기관·기업·브랜드·서비스명을 대표 명칭(canonical)과 별칭(별칭·영문 표기·약칭 등)으로
              등록해두면 문장에 등장할 때 표시합니다. 일반명사와 겹칠 수 있는 항목은 "모호성"을 낮음이 아닌
              값으로 두면, 금지 표현으로 등록해도 화면에는 주의 표현까지만 뜹니다. 자동으로 고치거나
              지우지 않으며, 최종 판단은 선생님이 합니다.
            </Typography>

            {namedEntities.map((entity, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.5, opacity: entity.enabled ? 1 : 0.6 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  <TextField
                    size="small" label="대표 명칭" value={entity.canonical} disabled={!isAdmin}
                    onChange={(e) => updateEntity(i, { canonical: e.target.value })}
                    sx={{ minWidth: 160 }}
                  />
                  {isAdmin ? (
                    <>
                      <FormControl size="small" sx={{ minWidth: 100 }}>
                        <Select value={entity.type} onChange={(e) => updateEntity(i, { type: e.target.value })}>
                          {Object.entries(NAMED_ENTITY_TYPES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <Select value={entity.ambiguity} onChange={(e) => updateEntity(i, { ambiguity: e.target.value })}>
                          {Object.entries(AMBIGUITY_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>모호성 {v}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ minWidth: 100 }}>
                        <Select value={entity.severity} onChange={(e) => updateEntity(i, { severity: e.target.value })}>
                          {Object.entries(SEVERITY_LABELS).filter(([k]) => k !== 'INFO').map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <FormControlLabel
                        sx={{ ml: 'auto', mr: 0 }}
                        control={<Switch size="small" checked={entity.enabled} onChange={(e) => updateEntity(i, { enabled: e.target.checked })} />}
                        label={<Typography sx={{ fontSize: '0.78rem' }}>{entity.enabled ? '사용' : '사용 안 함'}</Typography>}
                      />
                      <IconButton size="small" onClick={() => removeEntity(i)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <Chip size="small" variant="outlined" label={NAMED_ENTITY_TYPES[entity.type]} />
                      <Chip size="small" variant="outlined" label={`모호성 ${AMBIGUITY_LABELS[entity.ambiguity]}`} />
                      <Chip size="small" label={SEVERITY_LABELS[entity.severity]} />
                      {!entity.enabled && <Chip size="small" label="사용 안 함" />}
                    </>
                  )}
                </Box>
                {isAdmin ? (
                  <Autocomplete
                    multiple freeSolo size="small"
                    options={[]}
                    value={entity.aliases}
                    onChange={(_, value) => updateEntity(i, { aliases: value })}
                    renderInput={(params) => <TextField {...params} placeholder="별칭·영문 표기·약칭 등 입력 후 Enter" />}
                  />
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                    {entity.aliases.length === 0
                      ? <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>등록된 별칭이 없습니다.</Typography>
                      : entity.aliases.map((a, ai) => <Chip key={ai} size="small" label={a} />)}
                  </Box>
                )}
              </Paper>
            ))}
            {namedEntities.length === 0 && !isAdmin && (
              <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>등록된 항목이 없습니다.</Typography>
            )}
            {isAdmin && (
              <Button size="small" startIcon={<AddIcon />} onClick={addEntity} sx={{ mt: namedEntities.length ? 0 : 1 }}>
                고유명사 추가
              </Button>
            )}
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
