import { useEffect, useState } from 'react'
import {
  collection, query, where, getDocs,
  updateDoc, doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
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

// 이메일을 Firestore doc ID로 안전하게 변환
function emailToDocId(email) {
  return email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__')
}

// TSV 파싱: "이름\t이메일\t구분" 형식
function parseTsv(text) {
  return text.trim().split(/\r?\n/)
    .map(line => {
      const cols = line.split('\t').map(c => c.trim())
      const name = cols[0] || ''
      const email = (cols[1] || '').toLowerCase()
      const staffType = cols[2] || '교사'
      return { name, email, staffType }
    })
    .filter(r => r.email && r.email.includes('@'))
}

export default function Admin() {
  const { schoolId } = useAuth()
  const [tab, setTab] = useState('pending')   // 'pending' | 'teachers' | 'preapprove'

  const [pendingList, setPendingList]   = useState([])
  const [teacherList, setTeacherList]   = useState([])
  const [preApproved, setPreApproved]   = useState([])  // 사전 등록 목록
  const [loading, setLoading] = useState(true)

  // ── 데이터 불러오기 ────────────────────────────────────────
  const fetchPending = async () => {
    if (!schoolId) return
    setLoading(true)
    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', schoolId),
      where('role', '==', 'pending'),
    )
    const snap = await getDocs(q)
    setPendingList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const fetchTeachers = async () => {
    if (!schoolId) return
    setLoading(true)
    const [usersSnap, preSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId))),
      getDocs(collection(db, 'schools', schoolId, 'preApproved')),
    ])

    const realUsers = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => ['teacher', 'school_admin', 'admin'].includes(u.role))

    const realEmails = new Set(realUsers.map(u => u.email?.toLowerCase()))

    // 아직 로그인하지 않은 사전 등록 항목
    const preOnly = preSnap.docs
      .map(d => ({ id: d.id, ...d.data(), _preOnly: true }))
      .filter(p => !realEmails.has(p.email?.toLowerCase()))

    setTeacherList(
      [...realUsers, ...preOnly]
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    )
    setLoading(false)
  }

  const fetchPreApproved = async () => {
    if (!schoolId) return
    setLoading(true)
    const snap = await getDocs(collection(db, 'schools', schoolId, 'preApproved'))
    setPreApproved(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    )
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'pending')     fetchPending()
    else if (tab === 'teachers')    fetchTeachers()
    else if (tab === 'preapprove')  fetchPreApproved()
  }, [tab, schoolId])

  // ── 승인 대기 탭 액션 ──────────────────────────────────────
  const approve = async (uid, asRole = 'teacher', staffType = '교사') => {
    await updateDoc(doc(db, 'users', uid), { role: asRole, schoolId, staffType })
    setPendingList(prev => prev.filter(u => u.id !== uid))
  }

  const reject = async (uid) => {
    await updateDoc(doc(db, 'users', uid), { role: 'rejected' })
    setPendingList(prev => prev.filter(u => u.id !== uid))
  }

  // ── 구성원 목록 탭 액션 ────────────────────────────────────
  const changeRole = async (uid, newRole) => {
    await updateDoc(doc(db, 'users', uid), { role: newRole })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, role: newRole } : u))
  }

  const changeStaffType = async (uid, newType) => {
    await updateDoc(doc(db, 'users', uid), { staffType: newType })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, staffType: newType } : u))
  }

  const editName = async (uid, currentName) => {
    const newName = window.prompt('이름을 수정하세요:', currentName || '')
    if (newName === null) return
    const trimmed = newName.trim()
    if (!trimmed || trimmed === currentName) return
    await updateDoc(doc(db, 'users', uid), { name: trimmed })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, name: trimmed } : u))
  }

  // ── 사전 등록 탭 ──────────────────────────────────────────
  const [pasteText, setPasteText] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const handleParse = () => {
    const rows = parseTsv(pasteText)
    if (rows.length === 0) {
      alert('유효한 데이터가 없습니다.\n형식: 이름 TAB 이메일 TAB 구분(교사/교직원)')
      return
    }
    setParsedRows(rows)
  }

  const handleSavePreApproved = async () => {
    if (parsedRows.length === 0 || !schoolId) return
    setSaving(true)
    setSaveMsg('')
    try {
      await Promise.all(parsedRows.map(r => {
        const docId = emailToDocId(r.email)
        return setDoc(doc(db, 'schools', schoolId, 'preApproved', docId), {
          name: r.name,
          email: r.email,
          staffType: r.staffType === '교직원' ? '교직원' : '교사',
          role: 'teacher',
          createdAt: serverTimestamp(),
        }, { merge: true })
      }))
      setSaveMsg(`✅ ${parsedRows.length}명 사전 등록 완료`)
      setParsedRows([])
      setPasteText('')
      await fetchPreApproved()
    } catch (e) {
      setSaveMsg('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePreApproved = async (docId, name) => {
    if (!window.confirm(`${name}님을 사전 등록 명단에서 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db, 'schools', schoolId, 'preApproved', docId))
    setPreApproved(prev => prev.filter(p => p.id !== docId))
  }

  return (
    <Layout>
      <h2 style={styles.heading}>관리자</h2>

      {/* ── 탭 ── */}
      <div style={styles.tabs}>
        <button onClick={() => setTab('pending')}
          style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }}>
          승인 대기
          {pendingList.length > 0 && tab !== 'pending' && (
            <span style={styles.badge}>{pendingList.length}</span>
          )}
        </button>
        <button onClick={() => setTab('teachers')}
          style={{ ...styles.tab, ...(tab === 'teachers' ? styles.tabActive : {}) }}>
          구성원 목록
        </button>
        <button onClick={() => setTab('preapprove')}
          style={{ ...styles.tab, ...(tab === 'preapprove' ? styles.tabActive : {}) }}>
          사전 등록
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>불러오는 중...</p>
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
                    <button onClick={() => approve(u.id, 'school_admin', '교사')} style={styles.schoolAdminBtn}>관리자 승인</button>
                    <button onClick={() => reject(u.id)} style={styles.rejectBtn}>거절</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )

      ) : tab === 'teachers' ? (

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
                const isPreOnly = !!u._preOnly
                return (
                  <tr key={u.id} style={isPreOnly ? { opacity: 0.7, backgroundColor: '#fafafa' } : {}}>
                    <td style={styles.td}>
                      {u.name || '—'}
                      {!isPreOnly && (
                        <button onClick={() => editName(u.id, u.name || '')} style={styles.editNameBtn} title="이름 수정">✏️</button>
                      )}
                    </td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>
                      {isPreOnly ? (
                        <span style={{
                          ...styles.roleBadge,
                          backgroundColor: typeStyle?.bg || '#e0f2fe',
                          color: typeStyle?.color || '#0369a1',
                        }}>
                          {u.staffType || '교사'}
                        </span>
                      ) : (
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
                      )}
                    </td>
                    <td style={styles.td}>
                      {isPreOnly ? (
                        <span style={{ ...styles.roleBadge, backgroundColor: '#fef9c3', color: '#92400e' }}>
                          미접속
                        </span>
                      ) : (
                        <span style={{
                          ...styles.roleBadge,
                          backgroundColor: u.role === 'school_admin' ? '#f3e5f5' : u.role === 'admin' ? '#e8f0fe' : '#f0f0f0',
                          color: u.role === 'school_admin' ? '#7b1fa2' : u.role === 'admin' ? '#1a73e8' : '#555',
                        }}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {isPreOnly ? (
                        <span style={styles.muted}>로그인 후 활성화</span>
                      ) : u.role !== 'admin' ? (
                        <>
                          {u.role !== 'teacher' && (
                            <button onClick={() => changeRole(u.id, 'teacher')} style={styles.changeBtn}>교사로</button>
                          )}
                          {u.role !== 'school_admin' && (
                            <button onClick={() => changeRole(u.id, 'school_admin')} style={styles.schoolAdminBtn}>관리자로</button>
                          )}
                        </>
                      ) : (
                        <span style={styles.muted}>변경 불가</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )

      ) : (

        /* ── 사전 등록 탭 ── */
        <div>
          {/* 안내 */}
          <div style={styles.infoBox}>
            <strong>사전 등록이란?</strong> 교사 명단을 미리 등록해두면, 해당 선생님이 구글 계정으로 첫 로그인 시
            승인 대기 없이 바로 <strong>교직원</strong> 역할로 자동 활성화됩니다.
          </div>

          {/* 붙여넣기 입력 */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.88rem', color: '#555', marginBottom: '0.5rem' }}>
              엑셀/스프레드시트에서 <strong>이름 → 이메일(구글계정) → 구분(교사/교직원)</strong> 열을 복사 후 붙여넣기 하세요.
            </p>
            <textarea
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setParsedRows([]) }}
              placeholder={'홍길동\thong@seonyoo.hs.kr\t교사\n김철수\tkim@seonyoo.hs.kr\t교직원'}
              rows={6}
              style={styles.textarea}
            />
            <button onClick={handleParse} style={styles.approveBtn}>
              미리보기
            </button>
          </div>

          {/* 파싱 결과 미리보기 */}
          {parsedRows.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.5rem', color: '#333' }}>
                {parsedRows.length}명 확인됨 — 내용이 맞으면 등록하세요.
              </p>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>이름</th>
                    <th style={styles.th}>이메일</th>
                    <th style={styles.th}>구분</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{r.name}</td>
                      <td style={styles.td}>{r.email}</td>
                      <td style={styles.td}>{r.staffType === '교직원' ? '교직원' : '교사'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={handleSavePreApproved}
                disabled={saving}
                style={{ ...styles.approveBtn, marginTop: '0.75rem' }}
              >
                {saving ? '저장 중...' : `${parsedRows.length}명 사전 등록`}
              </button>
              {saveMsg && <span style={{ marginLeft: '1rem', fontSize: '0.88rem', color: '#15803d' }}>{saveMsg}</span>}
            </div>
          )}

          {/* 현재 사전 등록 명단 */}
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333', marginBottom: '0.5rem' }}>
              현재 사전 등록 명단 ({preApproved.length}명)
            </p>
            {preApproved.length === 0 ? (
              <p style={styles.empty}>사전 등록된 구성원이 없습니다.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>이름</th>
                    <th style={styles.th}>이메일</th>
                    <th style={styles.th}>구분</th>
                    <th style={styles.th}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {preApproved.map(p => (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.name || '—'}</td>
                      <td style={styles.td}>{p.email}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.roleBadge,
                          backgroundColor: p.staffType === '교직원' ? '#f0fdf4' : '#e0f2fe',
                          color: p.staffType === '교직원' ? '#15803d' : '#0369a1',
                        }}>
                          {p.staffType || '교사'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => handleDeletePreApproved(p.id, p.name || p.email)}
                          style={styles.rejectBtn}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}

const styles = {
  heading: { fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.25rem' },
  tabs: { display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '2px solid #eee' },
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
  textarea: { width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '0.75rem' },
  infoBox: { backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.88rem', color: '#1e40af', marginBottom: '1.25rem', lineHeight: 1.6 },
}
