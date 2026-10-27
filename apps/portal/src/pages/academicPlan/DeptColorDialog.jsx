import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import { DEPT_PALETTE } from './planUi'

/**
 * 관련 부서별 색 — 학년도 단위(academicPlanYears.deptColors). 같은 학년도의 모든 초안이 같은 색을 쓴다.
 * departments: 교직원 배정의 부서 + 일정에 적힌 부서
 */
export default function DeptColorDialog({ open, departments, value, onClose, onSave }) {
  const [colors, setColors] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setColors({ ...(value || {}) }) }, [open, value])

  const pick = (dept, key) => setColors((c) => {
    const next = { ...c }
    if (next[dept] === key) delete next[dept]
    else next[dept] = key
    return next
  })

  const save = async () => {
    setSaving(true)
    try { await onSave(colors) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>부서 색 지정</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          유형이 '일반'인 일정은 관련 부서 색으로 보입니다(개학·정기고사·휴업 등은 유형 색 유지). 같은 학년도 모든 초안에 적용됩니다. 고른 색을 다시 누르면 지워집니다.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {departments.map((dept) => {
            const cur = DEPT_PALETTE[colors[dept]]
            return (
              <Box key={dept} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 150, flexShrink: 0, px: 0.75, py: 0.25, borderRadius: '4px', fontSize: '0.82rem', fontWeight: 700,
                  bgcolor: cur?.bg || '#f1f5f9', color: cur?.fg || '#334155', border: `1px solid ${cur?.bd || '#cbd5e1'}`,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{dept}</Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {Object.entries(DEPT_PALETTE).map(([key, c]) => (
                    <Tooltip key={key} title={c.name}>
                      <Box component="button" type="button" onClick={() => pick(dept, key)}
                        sx={{
                          width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', p: 0, bgcolor: c.bg,
                          border: colors[dept] === key ? `3px solid ${c.fg}` : `2px solid ${c.bd}`,
                        }} />
                    </Tooltip>
                  ))}
                </Box>
              </Box>
            )
          })}
          {!departments.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>부서 목록이 없습니다.</Typography>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disableElevation onClick={save} disabled={saving}>저장</Button>
      </DialogActions>
    </Dialog>
  )
}
