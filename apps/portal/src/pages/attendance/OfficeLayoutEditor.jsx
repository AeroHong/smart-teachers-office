import { useEffect, useRef, useState, useCallback } from 'react'
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import DeskIcon from '@shared/components/DeskIcon'
import { officeLayoutId } from '@shared/lib/officeLayout'

/**
 * 사무실 자리 배치 편집기
 *
 * 교원 배정에서 같은 사무실로 지정된 교사들을 카드로 놓고, 드래그해서 실제 책상 배치와
 * 같은 모양으로 맞춘다. 좌표는 캔버스 크기에 대한 0~1 비율로 저장하므로 화면 크기가
 * 달라도(관리자 PC ↔ 키오스크 크롬북) 같은 배치로 보인다.
 *
 * 저장 위치: schools/{schoolId}/officeLayouts/{year}__{office}
 * 문서 ID 규칙은 @shared/lib/officeLayout.js의 officeLayoutId()를 쓴다.
 */

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

// 카드 크기는 캔버스 대비 비율로 지정한다. 키오스크(CallInput.jsx)도 같은 값을 쓰므로
// 화면 크기가 달라도 관리자가 맞춘 배치가 그대로 재현된다. 두 파일을 함께 고쳐야 함.
const CARD_W_PCT = 0.19   // 캔버스 가로 대비
const CARD_H_PCT = 0.18   // 캔버스 세로 대비

// 자석 스냅 — 다른 카드나 캔버스 가장자리에 가까워지면 달라붙되, 딱 붙이지 않고 간격을 남긴다
const SNAP_THRESHOLD = 0.028   // 이 거리 안으로 들어오면 흡착
const SNAP_GAP_X = 0.014       // 좌우로 이웃할 때 남길 간격
const SNAP_GAP_Y = 0.024       // 위아래로 이웃할 때 남길 간격

// 후보값 중 기준값에 가장 가까운 것을 찾되, 임계값 밖이면 null
function snapAxis(value, candidates, threshold) {
  let best = null
  let bestDist = threshold
  for (const c of candidates) {
    const d = Math.abs(value - c)
    if (d < bestDist) { bestDist = d; best = c }
  }
  return best
}

