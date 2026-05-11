import { useState, useEffect } from 'react'
import { doc, getDoc, updateDoc, getDocs, addDoc, collection, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

const EVENT_TYPES = ['조회', '수업', '방과후', '행사', '기타']
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

export default function EventEdit() {
  const { eventId } = useParams()
  const { schoolId, user, role } = useAuth()
  const navigate = useNavigate()

  const [groups, setGroups] = useState([])
  const [courses, setCourses] = useState([])
  const [newCourseName, setNewCourseName] = useState('')
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [schedules, setSchedules] = useState([{ dayOfWeek: 1, period: 1, useTime: false, startTime: '09:00', endTime: '09:50' }])
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!schoolId) return
    const load = async () => {
      const col = collection(db, 'schools', schoolId, 'studentGroups')
      const groupsQ = role === 'school_admin' ? col : query(col, where('createdBy', '==', user.uid))
      const [eventDoc, groupsSnap, sharedSnap, coursesSnap] = await Promise.all([
        getDoc(doc(db, 'schools', schoolId, 'events', eventId)),
        getDocs(groupsQ),
        role !== 'school_admin' ? getDocs(query(col, where('shared', '==', true))) : Promise.resolve({ docs: [] }),
        getDocs(query(collection(db, 'schools', schoolId, 'courses'), orderBy('name'))),
      ])
      setCourses(coursesSnap.docs.map(d => ({ id: d.id, ...d.data() })))

      if (!eventDoc.exists()) { navigate('/attendance'); return }

      const data = eventDoc.data()
      setIsRecurring(!!data.isRecurring)
      const seen = new Set()
      setGroups([...groupsSnap.docs, ...sharedSnap.docs]
        .filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
        .map(d => ({ id: d.id, ...d.data() })))

      // schedules 로드
      if (data.schedules?.length > 0) {
        setSchedules(data.schedules.map(s => ({
          dayOfWeek: s.dayOfWeek,
          period: s.period ?? 1,
          useTime: !!(s.startTime && s.endTime),
          startTime: s.startTime || '09:00',
          endTime: s.endTime || '09:50',
        })))
      } else if (data.recurringDays?.length > 0) {
        // 구형 데이터 변환
        setSchedules(data.recurringDays.map(day => ({
          dayOfWeek: day,
          period: 1,
          useTime: !!(data.recurringTimeStart && data.recurringTimeEnd),
          startTime: data.recurringTimeStart ?? '09:00',
          endTime: data.recurringTimeEnd ?? '09:50',
        })))
      }

      setForm({
        name: data.name || '',
        type: data.type || '수업',
        courseId: data.courseId || '',
        studentGroupId: data.studentGroupId || '',
        location: data.location || '',
        description: data.description || '',
        startTime: data.startTime ? toDatetimeLocal(data.startTime.toDate?.() ?? new Date(data.startTime)) : '',
        endTime: data.endTime ? toDatetimeLocal(data.endTime.toDate?.() ?? new Date(data.endTime)) : '',
        recurringEndDate: data.recurringEndDate
          ? (data.recurringEndDate.toDate?.() ?? new Date(data.recurringEndDate)).toISOString().slice(0, 10)
          : '',
        lateCheckTime: data.lateCheckTime || '',
      })
    }
    load()
  }, [schoolId, eventId])

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }))

  const handleAddCourse = async () => {
    const name = newCourseName.trim()
    if (!name) return
    const docRef = await addDoc(collection(db, 'schools', schoolId, 'courses'), {
      name, createdBy: user.uid, createdAt: serverTimestamp(),
    })
    const newCourse = { id: docRef.id, name }
    setCourses(prev => [...prev, newCourse].sort((a, b) => a.name.localeCompare(b.name)))
    setForm(p => ({ ...p, courseId: docRef.id }))
    setNewCourseName('')
    setShowNewCourse(false)
  }

  // ── 시간표 편집 ───────────────────────────────────────────────
  const addSchedule = () =>
    setSchedules(p => [...p, { dayOfWeek: 1, period: 1, useTime: false, startTime: '09:00', endTime: '09:50' }])

  const removeSchedule = (idx) =>
    setSchedules(p => p.filter((_, i) => i !== idx))

  const updateSchedule = (idx, field, value) =>
    setSchedules(p => p.map((s, i) => {
      if (i !== idx) return s
      if (field === 'dayOfWeek' || field === 'period') return { ...s, [field]: Number(value) }
      return { ...s, [field]: value }
    }))

  const toggleScheduleTime = (idx) =>
    setSchedules(p => p.map((s, i) => i === idx ? { ...s, useTime: !s.useTime } : s))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (isRecurring) {
      if (schedules.length === 0) { setError('요일/교시를 하나 이상 추가하세요.'); return }
      if (!form.recurringEndDate) { setError('반복 종료일을 입력하세요.'); return }
      const keys = schedules.map(s => `${s.dayOfWeek}-${s.period}`)
      if (new Set(keys).size !== keys.length) { setError('같은 요일·교시가 중복되어 있습니다.'); return }
    } else {
      if (new Date(form.endTime) <= new Date(form.startTime)) {
        setError('종료 시간이 시작 시간보다 늦어야 합니다.'); return
      }
    }

    setLoading(true)
    try {
      const sorted = [...schedules].sort((a, b) =>
        a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.period - b.period
      )
      const base = {
        name: form.name,
        type: form.type,
        courseId: form.courseId || null,
        studentGroupId: form.studentGroupId || null,
        location: form.location,
        description: form.description,
        isRecurring,
        lateCheckTime: (form.type === '조회' && form.lateCheckTime) ? form.lateCheckTime : null,
      }

      const payload = isRecurring ? {
        ...base,
        schedules: sorted.map(s => ({
          dayOfWeek: s.dayOfWeek,
          period: s.period,
          startTime: s.useTime ? s.startTime : null,
          endTime: s.useTime ? s.endTime : null,
        })),
        recurringDays: sorted.map(s => s.dayOfWeek),
        recurringEndDate: new Date(form.recurringEndDate),
        recurringTimeStart: null,
        recurringTimeEnd: null,
        startTime: null,
        endTime: null,
      } : {
        ...base,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
        schedules: null,
        recurringDays: null,
        recurringTimeStart: null,
        recurringTimeEnd: null,
        recurringEndDate: null,
      }

      await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), payload)
      navigate('/attendance')
    } catch {
      setError('수정 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (!form) return <Layout><p>불러오는 중...</p></Layout>

  return (
    <Layout>
      <div style={styles.header}>
        <h2 style={styles.heading}>이벤트 수정</h2>
        <button onClick={() => navigate('/attendance')} style={styles.cancelBtn}>취소</button>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <Field label="이벤트명 *">
          <input value={form.name} onChange={set('name')} required style={styles.input} />
        </Field>

        <Field label="유형">
          <select value={form.type} onChange={set('type')} style={styles.input}>
            {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="과목">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select value={form.courseId} onChange={set('courseId')} style={{ ...styles.input, flex: 1 }}>
              <option value="">과목 없음</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => setShowNewCourse(p => !p)} style={styles.addCourseBtn}>+ 새 과목</button>
          </div>
          {showNewCourse && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
              <input value={newCourseName} onChange={e => setNewCourseName(e.target.value)}
                placeholder="과목명 입력" style={{ ...styles.input, flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCourse())} />
              <button type="button" onClick={handleAddCourse}
                disabled={!newCourseName.trim()} style={styles.addCourseBtn}>추가</button>
            </div>
          )}
        </Field>

        {form.type === '조회' && (
          <Field label="지각 기준 시간">
            <input type="time" value={form.lateCheckTime} onChange={set('lateCheckTime')} style={styles.input} />
            <span style={styles.fieldHint}>이 시간 이후 체크인 → 지각으로 자동 표시 (비워두면 지각 판정 없음)</span>
          </Field>
        )}

        <Field label="대상 학생 그룹">
          <select value={form.studentGroupId} onChange={set('studentGroupId')} style={styles.input}>
            <option value="">그룹 선택 안 함 (개방형)</option>
            {groups.some(g => g.shared) && (
              <optgroup label="── 공유 그룹 ──">
                {groups.filter(g => g.shared)
                  .sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }))
                  .map(g => (
                    <option key={g.id} value={g.id}>[공유] {g.name} ({g.studentIds?.length || 0}명)</option>
                  ))}
              </optgroup>
            )}
            {groups.some(g => !g.shared) && (
              <optgroup label="── 내 그룹 ──">
                {groups.filter(g => !g.shared).map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.studentIds?.length || 0}명)</option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>

        <Field label="장소">
          <input value={form.location} onChange={set('location')} style={styles.input} />
        </Field>

        <div style={styles.toggleRow}>
          <label style={styles.toggleLabel}>
            <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
            <span>매주 반복 이벤트</span>
          </label>
          <span style={styles.toggleHint}>수업처럼 매주 반복되며, 요일·교시마다 다른 시간 설정 가능</span>
        </div>

        {isRecurring ? (
          <>
            <Field label="요일별 시간표 *">
              <div style={styles.scheduleList}>
                {schedules.map((sch, idx) => (
                  <div key={idx} style={styles.scheduleRow}>
                    <select
                      value={sch.dayOfWeek}
                      onChange={e => updateSchedule(idx, 'dayOfWeek', e.target.value)}
                      style={styles.daySelect}
                    >
                      {DAYS.map((d, i) => (
                        <option key={i} value={i}>{d}요일</option>
                      ))}
                    </select>

                    <select
                      value={sch.period}
                      onChange={e => updateSchedule(idx, 'period', e.target.value)}
                      style={styles.periodSelect}
                    >
                      {PERIODS.map(p => (
                        <option key={p} value={p}>{p}교시</option>
                      ))}
                    </select>

                    <label style={styles.timeToggleLabel}>
                      <input
                        type="checkbox"
                        checked={sch.useTime}
                        onChange={() => toggleScheduleTime(idx)}
                        style={styles.timeToggleCheck}
                      />
                      <span style={styles.timeToggleText}>시간</span>
                    </label>

                    {sch.useTime && (
                      <>
                        <input
                          type="time" value={sch.startTime}
                          onChange={e => updateSchedule(idx, 'startTime', e.target.value)}
                          style={styles.timeInput}
                        />
                        <span style={styles.timeSep}>~</span>
                        <input
                          type="time" value={sch.endTime}
                          onChange={e => updateSchedule(idx, 'endTime', e.target.value)}
                          style={styles.timeInput}
                        />
                      </>
                    )}

                    {schedules.length > 1 && (
                      <button type="button" onClick={() => removeSchedule(idx)} style={styles.removeBtn}>×</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addSchedule} style={styles.addRowBtn}>
                  + 요일 추가
                </button>
              </div>
              <span style={styles.fieldHint}>시간 체크 시 해당 시간대에만 QR 출석 가능 (미설정 시 당일 종일 허용)</span>
            </Field>

            <Field label="반복 종료일 *">
              <input type="date" value={form.recurringEndDate} onChange={set('recurringEndDate')} required style={styles.input} />
            </Field>
          </>
        ) : (
          <div style={styles.row}>
            <Field label="시작 시간 *" style={{ flex: 1 }}>
              <input type="datetime-local" value={form.startTime} onChange={set('startTime')} required style={styles.input} />
            </Field>
            <Field label="종료 시간 *" style={{ flex: 1 }}>
              <input type="datetime-local" value={form.endTime} onChange={set('endTime')} required style={styles.input} />
            </Field>
          </div>
        )}

        <Field label="설명">
          <textarea value={form.description} onChange={set('description')} rows={3}
            style={{ ...styles.input, resize: 'vertical' }} />
        </Field>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.row}>
          <button type="submit" disabled={loading} style={styles.saveBtn}>
            {loading ? '저장 중...' : '변경사항 저장'}
          </button>
          <button type="button" onClick={() => navigate('/attendance')} style={styles.cancelBtn2}>취소</button>
        </div>
      </form>
    </Layout>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...style }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  )
}

function toDatetimeLocal(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  heading: { fontSize: '1.3rem', fontWeight: 700, margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '560px' },
  row: { display: 'flex', gap: '1rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#333' },
  input: { padding: '0.6rem 0.8rem', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box' },
  toggleRow: { display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.75rem', backgroundColor: '#f8f9ff', borderRadius: '8px', border: '1px solid #e0e7ff' },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  toggleHint: { fontSize: '0.78rem', color: '#888', paddingLeft: '1.25rem' },

  scheduleList: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  scheduleRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', backgroundColor: '#fafafa', borderRadius: '8px', padding: '0.5rem 0.6rem', border: '1px solid #eee' },
  daySelect: { padding: '0.35rem 0.4rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', minWidth: '76px' },
  periodSelect: { padding: '0.35rem 0.4rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', minWidth: '68px' },
  timeToggleLabel: { display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '6px', backgroundColor: '#f0f4ff', border: '1px solid #c7d7fa', flexShrink: 0 },
  timeToggleCheck: { cursor: 'pointer', margin: 0 },
  timeToggleText: { fontSize: '0.8rem', color: '#4f46e5', fontWeight: 600, userSelect: 'none' },
  timeInput: { padding: '0.35rem 0.4rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', width: '90px' },
  timeSep: { color: '#888', fontSize: '0.85rem', flexShrink: 0 },
  removeBtn: { marginLeft: 'auto', padding: '0.2rem 0.5rem', border: 'none', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '5px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, flexShrink: 0 },
  addRowBtn: { alignSelf: 'flex-start', padding: '0.35rem 0.8rem', border: '1px dashed #1a73e8', color: '#1a73e8', backgroundColor: '#f0f7ff', borderRadius: '7px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, marginTop: '0.2rem' },

  saveBtn: { flex: 1, padding: '0.75rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '0.4rem 0.9rem', border: '1px solid #ddd', borderRadius: '7px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.9rem' },
  cancelBtn2: { padding: '0.75rem 1.5rem', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.95rem' },
  error: { color: '#d32f2f', fontSize: '0.85rem' },
  fieldHint: { fontSize: '0.76rem', color: '#888', marginTop: '0.2rem' },
  addCourseBtn: { padding: '0.6rem 0.8rem', border: '1px solid #1a73e8', color: '#1a73e8', backgroundColor: '#fff', borderRadius: '7px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' },
}
