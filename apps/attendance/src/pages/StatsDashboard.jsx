import { useState, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useStatsData, computeStats } from '../hooks/useStatsData'
import Layout from '../components/Layout'

const TABS = ['결석 학생', '이벤트별', '사유 분포', '기간 추이']

const EVENT_TYPE_COLOR = {
  수업: '#1a73e8', 조회: '#43a047', 방과후: '#fb8c00', 행사: '#8e24aa', 기타: '#757575',
}

// 기간 프리셋
const PERIOD_PRESETS = [
  { label: '전체', value: 'all' },
  { label: '이번 달', value: 'month' },
  { label: '지난 달', value: 'prev_month' },
  { label: '최근 3개월', value: '3months' },
  { label: '직접 입력', value: 'custom' },
]

function getPeriodRange(preset) {
  const now = new Date()
  if (preset === 'all') return { start: null, end: null }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    return { start, end }
  }
  if (preset === 'prev_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    return { start, end }
  }
  if (preset === '3months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    return { start, end: null }
  }
  return { start: null, end: null }
}

export default function StatsDashboard() {
  const { schoolId, role, user } = useAuth()
  const { rawLogs, events, loading, error, refetch } = useStatsData(schoolId, role, user?.uid)

  const [tab, setTab] = useState(0)
  const [period, setPeriod] = useState('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // 날짜 범위 계산
  const { startDate, endDate } = useMemo(() => {
    if (period === 'custom') {
      return {
        startDate: customStart ? new Date(customStart) : null,
        endDate: customEnd ? new Date(customEnd + 'T23:59:59') : null,
      }
    }
    const { start, end } = getPeriodRange(period)
    return { startDate: start, endDate: end }
  }, [period, customStart, customEnd])

  // 필터 적용된 통계 집계
  const stats = useMemo(
    () => computeStats(rawLogs, events, startDate, endDate),
    [rawLogs, events, startDate, endDate]
  )

  const { summary, studentAbsences, eventStats, reasonStats, trendData } = stats
  const maxTrendCount = Math.max(...trendData.map(d => d.count), 1)

  const periodLabel = (() => {
    if (period === 'custom') {
      if (customStart && customEnd) return `${customStart} ~ ${customEnd}`
      if (customStart) return `${customStart} 이후`
      if (customEnd) return `${customEnd} 이전`
      return '전체'
    }
    return PERIOD_PRESETS.find(p => p.value === period)?.label || '전체'
  })()

  return (
    <Layout>
      <div style={styles.topRow}>
        <h2 style={styles.heading}>출결 통계</h2>
        <button onClick={refetch} style={styles.refreshBtn} disabled={loading}>
          {loading ? '로딩 중...' : '↺ 새로고침'}
        </button>
      </div>

      {error && <p style={{ color: '#d32f2f', marginBottom: '1rem' }}>오류: {error}</p>}

      {/* 조회 기간 필터 */}
      <div style={styles.periodBox}>
        <span style={styles.periodTitle}>조회 기간</span>
        <div style={styles.presetRow}>
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              style={{ ...styles.presetBtn, ...(period === p.value ? styles.presetBtnActive : {}) }}
            >{p.label}</button>
          ))}
        </div>
        {period === 'custom' && (
          <div style={styles.customRow}>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              style={styles.dateInput}
            />
            <span style={{ color: '#888' }}>~</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              style={styles.dateInput}
            />
          </div>
        )}
        <span style={styles.periodLabel}>📅 {periodLabel}</span>
      </div>

      {/* 요약 카드 */}
      <div style={styles.summaryRow}>
        <SummaryCard label="이벤트" value={summary.totalEvents} color="#555" />
        <SummaryCard label="총 기록" value={summary.totalLogs} color="#555" />
        <SummaryCard label="출석" value={summary.totalAttended} color="#2e7d32" />
        <SummaryCard label="결석" value={summary.totalAbsent} color="#c62828" />
        <SummaryCard label="결석률" value={`${summary.absentRate}%`} color="#c62828" highlight />
      </div>

      {/* 탭 */}
      <div style={styles.tabRow}>
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            style={{ ...styles.tabBtn, ...(tab === i ? styles.tabBtnActive : {}) }}
          >{t}</button>
        ))}
      </div>

      {loading && <p style={styles.center}>데이터 불러오는 중...</p>}

      {!loading && (
        <>
          {/* ── 탭 0: 결석 학생 ── */}
          {tab === 0 && (
            <section style={styles.section}>
              <p style={styles.sectionDesc}>결석 횟수가 많은 학생 순으로 표시됩니다.</p>
              {studentAbsences.length === 0
                ? <p style={styles.empty}>결석 기록이 없습니다.</p>
                : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          {['순위', '학생', '학년/반/번', '결석 횟수', '주요 사유'].map(h => (
                            <th key={h} style={styles.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {studentAbsences.map((s, i) => {
                          const reasons = s.absences.map(a => a.reason).filter(Boolean)
                          const topReason = reasons.length > 0
                            ? Object.entries(
                                reasons.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc }, {})
                              ).sort((a, b) => b[1] - a[1])[0][0]
                            : '-'
                          return (
                            <tr key={s.studentId} style={i < 3 ? styles.topAbsentRow : {}}>
                              <td style={styles.td}>
                                <span style={{ ...styles.rankBadge, backgroundColor: i === 0 ? '#ffcdd2' : i === 1 ? '#ffe0b2' : i === 2 ? '#fff9c4' : '#f5f5f5' }}>
                                  {i + 1}
                                </span>
                              </td>
                              <td style={{ ...styles.td, fontWeight: 600 }}>{s.studentName}</td>
                              <td style={styles.td}>{s.grade}학년 {s.class}반 {s.number}번</td>
                              <td style={{ ...styles.td, color: '#c62828', fontWeight: 700 }}>{s.absences.length}회</td>
                              <td style={{ ...styles.td, color: '#666', fontSize: '0.85rem' }}>{topReason}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </section>
          )}

          {/* ── 탭 1: 이벤트별 결석 ── */}
          {tab === 1 && (
            <section style={styles.section}>
              <p style={styles.sectionDesc}>결석 인원이 많은 이벤트 순으로 표시됩니다.</p>
              {eventStats.length === 0
                ? <p style={styles.empty}>해당 기간 이벤트가 없습니다.</p>
                : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          {['이벤트', '유형', '출석', '결석', '결석률', '비율'].map(h => (
                            <th key={h} style={styles.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {eventStats.map(ev => (
                          <tr key={ev.eventId}>
                            <td style={{ ...styles.td, fontWeight: 500 }}>{ev.eventName}</td>
                            <td style={styles.td}>
                              <span style={{ ...styles.typeBadge, backgroundColor: (EVENT_TYPE_COLOR[ev.eventType] || '#757575') + '22', color: EVENT_TYPE_COLOR[ev.eventType] || '#757575' }}>
                                {ev.eventType}
                              </span>
                            </td>
                            <td style={{ ...styles.td, color: '#2e7d32' }}>{ev.attended}명</td>
                            <td style={{ ...styles.td, color: ev.absent > 0 ? '#c62828' : '#999', fontWeight: ev.absent > 0 ? 700 : 400 }}>{ev.absent}명</td>
                            <td style={{ ...styles.td, color: ev.absentRate > 30 ? '#c62828' : '#555' }}>{ev.absentRate}%</td>
                            <td style={{ ...styles.td, minWidth: '120px' }}>
                              <div style={styles.barBg}>
                                <div style={{ ...styles.barFill, width: `${ev.absentRate}%`, backgroundColor: ev.absentRate > 30 ? '#ef5350' : '#ffb74d' }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </section>
          )}

          {/* ── 탭 2: 사유 분포 ── */}
          {tab === 2 && (
            <section style={styles.section}>
              <p style={styles.sectionDesc}>등록된 결석 사유별 건수입니다.</p>
              {reasonStats.length === 0
                ? <p style={styles.empty}>결석 사유 기록이 없습니다.</p>
                : (
                  <div style={styles.reasonList}>
                    {reasonStats.map(r => {
                      const pct = Math.round((r.count / reasonStats[0].count) * 100)
                      return (
                        <div key={r.reason} style={styles.reasonRow}>
                          <span style={styles.reasonLabel}>{r.reason}</span>
                          <div style={styles.reasonBarBg}>
                            <div style={{ ...styles.reasonBarFill, width: `${pct}%` }} />
                          </div>
                          <span style={styles.reasonCount}>{r.count}건</span>
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </section>
          )}

          {/* ── 탭 3: 기간 추이 ── */}
          {tab === 3 && (
            <section style={styles.section}>
              {trendData.length === 0
                ? <p style={styles.empty}>해당 기간 결석 기록이 없습니다.</p>
                : (
                  <div>
                    <div style={styles.trendChart}>
                      {trendData.map(d => (
                        <div key={d.date} style={styles.trendBar}>
                          <div style={styles.trendBarWrap}>
                            <div
                              style={{ ...styles.trendBarFill, height: `${Math.round((d.count / maxTrendCount) * 100)}%` }}
                              title={`${d.date}: ${d.count}명`}
                            />
                          </div>
                          <span style={styles.trendCount}>{d.count}</span>
                          <span style={styles.trendDate}>{d.date.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
                      <table style={styles.table}>
                        <thead>
                          <tr>{['날짜', '결석 인원'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {[...trendData].reverse().map(d => (
                            <tr key={d.date}>
                              <td style={styles.td}>{d.date}</td>
                              <td style={{ ...styles.td, color: '#c62828', fontWeight: 600 }}>{d.count}명</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              }
            </section>
          )}
        </>
      )}
    </Layout>
  )
}

function SummaryCard({ label, value, color, highlight }) {
  return (
    <div style={{ ...styles.summaryCard, ...(highlight ? styles.summaryCardHL : {}) }}>
      <span style={{ ...styles.summaryValue, color }}>{value}</span>
      <span style={styles.summaryLabel}>{label}</span>
    </div>
  )
}

const styles = {
  topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' },
  heading: { fontSize: '1.3rem', fontWeight: 700, margin: 0 },
  refreshBtn: { padding: '0.35rem 0.85rem', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '7px', cursor: 'pointer', fontSize: '0.85rem', color: '#555' },
  center: { textAlign: 'center', padding: '3rem', color: '#999' },

  // 기간 필터
  periodBox: { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '0.85rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' },
  periodTitle: { fontSize: '0.85rem', fontWeight: 600, color: '#555', whiteSpace: 'nowrap' },
  presetRow: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  presetBtn: { padding: '0.3rem 0.75rem', border: '1px solid #ddd', borderRadius: '999px', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: '#fff', color: '#555' },
  presetBtnActive: { backgroundColor: '#1a73e8', color: '#fff', borderColor: '#1a73e8' },
  customRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  dateInput: { padding: '0.3rem 0.5rem', border: '1px solid #ccc', borderRadius: '6px', fontSize: '0.85rem' },
  periodLabel: { fontSize: '0.82rem', color: '#1a73e8', fontWeight: 600, marginLeft: 'auto' },

  summaryRow: { display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' },
  summaryCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem 1.25rem', borderRadius: '10px', backgroundColor: '#f5f5f5', minWidth: '80px' },
  summaryCardHL: { backgroundColor: '#ffebee' },
  summaryValue: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 },
  summaryLabel: { fontSize: '0.75rem', color: '#777', marginTop: '0.2rem' },

  tabRow: { display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', borderBottom: '2px solid #eee' },
  tabBtn: { padding: '0.5rem 1rem', border: 'none', borderBottom: '2px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.9rem', color: '#777', marginBottom: '-2px' },
  tabBtnActive: { color: '#1a73e8', borderBottomColor: '#1a73e8', fontWeight: 600 },

  section: { backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #eee', padding: '1.25rem' },
  sectionDesc: { fontSize: '0.82rem', color: '#888', marginBottom: '1rem', marginTop: 0 },
  empty: { color: '#aaa', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: '#f5f5f5', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' },
  td: { padding: '0.55rem 0.75rem', borderBottom: '1px solid #f0f0f0' },
  topAbsentRow: { backgroundColor: '#fff8f8' },
  rankBadge: { display: 'inline-block', width: '24px', height: '24px', borderRadius: '50%', textAlign: 'center', lineHeight: '24px', fontSize: '0.8rem', fontWeight: 700 },
  typeBadge: { fontSize: '0.78rem', padding: '0.1rem 0.5rem', borderRadius: '999px', fontWeight: 600 },
  barBg: { height: '8px', backgroundColor: '#eee', borderRadius: '4px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '4px' },
  reasonList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  reasonRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  reasonLabel: { minWidth: '90px', fontSize: '0.88rem', fontWeight: 500, color: '#444' },
  reasonBarBg: { flex: 1, height: '20px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' },
  reasonBarFill: { height: '100%', backgroundColor: '#ef5350', borderRadius: '4px' },
  reasonCount: { minWidth: '40px', textAlign: 'right', fontSize: '0.85rem', color: '#c62828', fontWeight: 600 },
  trendChart: { display: 'flex', alignItems: 'flex-end', gap: '4px', height: '140px', padding: '0.5rem 0' },
  trendBar: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '24px', gap: '2px' },
  trendBarWrap: { flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' },
  trendBarFill: { width: '100%', backgroundColor: '#ef5350', borderRadius: '3px 3px 0 0', minHeight: '2px' },
  trendCount: { fontSize: '0.7rem', color: '#c62828', fontWeight: 600 },
  trendDate: { fontSize: '0.65rem', color: '#999', transform: 'rotate(-45deg)', whiteSpace: 'nowrap', marginTop: '2px' },
}