export default function OfficeLayoutEditor({ schoolId, year, office }) {
  const [teachers, setTeachers] = useState([])
  const [seats, setSeats] = useState({})          // { uid: { x, y } } — 0~1 비율
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const canvasRef = useRef(null)
  const dragRef = useRef(null)   // { uid, dx, dy }
  const seatsRef = useRef(seats) // 드래그 중 최신 좌표를 읽기 위한 참조 (stale closure 방지)
  const [guides, setGuides] = useState({ x: null, y: null })  // 스냅 시 보여줄 정렬선

  useEffect(() => { seatsRef.current = seats }, [seats])

  // ── 데이터 로드 ────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || !office) return
    let cancelled = false
    setLoading(true)
    setMsg('')

    ;(async () => {
      const [assignSnap, usersSnap, layoutSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'schools', schoolId, 'teacherAssignments'),
          where('year', '==', year),
          where('office', '==', office),
        )),
        getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId))),
        getDoc(doc(db, 'schools', schoolId, 'officeLayouts', officeLayoutId(year, office))),
      ])
      if (cancelled) return

      const userById = {}
      usersSnap.docs.forEach(d => { userById[d.id] = d.data() })

      const list = assignSnap.docs
        .map(d => d.data())
        .filter(a => a.uid && STAFF_ROLES.includes(userById[a.uid]?.role))
        .map(a => ({
          uid: a.uid,
          name: userById[a.uid]?.name || userById[a.uid]?.email || '',
          positionLabel: a.positionLabel || '',
          subject: a.subject || '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

      setTeachers(list)
      setSeats(layoutSnap.exists() ? (layoutSnap.data().seats || {}) : {})
      setConfirmed(layoutSnap.exists() ? (layoutSnap.data().confirmed || false) : false)
      setDirty(false)
      setLoading(false)
    })().catch(e => {
      if (!cancelled) { setMsg('불러오기 실패: ' + e.message); setLoading(false) }
    })

    return () => { cancelled = true }
  }, [schoolId, year, office])

  // ── 드래그 ────────────────────────────────────────────────
  const handlePointerDown = (e, uid) => {
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { uid, dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e) => {
    const d = dragRef.current
    if (!d || !canvasRef.current) return
    const c = canvasRef.current.getBoundingClientRect()
    const maxX = 1 - CARD_W_PCT
    const maxY = 1 - CARD_H_PCT
    const clamp = (v, max) => Math.min(Math.max(v, 0), max)

    const rawX = clamp((e.clientX - d.dx - c.left) / c.width, maxX)
    const rawY = clamp((e.clientY - d.dy - c.top) / c.height, maxY)

    // 캔버스 가장자리 + 다른 카드와의 정렬/이웃 위치를 스냅 후보로
    const xCandidates = [0, maxX]
    const yCandidates = [0, maxY]
    Object.entries(seatsRef.current).forEach(([uid, s]) => {
      if (uid === d.uid) return
      xCandidates.push(s.x, s.x + CARD_W_PCT + SNAP_GAP_X, s.x - CARD_W_PCT - SNAP_GAP_X)
      yCandidates.push(s.y, s.y + CARD_H_PCT + SNAP_GAP_Y, s.y - CARD_H_PCT - SNAP_GAP_Y)
    })

    const snappedX = snapAxis(rawX, xCandidates, SNAP_THRESHOLD)
    const snappedY = snapAxis(rawY, yCandidates, SNAP_THRESHOLD)
    const x = clamp(snappedX ?? rawX, maxX)
    const y = clamp(snappedY ?? rawY, maxY)

    setGuides({ x: snappedX === null ? null : x, y: snappedY === null ? null : y })
    setSeats(prev => ({ ...prev, [d.uid]: { x, y } }))
    setDirty(true)
  }

  const handlePointerUp = (e) => {
    if (!dragRef.current) return
    dragRef.current = null
    setGuides({ x: null, y: null })
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // ── 배치/해제 ──────────────────────────────────────────────
  const placeTeacher = useCallback((uid) => {
    setSeats(prev => {
      // 이미 놓인 카드와 겹치지 않게 빈 격자 칸을 찾아 배치
      const taken = Object.values(prev)
      const gapX = CARD_W_PCT + SNAP_GAP_X
      const gapY = CARD_H_PCT + SNAP_GAP_Y
      const cols = Math.floor((1 - 0.02) / gapX)
      const rows = Math.floor((1 - 0.02) / gapY)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = 0.015 + col * gapX
          const y = 0.02 + row * gapY
          const overlap = taken.some(s => Math.abs(s.x - x) < 0.02 && Math.abs(s.y - y) < 0.02)
          if (!overlap) return { ...prev, [uid]: { x, y } }
        }
      }
      return { ...prev, [uid]: { x: 0.4, y: 0.4 } }
    })
    setDirty(true)
  }, [])

  const removeTeacher = (uid) => {
    setSeats(prev => {
      const next = { ...prev }
      delete next[uid]
      return next
    })
    setDirty(true)
  }

  const placeAll = () => unplaced.forEach(t => placeTeacher(t.uid))

  const clearAll = () => {
    if (!window.confirm('이 사무실의 자리 배치를 모두 지우시겠습니까?')) return
    setSeats({})
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      // 이 사무실에 없는 교사가 남아 있지 않도록 현재 명단 기준으로 정리 후 저장
      const validUids = new Set(teachers.map(t => t.uid))
      const cleaned = Object.fromEntries(
        Object.entries(seats).filter(([uid]) => validUids.has(uid))
      )
      await setDoc(doc(db, 'schools', schoolId, 'officeLayouts', officeLayoutId(year, office)), {
        year, office, seats: cleaned, confirmed, updatedAt: serverTimestamp(),
      })
      setSeats(cleaned)
      setDirty(false)
      setMsg('✅ 저장되었습니다. 키오스크 화면에 바로 반영됩니다.')
    } catch (e) {
      setMsg('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleConfirm = async () => {
    const newConfirmed = !confirmed
    setSaving(true)
    setMsg('')
    try {
      const validUids = new Set(teachers.map(t => t.uid))
      const cleaned = Object.fromEntries(
        Object.entries(seats).filter(([uid]) => validUids.has(uid))
      )
      await setDoc(doc(db, 'schools', schoolId, 'officeLayouts', officeLayoutId(year, office)), {
        year, office, seats: cleaned, confirmed: newConfirmed, updatedAt: serverTimestamp(),
      })
      setConfirmed(newConfirmed)
      setMsg(newConfirmed ? '✅ 배치 완료로 확정되었습니다.' : '확정이 해제되었습니다.')
    } catch (e) {
      setMsg('확정 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const placed = teachers.filter(t => seats[t.uid])
  const unplaced = teachers.filter(t => !seats[t.uid])

  if (loading) return <p style={{ color: '#888' }}>불러오는 중...</p>
  if (teachers.length === 0) {
    return <p style={{ color: '#888' }}>이 사무실로 배정된 교원이 없습니다. 교원 배정 탭에서 사무실을 먼저 지정해 주세요.</p>
  }

  return (
    <div>
      <style>{SEAT_CARD_CSS}</style>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <button onClick={save} disabled={saving || !dirty} style={btn.primary}>
          {saving ? '저장 중...' : dirty ? '배치 저장' : '저장됨'}
        </button>
        {placed.length > 0 && (
          <button
            onClick={toggleConfirm}
            disabled={saving || dirty}
            style={confirmed ? btn.confirmed : btn.outline}
          >
            {confirmed ? '✓ 배치 완료 확정됨' : '배치 완료 확정'}
          </button>
        )}
        {unplaced.length > 0 && (
          <button onClick={placeAll} style={btn.outline}>미배치 {unplaced.length}명 모두 놓기</button>
        )}
        {placed.length > 0 && <button onClick={clearAll} style={btn.danger}>전체 지우기</button>}
        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          카드를 끌어서 실제 책상 위치에 맞추세요
        </span>
      </div>

      {/* ── 배치 캔버스 ── */}
      <div
        ref={canvasRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          // 카드가 hover로 떠오를 때 그림자가 잘리지 않도록 visible (좌표는 이미 캔버스 안으로 clamp됨)
          overflow: 'visible',
          touchAction: 'none',
        }}
      >
        <span style={{
          position: 'absolute', top: 10, left: 14, fontSize: '0.78rem',
          color: '#94a3b8', pointerEvents: 'none',
        }}>
          {office} — 출입문 방향을 기준으로 배치하면 학생이 찾기 쉽습니다
        </span>

        {/* 스냅 정렬선 */}
        {guides.x !== null && (
          <div style={{
            position: 'absolute', left: `${guides.x * 100}%`, top: 0, bottom: 0,
            width: 1, backgroundColor: '#3d5872', opacity: 0.7, pointerEvents: 'none', zIndex: 10,
          }} />
        )}
        {guides.y !== null && (
          <div style={{
            position: 'absolute', top: `${guides.y * 100}%`, left: 0, right: 0,
            height: 1, backgroundColor: '#3d5872', opacity: 0.7, pointerEvents: 'none', zIndex: 10,
          }} />
        )}

        {placed.map(t => {
          const s = seats[t.uid]
          return (
            <div
              key={t.uid}
              className="seat-card"
              onPointerDown={e => handlePointerDown(e, t.uid)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title={[t.name, t.positionLabel, t.subject].filter(Boolean).join(' · ')}
              style={{
                position: 'absolute',
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                width: `${CARD_W_PCT * 100}%`,
                height: `${CARD_H_PCT * 100}%`,
              }}
            >
              <DeskIcon size={38} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={cardText.name}>{t.name}</div>
                {t.positionLabel && <div style={cardText.position}>{t.positionLabel}</div>}
                {t.subject && <div style={cardText.subject}>{t.subject}</div>}
              </div>
              <button
                className="seat-card__remove"
                onClick={() => removeTeacher(t.uid)}
                onPointerDown={e => e.stopPropagation()}
                title="배치에서 빼기"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* ── 미배치 목록 ── */}
      {unplaced.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.5rem' }}>
            아직 배치되지 않은 교원 ({unplaced.length}명) — 클릭하면 캔버스에 놓입니다
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {unplaced.map(t => (
              <button key={t.uid} onClick={() => placeTeacher(t.uid)} style={btn.chip}>
                {t.name}
                {t.positionLabel && <span style={{ color: '#7c3aed', marginLeft: 4 }}>{t.positionLabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {msg && <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.75rem' }}>{msg}</p>}
    </div>
  )
}

/* 카드는 평소엔 배경에 담백하게 놓여 있다가, 마우스를 올리면 살짝 떠오른다.
   드래그로 옮기는 UI라 :hover를 JS 상태로 흉내내면 끊겨 보여서 실제 CSS로 처리. */
const SEAT_CARD_CSS = `
.seat-card {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #ececf1;
  border-radius: 14px;
  cursor: grab;
  user-select: none;
  touch-action: none;
  overflow: hidden;
  transition: transform .18s cubic-bezier(.2,.8,.3,1), box-shadow .18s ease, border-color .18s ease;
}
.seat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 26px rgba(15,23,42,.13);
  border-color: transparent;
  z-index: 5;
}
.seat-card:active { cursor: grabbing; transform: translateY(-1px); }
.seat-card__remove {
  position: absolute; top: 6px; right: 8px;
  border: none; background: none; padding: 2px; line-height: 1;
  font-size: 1.05rem; color: #cbd5e1; cursor: pointer;
  opacity: 0; transition: opacity .15s ease;
}
.seat-card:hover .seat-card__remove { opacity: 1; }
.seat-card__remove:hover { color: #ef4444; }
`

// 카드 안 텍스트 — 한 줄씩, 넘치면 말줄임
const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const cardText = {
  name:     { ...ellipsis, fontSize: '1rem', fontWeight: 700, lineHeight: 1.3, color: '#111827' },
  position: { ...ellipsis, fontSize: '0.75rem', fontWeight: 600, color: '#3d5872', lineHeight: 1.35 },
  subject:  { ...ellipsis, fontSize: '0.75rem', color: '#8a94a6', lineHeight: 1.35 },
}

const btn = {
  primary: { padding: '0.4rem 0.9rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  outline: { padding: '0.4rem 0.9rem', backgroundColor: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' },
  confirmed: { padding: '0.4rem 0.9rem', backgroundColor: '#edf7ed', color: '#2e7d32', border: '1px solid #2e7d32', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  danger: { padding: '0.4rem 0.9rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' },
  chip: { padding: '0.4rem 0.75rem', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem' },
}
