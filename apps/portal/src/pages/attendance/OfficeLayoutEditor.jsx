import { useEffect, useRef, useState, useCallback } from 'react'
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'

/**
 * 사무실 자리 배치 편집기
 *
 * 교원 배정에서 같은 사무실로 지정된 교사들을 카드로 놓고, 드래그해서 실제 책상 배치와
 * 같은 모양으로 맞춘다. 좌표는 캔버스 크기에 대한 0~1 비율로 저장하므로 화면 크기가
 * 달라도(관리자 PC ↔ 키오스크 크롬북) 같은 배치로 보인다.
 *
 * 저장 위치: schools/{schoolId}/officeLayouts/{year}__{office}
 * 문서 ID 규칙은 functions/callSystem.js의 officeLayoutId()와 반드시 일치해야 한다.
 */

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']
const CARD_W = 132   // 캔버스 내 카드 크기(px) — 좌표 클램프 계산에 사용
const CARD_H = 66

export function officeLayoutId(year, office) {
  return `${year}__${office.replace(/\//g, '_')}`
}

export default function OfficeLayoutEditor({ schoolId, year, office }) {
  const [teachers, setTeachers] = useState([])
  const [seats, setSeats] = useState({})          // { uid: { x, y } } — 0~1 비율
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)

  const canvasRef = useRef(null)
  const dragRef = useRef(null)   // { uid, dx, dy }

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
    const maxX = Math.max(0, 1 - CARD_W / c.width)
    const maxY = Math.max(0, 1 - CARD_H / c.height)
    const x = Math.min(Math.max((e.clientX - d.dx - c.left) / c.width, 0), maxX)
    const y = Math.min(Math.max((e.clientY - d.dy - c.top) / c.height, 0), maxY)
    setSeats(prev => ({ ...prev, [d.uid]: { x, y } }))
    setDirty(true)
  }

  const handlePointerUp = (e) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // ── 배치/해제 ──────────────────────────────────────────────
  const placeTeacher = useCallback((uid) => {
    setSeats(prev => {
      // 이미 놓인 카드와 겹치지 않게 빈 격자 칸을 찾아 배치
      const taken = Object.values(prev)
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 5; col++) {
          const x = 0.04 + col * 0.19
          const y = 0.05 + row * 0.155
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
        year, office, seats: cleaned, updatedAt: serverTimestamp(),
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

  const placed = teachers.filter(t => seats[t.uid])
  const unplaced = teachers.filter(t => !seats[t.uid])

  if (loading) return <p style={{ color: '#888' }}>불러오는 중...</p>
  if (teachers.length === 0) {
    return <p style={{ color: '#888' }}>이 사무실로 배정된 교원이 없습니다. 교원 배정 탭에서 사무실을 먼저 지정해 주세요.</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <button onClick={save} disabled={saving || !dirty} style={btn.primary}>
          {saving ? '저장 중...' : dirty ? '배치 저장' : '저장됨'}
        </button>
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
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        <span style={{
          position: 'absolute', top: 10, left: 14, fontSize: '0.78rem',
          color: '#94a3b8', pointerEvents: 'none',
        }}>
          {office} — 출입문 방향을 기준으로 배치하면 학생이 찾기 쉽습니다
        </span>

        {placed.map(t => {
          const s = seats[t.uid]
          return (
            <div
              key={t.uid}
              onPointerDown={e => handlePointerDown(e, t.uid)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{
                position: 'absolute',
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                width: CARD_W,
                height: CARD_H,
                boxSizing: 'border-box',
                padding: '0.4rem 0.55rem',
                backgroundColor: '#fff',
                border: '1px solid #c7d2fe',
                borderLeft: '4px solid #4f46e5',
                borderRadius: 8,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                cursor: 'grab',
                userSelect: 'none',
                touchAction: 'none',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <strong style={{ fontSize: '0.9rem' }}>{t.name}</strong>
                {t.positionLabel && (
                  <span style={{ fontSize: '0.68rem', color: '#7c3aed' }}>{t.positionLabel}</span>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.subject || ' '}
              </div>
              <button
                onClick={() => removeTeacher(t.uid)}
                onPointerDown={e => e.stopPropagation()}
                title="배치에서 빼기"
                style={{
                  position: 'absolute', top: 2, right: 4, border: 'none', background: 'none',
                  cursor: 'pointer', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1, padding: 2,
                }}
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

const btn = {
  primary: { padding: '0.4rem 0.9rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  outline: { padding: '0.4rem 0.9rem', backgroundColor: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' },
  danger: { padding: '0.4rem 0.9rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' },
  chip: { padding: '0.4rem 0.75rem', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem' },
}
