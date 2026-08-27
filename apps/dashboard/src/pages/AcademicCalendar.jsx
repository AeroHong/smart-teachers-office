/**
 * 학사일정 — 월 그리드 + 다가오는 일정 목록.
 *
 * 홈 재구성(2026-08-25)으로 예전 홈 사이드바 한 조각이던 것을 독립 레일 자리로 옮겼다.
 * "일정은 등록·수정·월 단위 조망이 필요한 물건이라 자기 화면을 가질 자격이 있다"
 * (`PLAN_channels.md` "레일 구조 재편")는 판단을 그대로 따랐고, 그때 "나중 작업"으로
 * 미뤄뒀던 월 단위 캘린더 그리드를 이번에 채웠다(2026-08-27, 구글 캘린더 동기화와 함께
 * — CalendarGrid.jsx).
 *
 * 본문은 이제 "고른 일정 하나"가 아니라 늘 월 그리드다 — 항목을 고르면(사이드바든
 * 그리드 칸이든) Dialog로 EventDetail을 띄운다. WorkspaceLayout의 상세 자리는 "고른 것
 * 하나"를 위한 곳인데 그리드 자체가 그 자리를 통째로 차지해야 해서, 상세는 그 위에
 * 겹쳐 여는 편이 자연스럽다.
 */
import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import EventIcon from '@mui/icons-material/Event'
import Box from '@mui/material/Box'
import WorkspaceLayout from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import EventDetail from '../components/EventDetail'
import CalendarGrid from '../components/CalendarGrid'
import useAcademicCalendar, { upcomingEvents } from '../lib/useAcademicCalendar'

export default function AcademicCalendar() {
  const events = useAcademicCalendar()
  const upcoming = upcomingEvents(events)
  const [selected, setSelected] = useState(null)

  const sidebar = (
    <SidebarSection label="다가오는 일정" icon={EventIcon} count={upcoming.length} open onToggle={() => {}}>
      {upcoming.length === 0 ? <SidebarEmpty>예정된 일정이 없습니다</SidebarEmpty> : upcoming.map((e) => (
        <SidebarItem
          key={e.id}
          label={(
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
              {/* 구글 캘린더에서 온 일정 표시 — 작은 점 하나로 충분하다(사이드바 한 줄이라
                  아이콘·배지를 얹으면 제목이 밀린다). 상세를 열면 EventDetail의 "구글
                  캘린더" 칩으로 더 분명히 보인다. */}
              {e.source === 'googleCalendar' && (
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
              )}
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</Box>
            </Box>
          )}
          selected={selected?.id === e.id}
          onClick={() => setSelected(e)}
          chip={<MiniChip label={`${e._start.getMonth() + 1}/${e._start.getDate()}`} />}
        />
      ))}
    </SidebarSection>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      <CalendarGrid events={events} onSelectEvent={setSelected} />

      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="xs" fullWidth>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.5, pr: 0.5 }}>
          <IconButton size="small" onClick={() => setSelected(null)} aria-label="닫기">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {selected && <EventDetail event={selected} />}
      </Dialog>
    </WorkspaceLayout>
  )
}
