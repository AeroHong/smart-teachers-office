/**
 * 학사일정 — 1차 버전(목록+상세).
 *
 * 홈 재구성(2026-08-25)으로 예전 홈 사이드바 한 조각이던 것을 독립 레일 자리로 옮겼다.
 * "일정은 등록·수정·월 단위 조망이 필요한 물건이라 자기 화면을 가질 자격이 있다"
 * (`PLAN_channels.md` "레일 구조 재편")는 판단을 그대로 따르되, **월 단위 캘린더 그리드는
 * 아직 안 만들었다** — "나중 작업"으로 미뤄둔 것은 그 그리드뿐이고, 홈에서 빠지면서 갈 곳이
 * 없어지는 회귀를 막는 게 이번의 목적이다. 목록·상세 골격(EventDetail)은 이미 있던 것을
 * 그대로 옮겨 왔다.
 */
import { useState } from 'react'
import EventIcon from '@mui/icons-material/Event'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import EventDetail from '../components/EventDetail'
import useAcademicCalendar from '../lib/useAcademicCalendar'

export default function AcademicCalendar() {
  const events = useAcademicCalendar()
  const [selectedId, setSelectedId] = useState(null)
  const selected = events.find(e => e.id === selectedId) || null

  const sidebar = (
    <SidebarSection label="다가오는 일정" icon={EventIcon} count={events.length} open onToggle={() => {}}>
      {events.length === 0 ? <SidebarEmpty>예정된 일정이 없습니다</SidebarEmpty> : events.map((e) => {
        const isSelected = selectedId === e.id
        return (
          <SidebarItem
            key={e.id}
            label={e.title}
            selected={isSelected}
            onClick={() => setSelectedId(e.id)}
            chip={<MiniChip label={`${e._start.getMonth() + 1}/${e._start.getDate()}`} selected={isSelected} />}
          />
        )
      })}
    </SidebarSection>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {selected ? (
        <EventDetail event={selected} />
      ) : (
        <DetailPlaceholder emoji="🗓" message="왼쪽에서 일정을 선택하면 여기에 내용이 열립니다." />
      )}
    </WorkspaceLayout>
  )
}
