import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { meetingReport } from '@shared/lib/sectioning'
import { blockColor } from './colors'

const MODE = { hard: '꼭 지킴', soft: '가능하면', off: '참고만' }
const line = '1px solid #c9d3de'
const thick = '2px solid #8a99a8'

/**
 * 회의 자료 인쇄(A4 가로) — body에 인쇄 전용 상자를 그리고 바로 인쇄 창을 연다. 인쇄 창에서 「PDF로 저장」.
 * 1쪽: 요약 + 배정표 격자(그룹 × 과목) / 2쪽: 과목별·그룹별 요약. 분리 규칙은 개수만 싣는다.
 */
export default function MeetingPrint({ project, onDone }) {
  const r = useMemo(() => meetingReport(project), [project])

  useEffect(() => {
    const done = () => onDone?.()
    window.addEventListener('afterprint', done)
    const prevTitle = document.title
    document.title = `${r.title}_회의자료`   // PDF로 저장할 때 기본 파일명
    const id = setTimeout(() => window.print(), 300)
    return () => {
      clearTimeout(id)
      window.removeEventListener('afterprint', done)
      document.title = prevTitle
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const blocks = r.blocks.map((b) => b.block)
  const n = r.cols.length
  const fs = n > 16 ? 8.5 : n > 12 ? 9.5 : 10.5
  const st = r.status
  const sepRight = (i) => (r.cols[i + 1]?.block !== r.cols[i].block ? thick : line)
  const cellBox = (items, c) => items.map((x) => (
    <div key={x.k} style={{ margin: '1px 0', padding: '1px 2px', borderRadius: 3, background: c.bg, border: `1px solid ${c.border}`, textAlign: 'center' }}>
      <span style={{ color: c.fg, fontWeight: 700 }}>{x.label}</span> <b>{x.size}</b>
    </div>
  ))

  const statusItems = [
    `학생 ${st.students}명${st.excluded ? ` (제외 ${st.excluded}명)` : ''}`,
    `과목 ${st.subjects}개 · 분반 ${st.sections}개 · 그룹 ${st.groups}`,
    `분반 최대 ${st.maxSize ?? '-'}명(${MODE[st.maxMode] || '-'})${st.minSize ? ` · 최소 ${st.minSize}명(${MODE[st.minMode] || '-'})` : ''}`,
    r.showFree && `공강 ${st.totalFree}개${st.freeMax !== null ? ` · 그룹당 최대 ${st.freeMax}명` : ''}`,
    `미배정 ${st.unassigned}명`,
    st.conflicts && `시간 충돌 ${st.conflicts}명`,
    `분반 편차 최대 ${st.worstSpread}명`,
    st.separationRules && `분리 규칙 ${st.separationRules}개${st.separationViolations ? ` (위반 ${st.separationViolations}곳)` : ' (모두 지켜짐)'}`,
    st.sizeIssues && `인원 조건 밖 ${st.sizeIssues}반`,
    st.freeOver && `공강 초과 ${st.freeOver}그룹`,
  ].filter(Boolean)

  const th = { border: line, padding: '2px 3px', background: '#f3f6f9', fontWeight: 700 }
  const td = { border: line, padding: '2px 4px' }

  return createPortal(
    <div className="print-only" style={{ fontSize: fs, color: '#1f2933', fontFamily: 'Pretendard, sans-serif' }}>
      {/* 1쪽: 배정표 */}
      <div className="pr-page">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{r.title}</div>
          <div style={{ fontSize: 11, color: '#5b6b7c' }}>{r.term} · {r.date} 기준</div>
        </div>
        <div style={{ fontSize: 10, marginBottom: 6, color: '#334' }}>{statusItems.join('  ·  ')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '6.5%' }} />
            {r.cols.map((c) => <col key={c.s} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, borderRight: thick }} rowSpan={3}>그룹</th>
              {r.blocks.map((b) => {
                const c = blockColor(b.block, blocks)
                return <th key={b.block} colSpan={b.span} style={{ ...th, background: c.bg, color: c.fg, borderRight: thick }}>칸막이 {b.block}</th>
              })}
            </tr>
            <tr>
              {r.cols.map((c, i) => (
                <th key={c.s} style={{ ...th, background: '#fafbfc', color: blockColor(c.block, blocks).fg, borderRight: sepRight(i), wordBreak: 'keep-all' }}>{c.name}</th>
              ))}
            </tr>
            <tr>
              {r.cols.map((c, i) => (
                <th key={c.s} style={{ ...th, background: '#fafbfc', fontWeight: 500, borderRight: sepRight(i), borderBottom: thick, fontSize: fs - 1 }}>
                  신청 <b>{c.demand}</b> · {c.sections}반<br />평균 {c.avg ?? '-'}{c.sections > 1 ? ` · 편차 ${c.spread}` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.groups.map((g) => (
              <tr key={g.t} style={{ breakInside: 'avoid' }}>
                <td style={{ ...td, borderRight: thick, background: '#f3f6f9', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: fs + 6, fontWeight: 800, color: '#14532d' }}>{g.letter}</div>
                  <div>분반 {g.sections}개</div>
                  {g.sections > 0 && <div>{g.min}~{g.max}명</div>}
                  {g.free !== null && <div style={{ fontWeight: 700, color: '#7c5a00' }}>공강 {g.free}명</div>}
                </td>
                {g.cells.map((items, i) => (
                  <td key={r.cols[i].s} style={{ ...td, borderRight: sepRight(i), verticalAlign: 'top', padding: 2 }}>
                    {cellBox(items, blockColor(r.cols[i].block, blocks))}
                  </td>
                ))}
              </tr>
            ))}
            {r.unplaced && (
              <tr>
                <td style={{ ...td, borderRight: thick, background: '#fffbea' }}>그룹 미정</td>
                {r.unplaced.map((items, i) => (
                  <td key={r.cols[i].s} style={{ ...td, borderRight: sepRight(i), verticalAlign: 'top', padding: 2 }}>
                    {cellBox(items, blockColor(r.cols[i].block, blocks))}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: '#5b6b7c', marginTop: 4 }}>
          칸 = 그 그룹에 연 분반(기호)과 인원. 편차 = 한 과목 안에서 가장 큰 분반과 가장 작은 분반의 인원 차.
        </div>
      </div>

      {/* 2쪽: 요약 */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{r.title} — 과목별·그룹별 요약</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <table style={{ borderCollapse: 'collapse', flex: 3, fontSize: 10 }}>
            <thead>
              <tr>{['칸막이', '과목', '신청', '분반', '최대', '분반별 인원', '편차'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {r.cols.map((c) => (
                <tr key={c.s} style={{ breakInside: 'avoid' }}>
                  <td style={{ ...td, textAlign: 'center' }}>{c.block}</td>
                  <td style={td}>{c.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.demand}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.sections}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.maxSize ?? '-'}</td>
                  <td style={td}>{c.labels.map((l, k) => `${l} ${c.sizes[k]}`).join(' / ')}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: c.spread <= 1 ? '#2e7d32' : c.spread <= 2 ? '#b45309' : '#c62828' }}>{c.sections > 1 ? c.spread : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table style={{ borderCollapse: 'collapse', flex: 1, fontSize: 10 }}>
            <thead>
              <tr>{['그룹', '분반 수', '수업 인원', '분반 인원', ...(r.showFree ? ['공강'] : [])].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.t}>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 800 }}>{g.letter}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{g.sections}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{g.students}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{g.sections ? `${g.min}~${g.max}` : '-'}</td>
                  {r.showFree && <td style={{ ...td, textAlign: 'right' }}>{g.free}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  )
}
