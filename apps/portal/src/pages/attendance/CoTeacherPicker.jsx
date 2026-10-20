// 출결 이벤트 공동 담당교사 선택 (사용자 요청, 2026-10-21).
// 잔류학생 지도처럼 여러 교사가 날짜·교시를 나눠 맡는 이벤트를 위해, 만든 사람 외에
// 담당교사를 여러 명 지정한다. 지정된 교사의 대시보드에도 이벤트가 뜨고 출석 시작·
// 수동 처리·수정을 할 수 있다. 값은 [{ uid, name }] — 이벤트에는 조회용 coTeacherUids와
// 표시용 coTeachers를 함께 저장한다.
import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'

const TEACHER_ROLES = ['teacher', 'admin', 'school_admin', 'principal', 'headmaster']

export default function CoTeacherPicker({ schoolId, excludeUid, value, onChange }) {
  const [teachers, setTeachers] = useState([])
  const [search, setSearch] = useState('')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId)))
      .then(snap => setTeachers(snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(t => TEACHER_ROLES.includes(t.role) && t.uid !== excludeUid)
        .map(t => ({ uid: t.uid, name: t.name || t.email || '(이름 없음)', email: t.email || '', department: t.department || '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))))
      .catch(() => setLoadError(true))
  }, [schoolId, excludeUid])

  const selectedUids = new Set(value.map(t => t.uid))
  const keyword = search.trim().toLowerCase()
  const candidates = keyword
    ? teachers.filter(t => !selectedUids.has(t.uid) &&
        (t.name.toLowerCase().includes(keyword) || t.email.toLowerCase().includes(keyword) ||
         t.department.toLowerCase().includes(keyword))).slice(0, 8)
    : []

  const add = (t) => { onChange([...value, { uid: t.uid, name: t.name }]); setSearch('') }
  const remove = (uid) => onChange(value.filter(t => t.uid !== uid))

  return (
    <div>
      {value.length > 0 && (
        <div style={styles.chips}>
          {value.map(t => (
            <span key={t.uid} style={styles.chip}>
              {t.name}
              <button type="button" onClick={() => remove(t.uid)} style={styles.chipX} aria-label={`${t.name} 빼기`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (candidates[0]) add(candidates[0]) } }}
          placeholder={loadError ? '교사 목록을 불러오지 못했습니다' : '이름·이메일·부서로 검색해 추가'}
          disabled={loadError}
          style={styles.input}
        />
        {candidates.length > 0 && (
          <div style={styles.dropdown}>
            {candidates.map(t => (
              <button type="button" key={t.uid} onClick={() => add(t)} style={styles.option}>
                <strong>{t.name}</strong>
                <span style={styles.optionSub}>{[t.department, t.email].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 이벤트 문서에 넣을 필드
export function coTeacherFields(list) {
  return {
    coTeacherUids: list.map(t => t.uid),
    coTeachers: list.map(t => ({ uid: t.uid, name: t.name })),
  }
}

const styles = {
  chips: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.4rem' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#e3f2fd', color: '#1565c0', borderRadius: '14px', padding: '0.2rem 0.4rem 0.2rem 0.7rem', fontSize: '0.85rem', fontWeight: 600 },
  chipX: { background: 'none', border: 'none', color: '#1565c0', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 0.2rem' },
  input: { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #ddd', borderRadius: '8px', marginTop: '0.2rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden' },
  option: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '0.5rem 0.75rem', background: '#fff', border: 'none', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', textAlign: 'left', fontSize: '0.9rem' },
  optionSub: { fontSize: '0.75rem', color: '#888' },
}
