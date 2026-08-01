/**
 * 요청 대상 조건 빌더.
 *
 * 미리 만들어둔 그룹을 고르는 방식이 아니라 조건을 조합해 뽑는다. 학교 업무는 대상이
 * 매번 달라서("2학년 수업 들어가는 비담임", "부장단", "국어과 중 담임") 고정 그룹으로는
 * 감당이 안 된다.
 *
 * 글쓰기 화면 오른쪽 270px 칸에 들어간다. 그 폭에 맞춰 세 가지를 정했다.
 *
 *  1. 인원수를 맨 위에 크게 둔다. 조건을 만지는 내내 확인하는 값인데 아래에 묻어두면
 *     조건을 바꿀 때마다 시선이 위아래로 오간다.
 *  2. 개별 지정(추가·제외)과 명단은 접어둔다. 늘 쓰는 기능이 아닌데 펼쳐두면 빈 입력
 *     상자 두 개가 패널의 절반을 차지한다.
 *  3. 조건 하나를 한 상자에 담는다. 종류·값·삭제가 흩어져 있으면 어느 삭제 단추가
 *     어느 조건의 것인지 헷갈린다.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Autocomplete from '@mui/material/Autocomplete'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { CONDITION_TYPES, collectFacets, describeRule, resolveTargets } from '@shared/lib/targeting'

const EMPTY_RULE = { conditions: [], includeUids: [], excludeUids: [] }

/** 조건 종류별로 고를 수 있는 값 목록을 facets에서 꺼낸다. */
function optionsFor(type, facets) {
  switch (type) {
    case 'office': return facets.offices
    case 'department': return facets.departments
    case 'subject': return facets.subjects
    case 'position': return facets.positions
    case 'rank': return facets.ranks
    case 'teachingGrade': return facets.teachingGrades
    default: return []
  }
}

export default function TargetPicker({ members, value, onChange }) {
  const rule = value || EMPTY_RULE
  const [openManual, setOpenManual] = useState(false)
  const [openNames, setOpenNames] = useState(false)

  const facets = useMemo(() => collectFacets(members), [members])
  const result = useMemo(() => resolveTargets(rule, members), [rule, members])

  const patch = (next) => onChange({ ...rule, ...next })
  const setCondition = (i, next) => patch({ conditions: rule.conditions.map((c, j) => (j === i ? next : c)) })
  // 첫 조건은 직급으로 시작한다 — 부장단·관리자처럼 가장 자주 쓰는 갈래다
  const addCondition = () => patch({ conditions: [...rule.conditions, { type: 'rank', values: [] }] })
  const removeCondition = (i) => patch({ conditions: rule.conditions.filter((_, j) => j !== i) })

  const byUid = useMemo(() => new Map(members.map(m => [m.uid, m])), [members])
  const pickMembers = (uids) => uids.map(uid => byUid.get(uid)).filter(Boolean)
  const manualCount = rule.includeUids.length + rule.excludeUids.length
  const problems = result.warnings.filter(w => w.includes('없습니다') || w.includes('없는'))

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 1 }}>
        <Typography fontSize="0.85rem" fontWeight={700} sx={{ flexGrow: 1 }}>대상</Typography>
        <Typography
          fontSize="1.05rem" fontWeight={800}
          color={result.uids.length === 0 ? 'error.main' : 'primary.main'}
        >
          {result.uids.length}
        </Typography>
        <Typography fontSize="0.8rem" color="text.secondary">명</Typography>
      </Box>

      {/* 지금 무엇으로 뽑혔는지 한 줄로. 조건이 없으면 '전체 교직원'이 그 자리를 대신하므로
          따로 설명 문구를 두지 않는다. */}
      <Chip size="small" label={describeRule(rule)} sx={{ maxWidth: '100%', mb: 1.2, fontWeight: 600 }} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
        {rule.conditions.map((condition, i) => (
          <ConditionCard
            key={i}
            condition={condition}
            facets={facets}
            onChange={(next) => setCondition(i, next)}
            onRemove={() => removeCondition(i)}
          />
        ))}
      </Box>

      <Button size="small" startIcon={<AddIcon sx={{ fontSize: 17 }} />} onClick={addCondition} sx={{ mt: 0.6 }}>
        조건 추가
      </Button>

      {problems.map(w => (
        <Box key={w} sx={{ display: 'flex', gap: 0.6, alignItems: 'flex-start', mt: 0.8 }}>
          <WarningAmberIcon sx={{ fontSize: 15, color: 'warning.main', mt: '2px', flexShrink: 0 }} />
          <Typography fontSize="0.76rem" color="warning.main">{w}</Typography>
        </Box>
      ))}

      <Foldout
        label="개별 지정"
        badge={manualCount > 0 ? `${manualCount}명` : null}
        open={openManual}
        onToggle={() => setOpenManual(v => !v)}
      >
        <Autocomplete
          multiple size="small" options={members}
          getOptionLabel={m => m.name}
          isOptionEqualToValue={(a, b) => a.uid === b.uid}
          value={pickMembers(rule.includeUids)}
          onChange={(_, next) => patch({ includeUids: next.map(m => m.uid) })}
          renderInput={params => <TextField {...params} label="추가" placeholder="조건에 없는 사람" />}
          sx={{ mb: 1 }}
        />
        <Autocomplete
          multiple size="small" options={members}
          getOptionLabel={m => m.name}
          isOptionEqualToValue={(a, b) => a.uid === b.uid}
          value={pickMembers(rule.excludeUids)}
          onChange={(_, next) => patch({ excludeUids: next.map(m => m.uid) })}
          renderInput={params => <TextField {...params} label="제외" placeholder="빼고 보낼 사람" />}
        />
      </Foldout>

      {/* 숫자만 보고 보내지 않도록 이름을 확인할 수 있게 둔다 */}
      <Foldout
        label="명단 보기"
        open={openNames}
        onToggle={() => setOpenNames(v => !v)}
        disabled={result.uids.length === 0}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, maxHeight: 180, overflowY: 'auto' }}>
          {result.members.map(m => (
            <Chip key={m.uid} size="small" variant="outlined" label={m.name} sx={{ fontWeight: 500 }} />
          ))}
        </Box>
      </Foldout>
    </Box>
  )
}

