// 업무분장 오른쪽 패널 입력칸 — MUI 기본 테두리 상자(라벨이 테두리에 걸린 모양) 대신,
// 위쪽 작은 라벨 + 옅은 바탕 칸 + 포커스 때만 주황 테두리. 예시 글자(placeholder)는 본문보다 작고 옅게.
import Box from '@mui/material/Box'
import InputBase from '@mui/material/InputBase'
import Select from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import { ACCENT } from './dutyUi'

const PLACEHOLDER = { fontSize: '0.74rem', color: '#a3afbf', opacity: 1, fontWeight: 400 }

/** InputBase 바탕 칸 */
export const inputSx = {
  width: '100%', fontSize: '0.86rem', bgcolor: '#f6f8fb', border: '1px solid transparent', borderRadius: '8px',
  px: 1.25, py: 0.7, transition: 'background-color .12s, border-color .12s, box-shadow .12s',
  '&:hover': { bgcolor: '#eef2f7' },
  '&.Mui-focused': { bgcolor: '#fff', borderColor: ACCENT, boxShadow: `0 0 0 3px ${ACCENT}1a` },
  '& input::placeholder, & textarea::placeholder': PLACEHOLDER,
  '& .MuiSelect-select': { py: 0, minHeight: 'unset' },
}

/** Autocomplete·TextField(outlined)를 같은 모양으로 — renderInput의 TextField에 sx로 */
export const outlinedSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: '#f6f8fb', borderRadius: '8px', fontSize: '0.86rem', py: '2px !important',
    '& fieldset': { borderColor: 'transparent' },
    '&:hover': { bgcolor: '#eef2f7' },
    '&:hover fieldset': { borderColor: 'transparent' },
    '&.Mui-focused': { bgcolor: '#fff', boxShadow: `0 0 0 3px ${ACCENT}1a` },
    '&.Mui-focused fieldset': { borderColor: ACCENT, borderWidth: 1 },
  },
  '& input::placeholder': PLACEHOLDER,
}

/** 칸 위 작은 라벨 */
export function FieldLabel({ children, hint }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 0.4 }}>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.02em' }}>{children}</Typography>
      {hint && <Typography sx={{ fontSize: '0.66rem', color: '#a3afbf' }}>{hint}</Typography>}
    </Box>
  )
}

/** 라벨 + 입력칸 */
export function Field({ label, hint, sx, inputSx: extra, ...props }) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      {label && <FieldLabel hint={hint}>{label}</FieldLabel>}
      <InputBase {...props} sx={{ ...inputSx, ...extra }} />
    </Box>
  )
}

/** 라벨 + 고르기 */
export function SelectField({ label, hint, sx, value, onChange, children }) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      {label && <FieldLabel hint={hint}>{label}</FieldLabel>}
      <Select value={value} onChange={onChange} input={<InputBase sx={inputSx} />}
        MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.85rem' } } } }}>
        {children}
      </Select>
    </Box>
  )
}

/** 구역 머리 — 얇은 줄과 함께 */
export function SectionTitle({ children, right }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: ACCENT, whiteSpace: 'nowrap' }}>{children}</Typography>
      <Box sx={{ flex: 1, height: '1px', bgcolor: '#eef2f6' }} />
      {right}
    </Box>
  )
}
