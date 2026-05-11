import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

const ROLE_LABELS = {
  teacher: '교직원',
  school_admin: '학교 관리자',
  admin: '시스템 관리자',
}

const STAFF_TYPE_STYLE = {
  '교사':   { bg: '#e0f2fe', color: '#0369a1' },
  '교직원': { bg: '#f0fdf4', color: '#15803d' },
}

export default function Admin() {
  const { SCHOOL_ID } = useAuth()
  const [tab, setTab] = useState('pending')   // 'pending' | 'teachers'
  const [pendingList, setPendingList] = useState([])
  const [teacherList, setTeacherList] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPending = async () => {
    setLoading(true)
    const q = query(collection(db, 'users'), where('role', '==', 'pending'))
    const snap = await getDocs(q)
    setPendingList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const fetchTeachers = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'users'))
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    setTeacherList(
      all
        .filter(u => ['teacher', 'school_admin', 'admin'].includes(u.role))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    )
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'pending') fetchPending()
    else fetchTeachers()
  }, [tab])

  // 승인 시 role + staffType 함께 설정
  const approve = async (uid, asRole = 'teacher', staffType = '교사') => {
    await updateDoc(doc(db, 'users', uid), { role: asRole, schoolId: SCHOOL_ID, staffType })
    setPendingList(prev => prev.filter(u => u.id !== uid))
  }

  const reject = async (uid) => {
    await updateDoc(doc(db, 'users', uid), { role: 'rejected' })
    setPendingList(prev => prev.filter(u => u.id !== uid))
  }

  const changeRole = async (uid, newRole) => {
    await updateDoc(doc(db, 'users', uid), { role: newRole })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, role: newRole } : u))
  }

  const changeStaffType = async (uid, newType) => {
    await updateDoc(doc(db, 'users', uid), { staffType: newType })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, staffType: newType } : u))
  }

  const editName = async (uid, currentName) => {
    const newName = window.prompt('이름을 수정하세요 (재로그인 시 Google 계정 이름으로 자동 갱신됩니다):', currentName || '')
    if (newName === null) return
    const trimmed = newName.trim()
    if (!trimmed || trimmed === currentName) return
    await updateDoc(doc(db, 'users', uid), { name: trimmed })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, name: trimmed } : u))
  }

  return (
    <Layout>
      <h2 style={styles.heading}>관리자</h2>

      {/* 탭 */}
      <div style={styles.tabs}>
        <button onClick={() => setTab('pending')} style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }}>
          승인 대기 {pendingList.length > 0 && tab !== 'pending' && <span style={styles.badge}>{pendingList.length}</span>}
        </button>
        <button onClick={() => setTab('teachers')} style={{ ...styles.tab, ...(tab === 'teachers' ? styles.tabActive : {}) }}>
          구성원 목록
        </button>
      </div>

      {loading ? (
        <p>불러오는 중...</p>
      ) : tab === 'pending' ? (

        /* ── 승인 대기 탭 ── */
        pendingList.length === 0 ? (
          <p style={styles.empty}>승인 대기 중인 계정이 없습니다.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>이름</th>
                <th style={styles.th}>이메일</th>
                <th style={styles.th}>신청일</th>
                <th style={styles.th}>승인</th>
              </tr>
            </thead>
            <tbody>
              {pendingList.map(u => (
                <tr key={u.id}>
                  <td style={styles.td}>{u.name || '—'}</td>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>{u.createdAt?.toDate().toLocaleDateString('ko-KR') || '—'}</td>
                  <td style={styles.td}>
                    <button onClick={() => approve(u.id, 'teacher', '교사')} style={styles.approveBtn}>교사 승인</button>
                    <button onClick={() => approve(u.id, 'teacher', '교직원')} style={styles.staffBtn}>교직원 승인</button>
                    <button onClick={() => approve(u.id, 'school_admin', '교사')} style={styles.schoolAdminBtn}>학교관리자 승인</button>
                    <button onClick={() => reject(u.id)} style={styles.rejectBtn}>거절</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )

      ) : (

        /* ── 구성원 목록 탭 ── */
        teacherList.length === 0 ? (
          <p style={styles.empty}>등록된 구성원이 없습니다.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>이름</th>
                <th style={styles.th}>이메일</th>
                <th style={styles.th}>구분</th>
                <th style={styles.th}>시스템 역할</th>
                <th style={styles.th}>역할 변경</th>
              </tr>
            </thead>
            <tbody>
              {teacherList.map(u => {
                const typeStyle = STAFF_TYPE_STYLE[u.staffType]
                return (
                  <tr key={u.id}>
                    <td style={styles.td}>
                      {u.name || '—'}
                      <button onClick={() => editName(u.id, u.name || '')} style={styles.editNameBtn} title="이름 수정">✏️</button>
                    </td>
                    <td style={styles.td}>{u.email}</td>

                    {/* 구분 (교사/교직원) */}
                    <td style={styles.td}>
                      <select
                        value={u.staffType || ''}
                        onChange={e => e.target.value && changeStaffType(u.id, e.target.value)}
                        style={{
                          ...styles.select,
                          ...(typeStyle ? { backgroundColor: typeStyle.bg, color: typeStyle.color, fontWeight: 600 } : {}),
                        }}
                      >
                        <option value="">미설정</option>
                        <option value="교사">교사</option>
                        <option value="교직원">교직원</option>
                      </select>
                    </td>

                    {/* 시스템 역할 */}
                    <td style={styles.td}>
                      <span style={{
                        ...styles.roleBadge,
                        backgroundColor: u.role === 'school_admin' ? '#f3e5f5' : u.role === 'admin' ? '#e8f0fe' : '#f0f0f0',
                        color: u.role === 'school_admin' ? '#7b1fa2' : u.role === 'admin' ? '#1a73e8' : '#555',
                      }}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>

                    {/* 역할 변경 */}
                    <td style={styles.td}>
                      {u.role !== 'admin' && (
                        <>
                          {u.role !== 'teacher' && (
                            <button onClick={() => changeRole(u.id, 'teacher')} style={styles.changeBtn}>교사로</button>
                          )}
                          {u.role !== 'school_admin' && (
                            <button onClick={() => changeRole(u.id, 'school_admin')} style={styles.schoolAdminBtn}>학교관리자로</button>
                          )}
                        </>
                      )}
                      {u.role === 'admin' && <span style={styles.muted}>변경 불가</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      )}
    </Layout>
  )
}

const styles = {
  heading: { fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.25rem' },
  tabs: { display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid #eee' },
  tab: { padding: '0.6rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#888', fontWeight: 500, borderBottom: '2px solid transparent', marginBottom: '-2px' },
  tabActive: { color: '#1a73e8', borderBottomColor: '#1a73e8', fontWeight: 700 },
  badge: { display: 'inline-block', backgroundColor: '#d32f2f', color: '#fff', borderRadius: '999px', fontSize: '0.7rem', padding: '0.1rem 0.45rem', marginLeft: '0.35rem' },
  empty: { color: '#888' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '0.6rem 0.8rem', backgroundColor: '#f0f0f0', fontSize: '0.85rem', fontWeight: 600 },
  td: { padding: '0.6rem 0.8rem', borderBottom: '1px solid #eee', fontSize: '0.9rem', verticalAlign: 'middle' },
  roleBadge: { display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 },
  select: { padding: '0.25rem 0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.84rem', cursor: 'pointer', outline: 'none' },
  approveBtn: { marginRight: '0.4rem', padding: '0.3rem 0.75rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  staffBtn: { marginRight: '0.4rem', padding: '0.3rem 0.75rem', backgroundColor: '#15803d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  schoolAdminBtn: { marginRight: '0.4rem', padding: '0.3rem 0.75rem', backgroundColor: '#7b1fa2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  rejectBtn: { padding: '0.3rem 0.75rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  changeBtn: { marginRight: '0.4rem', padding: '0.3rem 0.75rem', backgroundColor: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  muted: { color: '#aaa', fontSize: '0.82rem' },
  editNameBtn: { marginLeft: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', padding: '0 2px', opacity: 0.45, verticalAlign: 'middle' },
}
