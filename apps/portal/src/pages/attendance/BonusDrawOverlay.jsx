import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSpinSchedule } from '@shared/lib/bonusDraw'

/**
 * 추가 뽑기 애니메이션 — 후보 명단을 격자로 깔고 하이라이트가 5초쯤 훑다가
 * 당첨자에서 멈춘다. 당첨자는 열기 전에 이미 정해져(저장까지 끝나) 있다.
 *
 * candidates: [{ id, name, sub }] / winnerId: 당첨자 id / onClose: 닫기
 */
export default function BonusDrawOverlay({ candidates, winnerId, onClose }) {
  const winnerIndex = candidates.findIndex(c => c.id === winnerId)
  const schedule = useMemo(
    () => buildSpinSchedule(candidates.length, winnerIndex, {
      totalMs: 5000,
      startIndex: Math.floor(Math.random() * Math.max(1, candidates.length)),
    }),
    // 열린 동안 명단이 바뀌어도(누가 새로 체크인) 애니메이션은 처음 일정대로 간다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [current, setCurrent] = useState(schedule[0]?.index ?? 0)
  const [done, setDone] = useState(schedule.length === 0)
  const cellRefs = useRef([])

  useEffect(() => {
    let i = 0
    let timer
    const tick = () => {
      if (i >= schedule.length) { setDone(true); return }
      const step = schedule[i++]
      timer = setTimeout(() => { setCurrent(step.index); tick() }, step.delay)
    }
    tick()
    return () => clearTimeout(timer)
  }, [schedule])

  // 명단이 길어 스크롤이 생기면 하이라이트를 따라간다
  useEffect(() => {
    cellRefs.current[current]?.scrollIntoView?.({ block: 'nearest' })
  }, [current])

  useEffect(() => {
    if (!done) return undefined
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, onClose])

  const shown = candidates[current]

  return (
    <div style={styles.backdrop} onClick={done ? onClose : undefined}>
      <style>{KEYFRAMES}</style>
      <div style={styles.card} onClick={e => e.stopPropagation()}>
        <div style={styles.title}>🎁 추가 뽑기</div>
        <div style={styles.subtitle}>1~3등·행운번호 당첨자를 뺀 출석 학생 {candidates.length}명 중 1명</div>

        <div style={{ ...styles.bigName, ...(done ? styles.bigNameDone : {}) }}>
          {done && <div style={styles.winLabel}>당첨!</div>}
          <div key={done ? 'done' : 'spin'} style={done ? { animation: 'bonusPop 0.5s ease-out' } : undefined}>
            {shown?.name ?? '-'}
          </div>
          {shown?.sub && <div style={styles.bigSub}>{shown.sub}</div>}
        </div>

        <div style={styles.grid}>
          {candidates.map((c, i) => {
            const on = i === current
            return (
              <div
                key={c.id}
                ref={el => { cellRefs.current[i] = el }}
                style={{
                  ...styles.cell,
                  ...(on ? styles.cellOn : {}),
                  ...(on && done ? styles.cellWin : {}),
                  ...(done && !on ? styles.cellDim : {}),
                }}
              >
                {c.name}
              </div>
            )
          })}
        </div>

        <button onClick={onClose} disabled={!done} style={{ ...styles.closeBtn, ...(done ? {} : styles.closeBtnWait) }}>
          {done ? '확인' : '뽑는 중…'}
        </button>
      </div>
    </div>
  )
}

const KEYFRAMES = `
@keyframes bonusPop { 0% { transform: scale(0.6); opacity: 0 } 70% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
@keyframes bonusGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(234,88,12,0.55) } 50% { box-shadow: 0 0 0 8px rgba(234,88,12,0) } }
`

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 9998, backgroundColor: 'rgba(15,23,42,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  },
  card: {
    backgroundColor: '#fff', borderRadius: '16px', padding: '1.5rem', width: 'min(760px, 100%)',
    maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: '0.9rem', boxSizing: 'border-box',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  },
  title: { fontSize: '1.3rem', fontWeight: 800, textAlign: 'center', color: '#9a3412' },
  subtitle: { fontSize: '0.85rem', color: '#78716c', textAlign: 'center', marginTop: '-0.5rem' },
  bigName: {
    textAlign: 'center', fontSize: '2.6rem', fontWeight: 800, color: '#1f2937',
    padding: '0.9rem 0.5rem', borderRadius: '12px', backgroundColor: '#f8fafc',
    border: '2px dashed #e2e8f0', minHeight: '5.5rem', display: 'flex', flexDirection: 'column',
    justifyContent: 'center', alignItems: 'center',
  },
  bigNameDone: { backgroundColor: '#fff7ed', border: '2px solid #fb923c', color: '#c2410c' },
  winLabel: { fontSize: '0.95rem', fontWeight: 800, color: '#ea580c', letterSpacing: '0.2em' },
  bigSub: { fontSize: '0.9rem', fontWeight: 500, color: '#78716c', marginTop: '0.2rem' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '0.4rem',
    overflowY: 'auto', minHeight: 0, padding: '2px',
  },
  cell: {
    padding: '0.45rem 0.3rem', borderRadius: '8px', border: '1px solid #e5e7eb',
    textAlign: 'center', fontSize: '0.9rem', color: '#374151', backgroundColor: '#fff',
    transition: 'background-color 0.08s, color 0.08s, opacity 0.3s',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  cellOn: { backgroundColor: '#fb923c', borderColor: '#ea580c', color: '#fff', fontWeight: 700 },
  cellWin: { backgroundColor: '#ea580c', animation: 'bonusGlow 1.2s ease-out infinite' },
  cellDim: { opacity: 0.4 },
  closeBtn: {
    alignSelf: 'center', padding: '0.6rem 2.5rem', borderRadius: '8px', border: 'none',
    backgroundColor: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
  },
  closeBtnWait: { backgroundColor: '#d6d3d1', cursor: 'default' },
}
