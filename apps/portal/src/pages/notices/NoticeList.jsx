import { useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, updateDoc, doc, serverTimestamp, getDocs, getDoc,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

export default function NoticeList() {
  const { schoolId, user, role } = useAuth()

  const [notices, setNotices] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [editingNotice, setEditingNotice] = useState(null) // 수정 중인 공지
  const [previewNotice, setPreviewNotice] = useState(null)
  const [confirmModal, setConfirmModal] = useState(null)  // 확인 현황 볼 공지
  const [confirmData, setConfirmData] = useState(null)    // { loading, confirmed[], unconfirmed[] }

  const [draft, setDraft] = useState({
    eventId: '',
    title: '',
    content: '',
    targetType: 'all',
  })

  // 전체 공지 목록 실시간 구독
  useEffect(() => {
    if (!schoolId || !user) return
    const q = query(collection(db, 'schools', schoolId, 'notices'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [schoolId, user])

  // 이벤트 목록 (과목 연결용, 본인 이벤트만)
  useEffect(() => {
    if (!schoolId || !user) return
    const q = role === 'school_admin'
      ? query(collection(db, 'schools', schoolId, 'events'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'schools', schoolId, 'events'), where('createdBy', '==', user.uid), orderBy('createdAt', 'desc'))
    getDocs(q).then(snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [schoolId, user, role])

  const resetDraft = () => {
    setDraft({ eventId: '', title: '', content: '', targetType: 'all' })
    setEditingNotice(null)
  }

  const handleEdit = (notice) => {
    setEditingNotice(notice)
    setDraft({
      eventId: notice.eventId || '',
      title: notice.title,
      content: notice.content,
      targetType: notice.targetType,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      alert('제목과 내용을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const selectedEvent = events.find(e => e.id === draft.eventId)

      if (editingNotice) {
        // 수정
        await updateDoc(doc(db, 'schools', schoolId, 'notices', editingNotice.id), {
          eventId: draft.eventId || null,
          eventName: selectedEvent?.name || null,
          title: draft.title.trim(),
          content: draft.content.trim(),
          targetType: draft.targetType,
          updatedAt: serverTimestamp(),
        })
        // 수정 시 학생 확인 기록 초기화
        const cfmSnap = await getDocs(
          collection(db, 'schools', schoolId, 'notices', editingNotice.id, 'confirmations')
        )
        await Promise.all(cfmSnap.docs.map(d => deleteDoc(d.ref)))
      } else {
        // 신규 등록
        await addDoc(collection(db, 'schools', schoolId, 'notices'), {
          teacherId: user.uid,
          eventId: draft.eventId || null,
          eventName: selectedEvent?.name || null,
          title: draft.title.trim(),
          content: draft.content.trim(),
          targetType: draft.targetType,
          targetStudentIds: [],
          createdAt: serverTimestamp(),
          emailSent: false,
        })
      }
      resetDraft()
    } catch (err) {
      alert('저장 오류: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (noticeId) => {
    if (!window.confirm('공지를 삭제하시겠습니까?')) return
    await deleteDoc(doc(db, 'schools', schoolId, 'notices', noticeId))
    if (editingNotice?.id === noticeId) resetDraft()
  }

  // 확인 현황 모달 열기
  const handleOpenConfirm = async (notice) => {
    setConfirmModal(notice)
    setConfirmData({ loading: true, confirmed: [], unconfirmed: [] })

    try {
      // 이벤트 → 그룹 → 전체 학생 목록
      let allStudents = []
      if (notice.eventId) {
        const eventDoc = await getDoc(doc(db, 'schools', schoolId, 'events', notice.eventId))
        const groupId = eventDoc.data()?.studentGroupId
        if (groupId) {
          const groupDoc = await getDoc(doc(db, 'schools', schoolId, 'studentGroups', groupId))
          const studentIds = groupDoc.data()?.studentIds || []
          const studentsSnap = await getDocs(collection(db, 'schools', schoolId, 'students'))
          allStudents = studentsSnap.docs
            .map(d => d.data())
            .filter(s => studentIds.includes(s.studentId))
            .sort((a, b) => a.grade - b.grade || a.class - b.class || a.number - b.number)
        }
      }

      // 확인 기록 조회
      const cfmSnap = await getDocs(
        collection(db, 'schools', schoolId, 'notices', notice.id, 'confirmations')
      )
      const confirmedIds = new Set(cfmSnap.docs.map(d => d.id))
      const cfmTimes = Object.fromEntries(cfmSnap.docs.map(d => [d.id, d.data().confirmedAt]))

      const confirmed = allStudents
        .filter(s => confirmedIds.has(s.studentId))
        .map(s => ({ ...s, confirmedAt: cfmTimes[s.studentId] }))
      const unconfirmed = allStudents.filter(s => !confirmedIds.has(s.studentId))

      setConfirmData({ loading: false, confirmed, unconfirmed })
    } catch (err) {
      setConfirmData({ loading: false, confirmed: [], unconfirmed: [], error: err.message })
    }
  }

  const formatDate = (ts) => {
    if (!ts) return ''
    const d = ts.toDate?.() ?? new Date(ts)
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = ts.toDate?.() ?? new Date(ts)
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const canEdit = (notice) => role === 'school_admin' || notice.teacherId === user?.uid

  return (
    <Layout>
      <h2 style={s.heading}>스마트 공지</h2>

      {/* 공지 작성 / 수정 폼 */}
      <section style={s.section}>
        <h3 style={s.subHeading}>
          {editingNotice ? '공지 수정' : '공지 작성'}
          {editingNotice && (
            <span style={s.editingBadge}>수정 중: {editingNotice.title}</span>
          )}
        </h3>
        {editingNotice && (
          <div style={s.editWarning}>
            ⚠️ 공지를 수정하면 학생 확인 기록이 초기화되어 다시 확인해야 합니다.
          </div>
        )}
        <div style={s.form}>
          <div style={s.fieldRow}>
            <label style={s.label}>과목 연결</label>
            <select
              value={draft.eventId}
              onChange={e => setDraft(p => ({ ...p, eventId: e.target.value }))}
              style={s.select}
            >
              <option value="">연결 안 함 (일반 공지)</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <div style={s.fieldRow}>
            <label style={s.label}>제목 *</label>
            <input
              value={draft.title}
              onChange={e => setDraft(p => ({ ...p, title: e.target.value }))}
              placeholder="공지 제목"
              style={s.input}
            />
          </div>

          <div style={{ ...s.fieldRow, alignItems: 'flex-start' }}>
            <label style={{ ...s.label, paddingTop: '0.45rem' }}>내용 *</label>
            <textarea
              value={draft.content}
              onChange={e => setDraft(p => ({ ...p, content: e.target.value }))}
              placeholder="공지 내용을 입력하세요"
              rows={5}
              style={s.textarea}
            />
          </div>

          <div style={s.fieldRow}>
            <label style={s.label}>대상</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[
                { value: 'all', label: '전체 (이벤트 수강생)' },
                { value: 'individual', label: '개별 (추후 CSV 업로드)' },
              ].map(opt => (
                <label key={opt.value} style={s.radioLabel}>
                  <input
                    type="radio"
                    name="targetType"
                    value={opt.value}
                    checked={draft.targetType === opt.value}
                    onChange={() => setDraft(p => ({ ...p, targetType: opt.value }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            {editingNotice && (
              <button onClick={resetDraft} style={s.cancelBtn}>취소</button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !draft.title.trim() || !draft.content.trim()}
              style={{ ...s.saveBtn, ...(editingNotice ? { backgroundColor: '#f57c00' } : {}) }}
            >
              {saving ? '저장 중...' : editingNotice ? '수정 완료' : '공지 등록'}
            </button>
          </div>
        </div>
      </section>

      {/* 공지 목록 */}
      <section style={s.section}>
        <h3 style={s.subHeading}>
          공지 목록
          {!loading && <span style={s.countBadge}>{notices.length}건</span>}
        </h3>

        {loading ? (
          <p style={s.muted}>불러오는 중...</p>
        ) : notices.length === 0 ? (
          <p style={s.empty}>등록된 공지가 없습니다.</p>
        ) : (
          <div style={s.list}>
            {notices.map(n => (
              <div key={n.id} style={{ ...s.card, ...(editingNotice?.id === n.id ? s.cardEditing : {}) }}>
                <div style={s.cardHeader}>
                  <div style={s.cardMeta}>
                    {n.eventName && <span style={s.eventTag}>{n.eventName}</span>}
                    <span style={{ ...s.targetTag, ...(n.targetType === 'individual' ? s.targetTagIndiv : {}) }}>
                      {n.targetType === 'all' ? '전체' : `개별 ${n.targetStudentIds?.length ?? 0}명`}
                    </span>
                    <span style={s.dateText}>{formatDate(n.createdAt)}</span>
                    {n.updatedAt && <span style={s.updatedTag}>수정됨</span>}
                    {!canEdit(n) && <span style={s.otherTag}>타 교사</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button onClick={() => setPreviewNotice(n)} style={s.previewBtn}>미리보기</button>
                    {n.eventId && (
                      <button onClick={() => handleOpenConfirm(n)} style={s.confirmBtn}>확인 현황</button>
                    )}
                    {canEdit(n) && (
                      <>
                        <button onClick={() => handleEdit(n)} style={s.editBtn}>수정</button>
                        <button onClick={() => handleDelete(n.id)} style={s.deleteBtn}>삭제</button>
                      </>
                    )}
                  </div>
                </div>
                <div style={s.cardTitle}>{n.title}</div>
                <p style={s.cardContent}>{n.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 학생 미리보기 모달 */}
      {previewNotice && (
        <div style={s.modalOverlay} onClick={() => setPreviewNotice(null)}>
          <div style={s.modalWrap} onClick={e => e.stopPropagation()}>
            <p style={s.modalSchool}>선유고등학교</p>
            <h2 style={s.modalEventTitle}>{previewNotice.eventName || '과목 공지'}</h2>
            <div style={{ marginTop: '1.25rem' }}>
              <p style={s.modalSubLabel}>📋 출석 전 확인 필요 공지</p>
              <div style={s.modalNoticeTitle}>{previewNotice.title}</div>
              <p style={s.modalNoticeContent}>{previewNotice.content}</p>
              <button style={s.modalConfirmBtn} disabled>✓ 확인했습니다 (학생용)</button>
              <p style={s.modalHint}>공지를 확인해야 출석이 기록됩니다.</p>
            </div>
            <button onClick={() => setPreviewNotice(null)} style={s.modalCloseBtn}>닫기</button>
          </div>
        </div>
      )}

      {/* 확인 현황 모달 */}
      {confirmModal && (
        <div style={s.modalOverlay} onClick={() => { setConfirmModal(null); setConfirmData(null) }}>
          <div style={{ ...s.modalWrap, maxWidth: '480px', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', color: '#1a73e8' }}>
              확인 현황
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>{confirmModal.title}</p>

            {confirmData?.loading ? (
              <p style={s.muted}>불러오는 중...</p>
            ) : confirmData?.error ? (
              <p style={{ color: '#d32f2f', fontSize: '0.85rem' }}>오류: {confirmData.error}</p>
            ) : (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <p style={s.cfmSectionTitle}>
                    <span style={{ color: '#2e7d32' }}>✓ 확인 완료</span>
                    <span style={s.cfmCount}>{confirmData?.confirmed.length ?? 0}명</span>
                  </p>
                  {confirmData?.confirmed.length === 0 ? (
                    <p style={s.cfmEmpty}>없음</p>
                  ) : (
                    <div style={s.cfmList}>
                      {confirmData.confirmed.map(st => (
                        <div key={st.studentId} style={s.cfmItem}>
                          <span style={s.cfmName}>{st.name}</span>
                          <span style={s.cfmMeta}>{st.grade}학년 {st.class}반 {st.number}번</span>
                          <span style={s.cfmTime}>{formatTime(st.confirmedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p style={s.cfmSectionTitle}>
                    <span style={{ color: '#c62828' }}>✗ 미확인</span>
                    <span style={s.cfmCount}>{confirmData?.unconfirmed.length ?? 0}명</span>
                  </p>
                  {confirmData?.unconfirmed.length === 0 ? (
                    <p style={s.cfmEmpty}>모두 확인 완료 🎉</p>
                  ) : (
                    <div style={s.cfmList}>
                      {confirmData.unconfirmed.map(st => (
                        <div key={st.studentId} style={s.cfmItem}>
                          <span style={s.cfmName}>{st.name}</span>
                          <span style={s.cfmMeta}>{st.grade}학년 {st.class}반 {st.number}번</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ textAlign: 'right', marginTop: '1.25rem' }}>
              <button onClick={() => { setConfirmModal(null); setConfirmData(null) }} style={s.modalCloseBtn}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

const s = {
  heading: { fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem' },
  section: { marginBottom: '2.5rem' },
  subHeading: { fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  countBadge: { fontSize: '0.8rem', fontWeight: 500, backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '0.15rem 0.55rem', borderRadius: '999px' },
  editingBadge: { fontSize: '0.78rem', backgroundColor: '#fff3e0', color: '#e65100', padding: '0.15rem 0.6rem', borderRadius: '999px', fontWeight: 500 },
  editWarning: { backgroundColor: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px', padding: '0.6rem 0.9rem', fontSize: '0.84rem', color: '#795548', marginBottom: '0.75rem' },
  muted: { color: '#888', fontSize: '0.9rem' },
  empty: { color: '#aaa', fontSize: '0.9rem' },

  form: { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  fieldRow: { display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#444', minWidth: '80px' },
  select: { flex: 1, minWidth: '200px', padding: '0.45rem 0.75rem', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.9rem', outline: 'none', backgroundColor: '#fff' },
  input: { flex: 1, minWidth: '200px', padding: '0.45rem 0.75rem', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.9rem', outline: 'none' },
  textarea: { flex: 1, minWidth: '200px', padding: '0.45rem 0.75rem', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit', outline: 'none' },
  radioLabel: { display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.88rem', cursor: 'pointer' },
  saveBtn: { padding: '0.55rem 1.5rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 },
  cancelBtn: { padding: '0.55rem 1.2rem', backgroundColor: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' },

  list: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '1rem 1.25rem' },
  cardEditing: { border: '2px solid #f57c00', backgroundColor: '#fffde7' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' },
  cardMeta: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  eventTag: { fontSize: '0.78rem', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 },
  targetTag: { fontSize: '0.78rem', backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 },
  targetTagIndiv: { backgroundColor: '#f3e5f5', color: '#7b1fa2' },
  dateText: { fontSize: '0.78rem', color: '#999' },
  updatedTag: { fontSize: '0.72rem', backgroundColor: '#fff3e0', color: '#e65100', padding: '0.1rem 0.4rem', borderRadius: '999px' },
  otherTag: { fontSize: '0.72rem', backgroundColor: '#f5f5f5', color: '#888', padding: '0.1rem 0.4rem', borderRadius: '999px' },
  previewBtn: { padding: '0.2rem 0.6rem', backgroundColor: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' },
  confirmBtn: { padding: '0.2rem 0.6rem', backgroundColor: '#fff', color: '#2e7d32', border: '1px solid #2e7d32', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' },
  editBtn: { padding: '0.2rem 0.6rem', backgroundColor: '#fff', color: '#f57c00', border: '1px solid #f57c00', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' },
  deleteBtn: { padding: '0.2rem 0.6rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' },

  cardTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#222', marginBottom: '0.35rem' },
  cardContent: { fontSize: '0.87rem', color: '#444', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' },

  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modalWrap: { backgroundColor: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '360px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)', textAlign: 'center', maxHeight: '80vh', overflowY: 'auto' },
  modalSchool: { fontSize: '0.8rem', color: '#888', margin: '0 0 0.25rem' },
  modalEventTitle: { fontSize: '1.3rem', fontWeight: 700, color: '#1a73e8', margin: '0 0 0.4rem' },
  modalSubLabel: { textAlign: 'center', fontSize: '0.82rem', color: '#666', marginBottom: '0.6rem', fontWeight: 600 },
  modalNoticeTitle: { fontSize: '1rem', fontWeight: 700, color: '#1a73e8', marginBottom: '0.6rem', textAlign: 'center' },
  modalNoticeContent: { fontSize: '0.88rem', color: '#333', lineHeight: 1.7, whiteSpace: 'pre-line', margin: '0 0 1.25rem', backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '0.85rem 1rem', textAlign: 'left' },
  modalConfirmBtn: { width: '100%', padding: '0.85rem', backgroundColor: '#bdbdbd', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 700, cursor: 'not-allowed' },
  modalHint: { textAlign: 'center', fontSize: '0.75rem', color: '#aaa', marginTop: '0.6rem', marginBottom: '1.25rem' },
  modalCloseBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' },

  cfmSectionTitle: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.5rem' },
  cfmCount: { fontSize: '0.8rem', backgroundColor: '#f5f5f5', color: '#555', padding: '0.1rem 0.45rem', borderRadius: '999px' },
  cfmEmpty: { fontSize: '0.84rem', color: '#aaa', fontStyle: 'italic', marginBottom: '0.5rem' },
  cfmList: { display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem' },
  cfmItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', backgroundColor: '#f8f9fa', borderRadius: '6px', padding: '0.35rem 0.6rem', flexWrap: 'wrap' },
  cfmName: { fontWeight: 600, color: '#222' },
  cfmMeta: { color: '#888', fontSize: '0.78rem' },
  cfmTime: { color: '#1a73e8', fontSize: '0.78rem', marginLeft: 'auto' },
}
