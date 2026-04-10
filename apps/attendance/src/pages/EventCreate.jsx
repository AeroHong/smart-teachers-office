import { useState, useEffect } from 'react'
import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy } from 'firebase/firestore'
import { useLocation } from 'react-router-dom'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import QRDisplay from '../components/QRDisplay'

const EVENT_TYPES = ['조회', '수업', '방과후', '행사', '기타']
const DAYS = ['일', '월', '화', '수', '목', '금', '토']

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
      const q = role === 'school_admin'
        ? col
        : query(col, where('createdBy', '==', user.uid))
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

  // 복제 데이터로 초기값 계산
  const buildInitialForm = (src) => {
    if (!src) return {
      name: '', type: '수업', courseId: '', studentGroupId: '', location: '', description: '',
      startTime: '', endTime: '',
      recurringDays: [], recurringTimeStart: '09:00', recurringTimeEnd: '09:50', recurringEndDate: '',
      lateCheckTime: '',
    }
    const toLocalDatetime = (ts) => {
      if (!ts) return ''
      const d = ts?.toDate?.() ?? new Date(ts)
      // datetime-local 형식 (YYYY-MM-DDTHH:mm)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    const toLocalDate = (ts) => {
      if (!ts) return ''
      const d = ts?.toDate?.() ?? new Date(ts)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    }
    return {
      name: `${src.name} (복제)`,
      type: src.type ?? '수업',
      courseId: src.courseId ?? '',
      studentGroupId: src.studentGroupId ?? '',
      location: src.location ?? '',
      description: src.description ?? '',
      startTime: toLocalDatetime(src.startTime),
      endTime: toLocalDatetime(src.endTime),
      recurringDays: src.recurringDays ?? [],
      recurringTimeStart: src.recurringTimeStart ?? '09:00',
      recurringTimeEnd: src.recurringTimeEnd ?? '09:50',
      recurringEndDate: toLocalDate(src.recurringEndDate),
      lateCheckTime: src.lateCheckTime ?? '',
    }
  }

  const [isRecurring, setIsRecurring] = useState(cloneSource?.isRecurring ?? false)
  const [form, setForm] = useState(() => buildInitialForm(cloneSource))

  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }))

  const toggleDay = (day) => {
    setForm(p => ({
      ...p,
      recurringDays: p.recurringDays.includes(day)
        ? p.recurringDays.filter(d => d !== day)
        : [...p.recurringDays, day].sort(),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (isRecurring) {
      if (!form.recurringDays.length) { setError('반복 요일을 하나 이상 선택하세요.'); return }
      if (!form.recurringEndDate) { setError('반복 종료일을 입력하세요.'); return }
    } else {
      if (new Date(form.endTime) <= new Date(form.startTime)) {
        setError('종료 시간이 시작 시간보다 늦어야 합니다.'); return
      }
    }

    setLoading(true)
    try {
      const qrToken = crypto.randomUUID()
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
        recurringDays: form.recurringDays,
        recurringTimeStart: form.recurringTimeStart,
        recurringTimeEnd: form.recurringTimeEnd,
        recurringEndDate: new Date(form.recurringEndDate),
      } : {
        ...base,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
      }

      const docRef = await addDoc(collection(db, 'schools', schoolId, 'events'), payload)
      setCreated({ eventId: docRef.id, qrToken, name: form.name })
      setForm({
        name: '', type: '수업', courseId: '', studentGroupId: '', location: '', description: '',
        startTime: '', endTime: '',
        recurringDays: [], recurringTimeStart: '09:00', recurringTimeEnd: '09:50', recurringEndDate: '',
      })
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
            <input value={form.name} onChange={set('name')} placeholder="예: 3학년 물리학Ⅱ 수업" required style={styles.input} />
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
              <button type="button" onClick={() => setShowNewCourse(p => !p)}
                style={styles.addCourseBtn}>+ 새 과목</button>
            </div>
            {showNewCourse && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <input value={newCourseName} onChange={e => setNewCourseName(e.target.value)}
                  placeholder="과목명 입력 (예: 물리학Ⅱ)" style={{ ...styles.input, flex: 1 }}
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
            <span style={styles.toggleHint}>수업처럼 매주 같은 요일/시간에 반복되는 경우</span>
          </div>

          {isRecurring ? (
            <>
              <Field label="반복 요일 *">
                <div style={styles.dayRow}>
                  {DAYS.map((d, i) => (
                    <button
                      key={i} type="button"
                      onClick={() => toggleDay(i)}
                      style={{
                        ...styles.dayBtn,
                        backgroundColor: form.recurringDays.includes(i) ? '#1a73e8' : '#f0f0f0',
                        color: form.recurringDays.includes(i) ? '#fff' : '#333',
                      }}
                    >{d}</button>
                  ))}
                </div>
              </Field>
              <div style={styles.row}>
                <Field label="시작 시간 *" style={{ flex: 1 }}>
                  <input type="time" value={form.recurringTimeStart} onChange={set('recurringTimeStart')} required style={styles.input} />
                </Field>
                <Field label="종료 시간 *" style={{ flex: 1 }}>
                  <input type="time" value={form.recurringTimeEnd} onChange={set('recurringTimeEnd')} required style={styles.input} />
                </Field>
              </div>
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

        {/* QR 결과 */}
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

const styles = {
  heading: { fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem' },
  layout: { display: 'flex', gap: '2rem', alignItems: 'flex-start' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, maxWidth: '520px' },
  row: { display: 'flex', gap: '1rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#333' },
  input: { padding: '0.6rem 0.8rem', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box' },
  toggleRow: { display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.75rem', backgroundColor: '#f8f9ff', borderRadius: '8px', border: '1px solid #e0e7ff' },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  toggleHint: { fontSize: '0.78rem', color: '#888', paddingLeft: '1.25rem' },
  dayRow: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  dayBtn: { width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
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
