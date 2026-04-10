import { useState, useEffect } from 'react'
import { doc, getDoc, updateDoc, getDocs, addDoc, collection, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'

const EVENT_TYPES = ['조회', '수업', '방과후', '행사', '기타']
const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function EventEdit() {
  const { eventId } = useParams()
  const { schoolId, user } = useAuth()
  const navigate = useNavigate()

  const [groups, setGroups] = useState([])
  const [courses, setCourses] = useState([])
  const [newCourseName, setNewCourseName] = useState('')
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [form, setForm] = useState(null)   // null = 로딩 중
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 이벤트 + 그룹 + 과목 목록 로드
  useEffect(() => {
    if (!schoolId) return
    const load = async () => {
      const [eventDoc, groupsSnap, coursesSnap] = await Promise.all([
        getDoc(doc(db, 'schools', schoolId, 'events', eventId)),
        getDocs(collection(db, 'schools', schoolId, 'studentGroups')),
        getDocs(query(collection(db, 'schools', schoolId, 'courses'), orderBy('name'))),
      ])

      if (!eventDoc.exists()) { navigate('/'); return }

      const data = eventDoc.data()
      setIsRecurring(!!data.isRecurring)
      setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCourses(coursesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setForm({
        name: data.name || '',
        type: data.type || '수업',
        courseId: data.courseId || '',
        studentGroupId: data.studentGroupId || '',
        location: data.location || '',
        description: data.description || '',
        // 단일
        startTime: data.startTime ? toDatetimeLocal(data.startTime.toDate?.() ?? new Date(data.startTime)) : '',
        endTime: data.endTime ? toDatetimeLocal(data.endTime.toDate?.() ?? new Date(data.endTime)) : '',
        // 반복
        recurringDays: data.recurringDays || [],
        recurringTimeStart: data.recurringTimeStart || '09:00',
        recurringTimeEnd: data.recurringTimeEnd || '09:50',
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
        recurringDays: form.recurringDays,
        recurringTimeStart: form.recurringTimeStart,
        recurringTimeEnd: form.recurringTimeEnd,
        recurringEndDate: new Date(form.recurringEndDate),
        startTime: null,
        endTime: null,
      } : {
        ...base,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
        recurringDays: null,
        recurringTimeStart: null,
        recurringTimeEnd: null,
        recurringEndDate: null,
      }

      await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), payload)
      navigate('/')
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
        <button onClick={() => navigate('/')} style={styles.cancelBtn}>취소</button>
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
            <button type="button" onClick={() => setShowNewCourse(p => !p)}
              style={styles.addCourseBtn}>+ 새 과목</button>
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
          <input value={form.location} onChange={set('location')} style={styles.input} />
        </Field>

        <div style={styles.toggleRow}>
          <label style={styles.toggleLabel}>
            <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
            <span>매주 반복 이벤트</span>
          </label>
        </div>

        {isRecurring ? (
          <>
            <Field label="반복 요일 *">
              <div style={styles.dayRow}>
                {DAYS.map((d, i) => (
                  <button key={i} type="button" onClick={() => toggleDay(i)}
                    style={{ ...styles.dayBtn, backgroundColor: form.recurringDays.includes(i) ? '#1a73e8' : '#f0f0f0', color: form.recurringDays.includes(i) ? '#fff' : '#333' }}>
                    {d}
                  </button>
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
          <textarea value={form.description} onChange={set('description')} rows={3}
            style={{ ...styles.input, resize: 'vertical' }} />
        </Field>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.row}>
          <button type="submit" disabled={loading} style={styles.saveBtn}>
            {loading ? '저장 중...' : '변경사항 저장'}
          </button>
          <button type="button" onClick={() => navigate('/')} style={styles.cancelBtn2}>취소</button>
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

// Firestore Timestamp → datetime-local 문자열
function toDatetimeLocal(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  heading: { fontSize: '1.3rem', fontWeight: 700, margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '520px' },
  row: { display: 'flex', gap: '1rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#333' },
  input: { padding: '0.6rem 0.8rem', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box' },
  toggleRow: { padding: '0.75rem', backgroundColor: '#f8f9ff', borderRadius: '8px', border: '1px solid #e0e7ff' },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  dayRow: { display: 'flex', gap: '0.4rem' },
  dayBtn: { width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
  saveBtn: { flex: 1, padding: '0.75rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '0.4rem 0.9rem', border: '1px solid #ddd', borderRadius: '7px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.9rem' },
  cancelBtn2: { padding: '0.75rem 1.5rem', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.95rem' },
  error: { color: '#d32f2f', fontSize: '0.85rem' },
  fieldHint: { fontSize: '0.76rem', color: '#888', marginTop: '0.2rem' },
  addCourseBtn: { padding: '0.6rem 0.8rem', border: '1px solid #1a73e8', color: '#1a73e8', backgroundColor: '#fff', borderRadius: '7px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' },
}
