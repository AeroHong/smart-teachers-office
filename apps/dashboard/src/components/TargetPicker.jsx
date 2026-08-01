/**
 * 요청 대상 조건 빌더.
 *
 * 미리 만들어둔 그룹을 고르는 방식이 아니라 조건을 조합해 뽑는다. 학교 업무는 대상이
 * 매번 달라서("2학년 수업 들어가는 비담임", "부장교사", "국어과 중 담임") 고정 그룹으로는
 * 감당이 안 된다.
 *
 * 화면에서 가장 중요한 건 조건이 아니라 **결과 명단**이다. 대상이 틀리면 누군가 마감을
 * 놓치고 그 책임이 시스템으로 오기 때문에, 몇 명이 왜 걸렸는지 눈으로 확인하고 보내야 한다.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
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

/**
 * @param {boolean} [compact] 글쓰기 화면의 오른쪽 설정 칸(300px)처럼 좁은 자리용.
 *   직접 추가·제외를 두 칸으로 나란히 놓을 폭이 안 나와 세로로 쌓는다.
 */
export default function TargetPicker({ members, value, onChange, compact = false }) {
  const rule = value || EMPTY_RULE
  const [showNames, setShowNames] = useState(false)

  const facets = useMemo(() => collectFacets(members), [members])
  const result = useMemo(() => resolveTargets(rule, members), [rule, members])

  const patch = (next) => onChange({ ...rule, ...next })

  const setCondition = (index, next) => {
    const conditions = rule.conditions.map((c, i) => (i === index ? next : c))
    patch({ conditions })
  }

  const addCondition = () => patch({ conditions: [...rule.conditions, { type: 'office', values: [] }] })
  const removeCondition = (index) => patch({ conditions: rule.conditions.filter((_, i) => i !== index) })

  const byUid = useMemo(() => new Map(members.map(m => [m.uid, m])), [members])
  const pickMembers = (uids) => uids.map(uid => byUid.get(uid)).filter(Boolean)

  return (
    <Box>
      <Typography fontSize="0.85rem" fontWeight={700} mb={1}>대상</Typography>

      {rule.conditions.length === 0 && (
        <Typography color="text.secondary" fontSize="0.82rem" mb={1}>
          조건을 추가하지 않으면 전체 교직원이 대상입니다.
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, mb: 1.5 }}>
        {rule.conditions.map((condition, index) => (
          <ConditionRow
            key={index}
            condition={condition}
            facets={facets}
            onChange={(next) => setCondition(index, next)}
            onRemove={() => removeCondition(index)}
            compact={compact}
          />
        ))}
      </Box>

      <Button size="small" startIcon={<AddIcon />} onClick={addCondition} sx={{ mb: 2 }}>
        조건 추가
      </Button>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : { xs: '1fr', sm: '1fr 1fr' },
        gap: compact ? 1.2 : 2, mb: 2,
      }}>
        <Autocomplete
          multiple size="small" options={members}
          getOptionLabel={m => m.name}
          isOptionEqualToValue={(a, b) => a.uid === b.uid}
          value={pickMembers(rule.includeUids)}
          onChange={(_, next) => patch({ includeUids: next.map(m => m.uid) })}
          renderInput={params => <TextField {...params} label="직접 추가" placeholder="조건에 없는 사람" />}
        />
        <Autocomplete
          multiple size="small" options={members}
          getOptionLabel={m => m.name}
          isOptionEqualToValue={(a, b) => a.uid === b.uid}
          value={pickMembers(rule.excludeUids)}
          onChange={(_, next) => patch({ excludeUids: next.map(m => m.uid) })}
          renderInput={params => <TextField {...params} label="제외" placeholder="빼고 보낼 사람" />}
        />
      </Box>

      {/* 결과 확인 — 이 화면의 핵심. 숫자만 보고 보내지 않도록 이름을 펼쳐볼 수 있게 한다 */}
      <Box sx={{ p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography fontSize="0.9rem" fontWeight={700}>
            대상 {result.uids.length}명
          </Typography>
          <Chip size="small" label={describeRule(rule)} sx={{ fontWeight: 600 }} />
          <Box sx={{ flexGrow: 1 }} />
          {result.uids.length > 0 && (
            <Button size="small" onClick={() => setShowNames(v => !v)}>
              {showNames ? '명단 접기' : '명단 확인'}
            </Button>
          )}
        </Box>

        <Collapse in={showNames}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.2 }}>
            {result.members.map(m => (
              <Chip key={m.uid} size="small" variant="outlined" label={m.name} />
            ))}
          </Box>
        </Collapse>

        {result.warnings.map(w => (
          <Alert
            key={w}
            severity={w.includes('없습니다') || w.includes('없는') ? 'warning' : 'info'}
            sx={{ mt: 1.2, py: 0.2 }}
          >
            {w}
          </Alert>
        ))}
      </Box>
    </Box>
  )
}

function ConditionRow({ condition, facets, onChange, onRemove, compact }) {
  const isHomeroom = condition.type === 'homeroom'
  const options = optionsFor(condition.type, facets)

  return (
    <Box sx={{
      display: 'flex', gap: 1, alignItems: 'flex-start',
      flexWrap: compact ? 'wrap' : 'nowrap',
    }}>
      <FormControl size="small" sx={{ minWidth: 130, flexShrink: 0 }}>
        <InputLabel>조건</InputLabel>
        <Select
          label="조건"
          value={condition.type}
          onChange={e => {
            const type = e.target.value
            // 조건 종류를 바꾸면 이전 값은 의미가 없으므로 비운다
            onChange(type === 'homeroom' ? { type, is: true, grades: [] } : { type, values: [] })
          }}
        >
          {Object.entries(CONDITION_TYPES).map(([key, meta]) => (
            <MenuItem key={key} value={key}>{meta.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {isHomeroom ? (
        <>
          <FormControl size="small" sx={{ minWidth: 110, flexShrink: 0 }}>
            <InputLabel>담임</InputLabel>
            <Select
              label="담임"
              value={condition.is === false ? 'no' : 'yes'}
              onChange={e => onChange({ ...condition, is: e.target.value === 'yes', grades: [] })}
            >
              <MenuItem value="yes">담임</MenuItem>
              <MenuItem value="no">담임 아님</MenuItem>
            </Select>
          </FormControl>
          {condition.is !== false && (
            <Autocomplete
              multiple size="small" sx={{ flexGrow: 1, minWidth: 160 }}
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
          multiple size="small" sx={{ flexGrow: 1, minWidth: 160 }}
          options={options}
          getOptionLabel={v => (condition.type === 'teachingGrade' ? `${v}학년` : String(v))}
          value={condition.values || []}
          onChange={(_, next) => onChange({ ...condition, values: next })}
          renderInput={params => (
            <TextField {...params} placeholder={options.length === 0 ? '등록된 값이 없습니다' : '값 선택'} />
          )}
        />
      )}

      <IconButton size="small" onClick={onRemove} aria-label="조건 삭제" sx={{ mt: 0.4 }}>
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  )
}
