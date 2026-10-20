// 요일별 시간표 일괄 선택 격자 (사용자 요청, 2026-10-21 — 조회~종례를 한 칸씩 추가하기 번거롭다).
// 칸 = 요일 × 시간표 칸(조회·1~7교시·종례). 칸을 누르면 그 하나, 요일 머리글은 그 요일 전체,
// 교시 머리글은 그 교시의 모든 요일, 왼쪽 위 칸은 전체를 켜고 끈다. 이미 있는 칸의 시간
// 설정은 그대로 두고, 새로 켠 칸만 시간 미설정으로 추가한다.
import { DAYS, PERIOD_OPTIONS, periodLabel } from './eventHelpers'

const WEEKDAYS = [1, 2, 3, 4, 5]

export const newSchedule = (dayOfWeek, period) =>
  ({ dayOfWeek, period, useTime: false, startTime: '09:00', endTime: '09:50' })

export const sortSchedules = (list) =>
  [...list].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period)

export default function ScheduleGrid({ schedules, onChange }) {
  // 주말이 이미 들어 있는 이벤트(예전 데이터)는 그 요일도 격자에 보여 준다
  const days = [...new Set([...WEEKDAYS, ...schedules.map(s => s.dayOfWeek)])]
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
  const has = (d, p) => schedules.some(s => s.dayOfWeek === d && s.period === p)

  // cells 전체가 이미 켜져 있으면 모두 끄고, 하나라도 꺼져 있으면 모두 켠다
  const toggleCells = (cells) => {
    const allOn = cells.every(([d, p]) => has(d, p))
    if (allOn) {
      onChange(schedules.filter(s => !cells.some(([d, p]) => s.dayOfWeek === d && s.period === p)))
    } else {
      const added = cells.filter(([d, p]) => !has(d, p)).map(([d, p]) => newSchedule(d, p))
      onChange(sortSchedules([...schedules, ...added]))
    }
  }

  const allCells = days.flatMap(d => PERIOD_OPTIONS.map(p => [d, p]))
  const count = schedules.length

  return (
    <div style={styles.wrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.corner}>
              <button type="button" onClick={() => toggleCells(allCells)} style={styles.headBtn}
                title="전체 선택/해제">전체</button>
            </th>
            {days.map(d => (
              <th key={d} style={styles.th}>
                <button type="button" onClick={() => toggleCells(PERIOD_OPTIONS.map(p => [d, p]))}
                  style={{ ...styles.headBtn, color: d === 0 ? '#d32f2f' : d === 6 ? '#1565c0' : '#333' }}
                  title={`${DAYS[d]}요일 전체 선택/해제`}>{DAYS[d]}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIOD_OPTIONS.map(p => (
            <tr key={p}>
              <th style={styles.rowHead}>
                <button type="button" onClick={() => toggleCells(days.map(d => [d, p]))} style={styles.headBtn}
                  title={`${periodLabel(p)} 모든 요일 선택/해제`}>{periodLabel(p)}</button>
              </th>
              {days.map(d => {
                const on = has(d, p)
                return (
                  <td key={d} style={styles.td}>
                    <button type="button" onClick={() => toggleCells([[d, p]])}
                      aria-pressed={on} aria-label={`${DAYS[d]}요일 ${periodLabel(p)}`}
                      style={{ ...styles.cell, ...(on ? styles.cellOn : {}) }}>
                      {on ? '✓' : ''}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={styles.footer}>
        <span>{count}칸 선택됨 · 요일·교시 이름을 누르면 줄 전체가 선택/해제됩니다</span>
        {count > 0 && (
          <button type="button" onClick={() => onChange([])} style={styles.clearBtn}>모두 해제</button>
        )}
      </div>
    </div>
  )
}

const styles = {
  wrap: { marginBottom: '0.75rem' },
  table: { borderCollapse: 'collapse', width: '100%', maxWidth: '480px', tableLayout: 'fixed' },
  corner: { width: '4.2rem', padding: '0.15rem' },
  th: { padding: '0.15rem' },
  rowHead: { padding: '0.15rem', textAlign: 'left' },
  td: { padding: '0.15rem', textAlign: 'center' },
  headBtn: { width: '100%', padding: '0.35rem 0.2rem', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' },
  cell: { width: '100%', height: '2rem', background: '#fff', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95rem', color: '#fff', fontWeight: 700 },
  cellOn: { background: '#1a73e8', borderColor: '#1a73e8' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', maxWidth: '480px', marginTop: '0.4rem', fontSize: '0.76rem', color: '#888' },
  clearBtn: { background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline' },
}
