import { useState, useEffect } from 'react'
import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy } from 'firebase/firestore'
import { useLocation } from 'react-router-dom'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import QRDisplay from '../../components/QRDisplay'

const EVENT_TYPES = ['조회', '수업', '방과후', '행사', '기타']
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

function buildCheckinUrl(schoolId, eventId, qrToken) {
  return `${window.location.origin}${import.meta.env.BASE_URL}checkin/${schoolId}/${eventId}?token=${qrToken}`
}

export default function EventCreate() {
  const { user, schoolId, role } = useAuth()
  const location = useLocation()
  const cloneSource = location.state?.clone ?? null

  const [groups, setGroups] = useState([])
  const [courses, setCourses] = useState([])
  const [newCourseName, setNewCourseName] = useState('')
  const [showNewCourse, setShowNewCourse] = useState(false)

  useEffect(() => {
    const load = async () => {
      const col = collection(db, 'schools', schoolId, 'studentGroups')
      const q = role === 'school_admin' ? col : query(col, where('createdBy', '==', user.uid))
      const [groupsSnap, coursesSnap] = await Promise.all([
        getDocs(q),
        getDocs(query(collection(db, 'schools', schoolId, 'courses'), orderBy('name'))),
      ])
      setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCourses(coursesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    if (schoolId && user) load()
  }, [schoolId, user, role])

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

  // ── 초기 폼 값 ────────────────────────────────────────────────
  const buildInitialForm = (src) => ({
    name: src ? `${src.name} (복제)` : '',
    type: src?.type ?? '수업',
    courseId: src?.courseId ?? '',
    studentGroupId: src?.studentGroupId ?? '',
    location: src?.location ?? '',
    description: src?.description ?? '',
    startTime: src?.startTime ? toDatetimeLocal(src.startTime?.toDate?.() ?? new Date(src.startTime)) : '',
    endTime: src?.endTime ? toDatetimeLocal(src.endTime?.toDate?.() ?? new Date(src.endTime)) : '',
    recurringEndDate: src?.recurringEndDate
      ? (src.recurringEndDate.toDate?.() ?? new Date(src.recurringEndDate)).toISOString().slice(0, 10)
      : '',
    lateCheckTime: src?.lateCheckTime ?? '',
  })

  const buildInitialSchedules = (src) => {
    if (src?.schedules?.length > 0) {
      return src.schedules.map(s => ({
        dayOfWeek: s.dayOfWeek,
        period: s.period ?? 1,
        useTime: !!(s.startTime && s.endTime),
        startTime: s.startTime || '09:00',
        endTime: s.endTime || '09:50',
      }))
    }
    // 구형 반복 이벤트 → schedules 변환
    if (src?.recurringDays?.length > 0) {
      return src.recurringDays.map(day => ({
        dayOfWeek: day,
        period: 1,
        useTime: !!(src.recurringTimeStart && src.recurringTimeEnd),
        startTime: src.recurringTimeStart ?? '09:00',
        endTime: src.recurringTimeEnd ?? '09:50',
      }))
    }
    return [{ dayOfWeek: 1, period: 1, useTime: false, startTime: '09:00', endTime: '09:50' }]
  }

  const [isRecurring, setIsRecurring] = useState(cloneSource?.isRecurring ?? false)
  const [form, setForm] = useState(() => buildInitialForm(cloneSource))
  const [schedules, setSchedules] = useState(() => buildInitialSchedules(cloneSource))

  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }))

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

  // ── 저장 ─────────────────────────────────────────────────────
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
      const qrToken = crypto.randomUUID()
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
        qrToken,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
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
      } : {
        ...base,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
      }

      const docRef = await addDoc(collection(db, 'schools', schoolId, 'events'), payload)
      setCreated({ eventId: docRef.id, qrToken, name: form.name })
      setForm(buildInitialForm(null))
      setSchedules([{ dayOfWeek: 1, period: 1, useTime: false, startTime: '09:00', endTime: '09:50' }])
      setIsRecurring(false)
    } catch {
      setError('이벤트 생성 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <h2 style={styles.heading}>{cloneSource ? '이벤트 복제' : '이벤트 생성'}</h2>
      {cloneSource && (
        <div style={styles.cloneBanner}>
          복제 원본: <strong>{cloneSource.name}</strong> — 내용을 수정한 후 생성하세요. 새 QR 코드가 자동으로 발급됩니다.
        </div>
      )}
      <div style={styles.layout}>
        <form onSubmit={handleSubmit} style={styles.form}>

          <Field label="이벤트명 *">
            <input value={form.name} onChange={set('name')} placeholder="예: 물리학B분반" required style={styles.input} />
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
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name} ({g.studentIds?.length || 0}명)</option>
              ))}
            </select>
          </Field>

          <Field label="장소">
            <input value={form.location} onChange={set('location')} placeholder="예: 3-2교실" style={styles.input} />
          </Field>

          {/* 반복 여부 토글 */}
          <div style={styles.toggleRow}>
            <label style={styles.toggleLabel}>
              <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
              <span>매주 반복 이벤트</span>
            </label>
            <span style={styles.toggleHint}>수업처럼 매주 반복되며, 요일·교시마다 다른 시간 설정 가능</span>
          </div>

          {isRecurring ? (
            <>
              {/* ── 요일별 시간표 ── */}
              <Field label="요일별 시간표 *">
                <div style={styles.scheduleList}>
                  {schedules.map((sch, idx) => (
                    <div key={idx} style={styles.scheduleRow}>
                      {/* 요일 */}
                      <select
                        value={sch.dayOfWeek}
                        onChange={e => updateSchedule(idx, 'dayOfWeek', e.target.value)}
                        style={styles.daySelect}
                      >
                        {DAYS.map((d, i) => (
                          <option key={i} value={i}>{d}요일</option>
                        ))}
                      </select>

                      {/* 교시 */}
                      <select
                        value={sch.period}
                        onChange={e => updateSchedule(idx, 'period', e.target.value)}
                        style={styles.periodSelect}
                      >
                        {PERIODS.map(p => (
                          <option key={p} value={p}>{p}교시</option>
                        ))}
                      </select>

                      {/* 시간 설정 토글 */}
                      <label style={styles.timeToggleLabel}>
                        <input
                          type="checkbox"
                          checked={sch.useTime}
                          onChange={() => toggleScheduleTime(idx)}
                          style={styles.timeToggleCheck}
                        />
                        <span style={styles.timeToggleText}>시간</span>
                      </label>

                      {/* 시간 입력 (선택) */}
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
            <textarea value={form.description} onChange={set('description')} rows={2} style={{ ...styles.input, resize: 'vertical' }} />
          </Field>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? '생성 중...' : '이벤트 생성 + QR 발급'}
          </button>
        </form>

        {/* QR 결과 패널 */}
        <div style={styles.qrPanel}>
          {created ? (
            <>
              <p style={styles.qrTitle}>✅ <strong>{created.name}</strong></p>
              <QRDisplay
                eventName={created.name}
                checkinUrl={buildCheckinUrl(schoolId, created.eventId, created.qrToken)}
              />
              <button onClick={() => setCreated(null)} style={styles.newBtn}>새 이벤트 만들기</button>
            </>
          ) : (
            <div style={styles.qrPlaceholder}>
              <p>이벤트를 생성하면<br />QR 코드가 여기에 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
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
  heading: { fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem' },
  layout: { display: 'flex', gap: '2rem', alignItems: 'flex-start' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, maxWidth: '560px' },
  row: { display: 'flex', gap: '1rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#333' },
  input: { padding: '0.6rem 0.8rem', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box' },
  toggleRow: { display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.75rem', backgroundColor: '#f8f9ff', borderRadius: '8px', border: '1px solid #e0e7ff' },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  toggleHint: { fontSize: '0.78rem', color: '#888', paddingLeft: '1.25rem' },

  // 시간표 UI
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

  submitBtn: { marginTop: '0.5rem', padding: '0.75rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  fieldHint: { fontSize: '0.76rem', color: '#888', marginTop: '0.2rem' },
  error: { color: '#d32f2f', fontSize: '0.85rem' },
  qrPanel: { minWidth: '260px', border: '1px solid #eee', borderRadius: '12px', padding: '1.5rem', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' },
  qrTitle: { textAlign: 'center', color: '#2e7d32', margin: 0 },
  qrPlaceholder: { textAlign: 'center', color: '#aaa', padding: '2rem 1rem', lineHeight: 1.8 },
  newBtn: { padding: '0.5rem 1rem', border: '1px solid #ddd', borderRadius: '7px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.85rem' },
  addCourseBtn: { padding: '0.6rem 0.8rem', border: '1px solid #1a73e8', color: '#1a73e8', backgroundColor: '#fff', borderRadius: '7px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' },
  cloneBanner: { marginBottom: '1.25rem', padding: '0.75rem 1rem', backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', fontSize: '0.88rem', color: '#2e7d32' },
}