/** 평소엔 접혀 있는 구역. 안에 든 것이 있으면 접힌 채로도 개수를 보여준다. */
function Foldout({ label, badge, open, onToggle, disabled, children }) {
  return (
    <Box sx={{ mt: 1, borderTop: '1px solid', borderColor: 'divider', pt: 0.7 }}>
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        disabled={disabled}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.3, width: '100%',
          border: 0, background: 'none', textAlign: 'left', px: 0, py: 0.2,
          cursor: disabled ? 'default' : 'pointer',
          color: disabled ? 'text.disabled' : 'text.secondary',
        }}
      >
        <ExpandMoreIcon sx={{
          fontSize: 16,
          transform: open ? 'none' : 'rotate(-90deg)',
          transition: 'transform .15s ease',
        }} />
        <Typography fontSize="0.78rem" fontWeight={700} sx={{ flexGrow: 1 }}>{label}</Typography>
        {badge && <Typography fontSize="0.75rem" color="primary.main" fontWeight={700}>{badge}</Typography>}
      </Box>
      <Collapse in={open && !disabled} unmountOnExit>
        <Box sx={{ pt: 1 }}>{children}</Box>
      </Collapse>
    </Box>
  )
}

/** 조건 한 개 — 종류와 값을 한 상자에 담고 삭제는 오른쪽 위에 둔다. */
function ConditionCard({ condition, facets, onChange, onRemove }) {
  const isHomeroom = condition.type === 'homeroom'
  const options = optionsFor(condition.type, facets)

  return (
    <Box sx={{
      border: '1px solid', borderColor: 'divider', borderRadius: 0.75,
      p: 0.8, bgcolor: 'background.paper',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.7 }}>
        <Select
          variant="standard"
          disableUnderline
          value={condition.type}
          onChange={e => {
            const type = e.target.value
            // 조건 종류를 바꾸면 이전 값은 의미가 없으므로 비운다
            onChange(type === 'homeroom' ? { type, is: true, grades: [] } : { type, values: [] })
          }}
          sx={{ flexGrow: 1, '& .MuiSelect-select': { fontSize: '0.8rem', fontWeight: 700, py: 0 } }}
        >
          {Object.entries(CONDITION_TYPES).map(([key, meta]) => (
            <MenuItem key={key} value={key} sx={{ fontSize: '0.85rem' }}>{meta.label}</MenuItem>
          ))}
        </Select>
        <IconButton size="small" onClick={onRemove} aria-label="조건 삭제" sx={{ p: 0.2 }}>
          <CloseIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>

      {isHomeroom ? (
        <>
          <Select
            size="small" fullWidth
            value={condition.is === false ? 'no' : 'yes'}
            onChange={e => onChange({ ...condition, is: e.target.value === 'yes', grades: [] })}
            sx={{ fontSize: '0.83rem', mb: condition.is === false ? 0 : 0.8 }}
          >
            <MenuItem value="yes" sx={{ fontSize: '0.85rem' }}>담임</MenuItem>
            <MenuItem value="no" sx={{ fontSize: '0.85rem' }}>담임 아님</MenuItem>
          </Select>
          {condition.is !== false && (
            <Autocomplete
              multiple size="small"
              options={facets.homeroomGrades}
              getOptionLabel={g => `${g}학년`}
              value={condition.grades || []}
              onChange={(_, next) => onChange({ ...condition, grades: next })}
              renderInput={params => <TextField {...params} placeholder="전 학년" />}
            />
          )}
        </>
      ) : (
        <Autocomplete
          multiple size="small"
          options={options}
          getOptionLabel={v => (condition.type === 'teachingGrade' ? `${v}학년` : String(v))}
          value={condition.values || []}
          onChange={(_, next) => onChange({ ...condition, values: next })}
          renderInput={params => (
            <TextField {...params} placeholder={options.length === 0 ? '등록된 값이 없습니다' : '값 선택'} />
          )}
        />
      )}
    </Box>
  )
}
