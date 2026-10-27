import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import AddIcon from '@mui/icons-material/Add'
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined'
import MoveDownIcon from '@mui/icons-material/MoveDown'
import HistoryEduIcon from '@mui/icons-material/HistoryEdu'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { eventDisplayTitle, isTrayEvent, shortLabel } from '@shared/lib/academicPlan'
import { DEPT_PALETTE, eventStyle } from './planUi'
import { ActivityBadges, DRAG_TYPE, dragPayload, gradeSuffix, readDrag } from './PlanGrid'

/**
 * 편집 화면 오른쪽 — 일정 카드 보관함 + 부서 색 범례.
 * 날짜 없는 일정(date '')을 카드로 미리 만들어 두고, 격자의 날짜 칸으로 끌어 놓으면 그날로 정해진다.
 * 격자의 일정을 여기로 끌어 놓으면 날짜를 비우고 보관함으로 돌아온다(기간 일정은 일수를 기억).
 */
export default function TrayPanel({
  events, canEdit, deptColors, semester, prevYear, loadingPrev,
  onAdd, onEdit, onUnschedule, onUnscheduleAll, onEditColors, onCardDrag, onLoadPrev,
}) {
  const [over, setOver] = useState(false)
  const [allAnchor, setAllAnchor] = useState(null)
  const cards = (events || []).filter(isTrayEvent)
  const legend = Object.entries(deptColors || {}).filter(([, key]) => DEPT_PALETTE[key])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', flex: 1 }}>일정 카드 <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>{cards.length}</Box></Typography>
          {canEdit && <Button size="small" startIcon={<AddIcon />} onClick={onAdd} sx={{ py: 0 }}>새 카드</Button>}
        </Box>
        {canEdit && (
          <>
            <Button size="small" fullWidth startIcon={<HistoryEduIcon />} onClick={onLoadPrev} disabled={loadingPrev}
              sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>
              {prevYear}학년도 일정·부서 색 불러오기
            </Button>
            <Button size="small" fullWidth startIcon={<MoveDownIcon />} onClick={(e) => setAllAnchor(e.currentTarget)}
              sx={{ mb: 0.75, justifyContent: 'flex-start', color: 'text.secondary' }}>
              표의 일정을 한꺼번에 카드로
            </Button>
            <Menu anchorEl={allAnchor} open={Boolean(allAnchor)} onClose={() => setAllAnchor(null)}>
              {semester && <MenuItem onClick={() => { setAllAnchor(null); onUnscheduleAll(semester) }}>{semester}학기 일정만</MenuItem>}
              <MenuItem onClick={() => { setAllAnchor(null); onUnscheduleAll(null) }}>학년도 전체 일정</MenuItem>
            </Menu>
          </>
        )}
        <Box
          onDragOver={canEdit ? (e) => { e.preventDefault(); setOver(true) } : undefined}
          onDragLeave={canEdit ? () => setOver(false) : undefined}
          onDrop={canEdit ? (e) => { e.preventDefault(); setOver(false); const d = readDrag(e); if (d?.id) onUnschedule(d.id) } : undefined}
          sx={{
            minHeight: 120, p: 0.75, borderRadius: 1.5, display: 'flex', flexDirection: 'column', gap: 0.6,
            border: `2px dashed ${over ? '#14b8a6' : '#cbd5e1'}`, bgcolor: over ? '#f0fdfa' : '#f8fafc',
          }}>
          {cards.map((ev) => {
            const ks = eventStyle(ev, deptColors)
            return (
              <Tooltip key={ev.id} placement="left" arrow
                title={`${eventDisplayTitle(ev)}${ev.spanDays > 1 ? ` · ${ev.spanDays}일간` : ''}${ev.dept ? ` · ${ev.dept}` : ''}${ev.note ? ` · ${ev.note}` : ''}`}>
                <Box draggable={canEdit}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(DRAG_TYPE, dragPayload(ev.id)); onCardDrag?.(ev) }}
                  onDragEnd={() => onCardDrag?.(null)}
                  onClick={() => onEdit(ev)}
                  sx={{
                    bgcolor: ks.bg, color: ks.fg, border: `1px solid ${ks.bd}`, borderLeft: `4px solid ${ks.bd}`, borderRadius: '6px',
                    px: 0.75, py: 0.5, fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.4, cursor: canEdit ? 'grab' : 'pointer',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.08)', wordBreak: 'keep-all', overflowWrap: 'anywhere',
                  }}>
                  <ActivityBadges activities={ev.activities} />
                  {`${ev.title || ''}${gradeSuffix(ev.grades)}`}
                  {(ev.spanDays > 1 || ev.dept || ev.prevDate) && (
                    <Box sx={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.8 }}>
                      {[ev.prevDate && `작년 ${shortLabel(ev.prevDate)}`, ev.spanDays > 1 && `${ev.spanDays}일간`, ev.dept].filter(Boolean).join(' · ')}
                    </Box>
                  )}
                </Box>
              </Tooltip>
            )
          })}
          <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', py: 0.5, lineHeight: 1.5 }}>
            {canEdit
              ? cards.length
                ? '카드를 날짜 칸으로 끌어 놓으면 그날로 정해집니다. 표의 일정을 여기로 끌어 오면 날짜를 비웁니다.'
                : '날짜를 아직 못 정한 일정을 카드로 만들어 두세요. 표의 일정을 여기로 끌어 와도 됩니다.'
              : '날짜를 정하지 않은 일정이 없습니다.'}
          </Typography>
        </Box>
      </Box>

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', flex: 1 }}>부서 색</Typography>
          {canEdit && <Button size="small" startIcon={<PaletteOutlinedIcon />} onClick={onEditColors} sx={{ py: 0 }}>지정</Button>}
        </Box>
        {legend.length ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {legend.map(([dept, key]) => {
              const c = DEPT_PALETTE[key]
              return (
                <Box key={dept} sx={{ bgcolor: c.bg, color: c.fg, border: `1px solid ${c.bd}`, borderRadius: '4px', px: 0.6, fontSize: '0.72rem', fontWeight: 700 }}>
                  {dept}
                </Box>
              )
            })}
          </Box>
        ) : (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            관련 부서마다 색을 정하면 일반 일정이 그 색으로 보입니다.
          </Typography>
        )}
      </Box>
    </Box>
  )
}
