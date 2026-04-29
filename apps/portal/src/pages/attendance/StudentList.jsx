import { useState, useEffect } from 'react'
import { collection, getDocs, setDoc, addDoc, doc, getDoc, where, query, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import StudentHistoryModal from '../../components/StudentHistoryModal'

const SCHOOL_DOMAIN = 'seonyoo.hs.kr'

export default function StudentList() {
  const { schoolId, user, role } = useAuth()

  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [expandedGroupId, setExpandedGroupId] = useState(null)
  const [groupStudentsMap, setGroupStudentsMap] = useState({})

  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [addStudentDraft, setAddStudentDraft] = useState({})
  const [groupCsvAdding, setGroupCsvAdding] = useState({})
  const [historyStudent, setHistoryStudent] = useState(null)

  const [groupName, setGroupName] = useState('')
  const [preview, setPreview] = useState([])
  const [parseError, setParseError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)

  const [teachers, setTeachers] = useState([])
  const [assignedTeacher, setAssignedTeacher] = useState('')
  const [isShared, setIsShared] = useState(false)

  const fetchGroups = async () => {
    setLoadingGroups(true)
    try {
      const q = role === 'school_admin'
        ? query(collection(db, 'schools', schoolId, 'studentGroups'))
        : query(collection(db, 'schools', schoolId, 'studentGroups'), where('createdBy', '==', user.uid))
      const snap = await getDocs(q)
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() ?? new Date(a.createdAt)
        const bTime = b.createdAt?.toDate?.() ?? new Date(b.createdAt)
        return bTime - aTime
      })
      setGroups(list)
    } catch (err) {
      console.error('그룹 목록 불러오기 오류:', err)
    } finally {
      setLoadingGroups(false)
    }
  }

  useEffect(() => { if (schoolId && user) fetchGroups() }, [schoolId, user, role])

  useEffect(() => {
    if (role !== 'school_admin') return
    const load = async () => {
      const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['teacher', 'admin', 'school_admin'])))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const aId = (a.email || '').split('@')[0].toLowerCase()
        const bId = (b.email || '').split('@')[0].toLowerCase()
        return aId.localeCompare(bId)
      })
      setTeachers(list)
    }
    load()
  }, [role])

  const handleToggleGroup = async (group) => {
    if (expandedGroupId === group.id) {
      setExpandedGroupId(null)
      return
    }
    setExpandedGroupId(group.id)

    if (groupStudentsMap[group.id]) return

    try {
      const studentIds = group.studentIds || []
      if (studentIds.length === 0) {
        setGroupStudentsMap(prev => ({ ...prev, [group.id]: [] }))
        return
      }
      const snap = await getDocs(collection(db, 'schools', schoolId, 'students'))
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const filtered = all
        .filter(s => studentIds.includes(s.studentId))
        .sort((a, b) => {
          if (a.grade !== b.grade) return a.grade - b.grade
          if (a.class !== b.class) return a.class - b.class
          return a.number - b.number
        })
      setGroupStudentsMap(prev => ({ ...prev, [group.id]: filtered }))
    } catch (err) {
      console.error('그룹 학생 불러오기 오류:', err)
    }
  }

  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return { error: '데이터가 없습니다.' }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

    const find = (test) => headers.findIndex(test)
    const gradeCol  = find(h => h.includes('학년') && !h.includes('학년도'))
    const classCol  = find(h => h === '반' || (h.includes('반') && !h.includes('학반')))
    const numberCol = find(h => h.includes('번호') || h === '번')
    const nameCol   = find(h => h.includes('성명') || h.includes('이름'))
    const yearCol   = find(h => h.includes('학년도') || h === '년도')

    if (gradeCol < 0 || classCol < 0 || numberCol < 0 || nameCol < 0) {
      const missing = [
        gradeCol < 0 && '학년',
        classCol < 0 && '반',
        numberCol < 0 && '번호',
        nameCol < 0 && '성명',
      ].filter(Boolean).join(', ')
      return { error: `필수 컬럼을 찾을 수 없습니다: ${missing}` }
    }

    const currentYear = new Date().getFullYear()

    const rows = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/"/g, ''))
      const grade = parseInt(cols[gradeCol])
      const cls   = parseInt(cols[classCol])
      const num   = parseInt(cols[numberCol])
      const name  = cols[nameCol]
      const year  = yearCol >= 0 ? parseInt(cols[yearCol]) || currentYear : currentYear

      if (!grade || !cls || !num || !name) return null

      const studentId = `${grade}${String(cls).padStart(2, '0')}${String(num).padStart(2, '0')}`
      const email = `${year}${studentId}@${SCHOOL_DOMAIN}`

      return { studentId, year, grade, class: cls, number: num, name, email }
    }).filter(Boolean)

    return { rows }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadResult(null)
    setParseError('')
    setPreview([])

    const fileBaseName = file.name.replace(/\.csv$/i, '')
    if (!groupName.trim()) setGroupName(fileBaseName)

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = parseCSV(event.target.result)
      if (result.error) {
        setParseError(result.error)
      } else {
        setPreview(result.rows)
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleSave = async () => {
    if (!preview.length) return
    if (!groupName.trim()) {
      alert('그룹 이름을 입력해주세요.')
      return
    }
    setUploading(true)
    setUploadResult(null)
    try {
      await Promise.all(preview.map(student =>
        setDoc(
          doc(db, 'schools', schoolId, 'students', student.studentId),
          student,
          { merge: true }
        )
      ))

      const studentIds = preview.map(s => s.studentId)
      const isAdminShared = role === 'school_admin' && isShared
      const ownerUid = (!isAdminShared && role === 'school_admin' && assignedTeacher) ? assignedTeacher : user.uid
      const selectedTeacher = assignedTeacher ? teachers.find(t => t.id === assignedTeacher) : null

      await addDoc(collection(db, 'schools', schoolId, 'studentGroups'), {
        name: groupName.trim(),
        studentIds,
        shared: isAdminShared,
        createdBy: ownerUid,
        ...(isAdminShared && selectedTeacher && { mainTeacherUid: selectedTeacher.id, mainTeacherName: selectedTeacher.name }),
        ...(!isAdminShared && selectedTeacher && { assignedTeacherName: selectedTeacher.name }),
        createdAt: new Date(),
      })

      setUploadResult({ success: true, count: preview.length })
      setPreview([])
      setGroupName('')
      setAssignedTeacher('')
      setIsShared(false)
      await fetchGroups()
    } catch (err) {
      setUploadResult({ success: false, message: err.message })
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('이 그룹을 삭제하시겠습니까? (학생 데이터는 유지됩니다)')) return
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'studentGroups', groupId))
      setGroups(prev => prev.filter(g => g.id !== groupId))
      if (expandedGroupId === groupId) setExpandedGroupId(null)
    } catch (err) {
      alert('삭제 오류: ' + err.message)
    }
  }

  const handleRenameGroup = async (group) => {
    const newName = editingGroupName.trim()
    if (!newName || newName === group.name) { setEditingGroupId(null); return }
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'studentGroups', group.id), { name: newName })
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: newName } : g))
      setEditingGroupId(null)
    } catch (err) {
      alert('이름 변경 오류: ' + err.message)
    }
  }

  const handleRemoveStudent = async (group, studentId) => {
    const newStudentIds = (group.studentIds || []).filter(id => id !== studentId)
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'studentGroups', group.id), { studentIds: newStudentIds })
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, studentIds: newStudentIds } : g))
      setGroupStudentsMap(prev => ({
        ...prev,
        [group.id]: (prev[group.id] || []).filter(s => s.studentId !== studentId),
      }))
    } catch (err) {
      alert('학생 제거 오류: ' + err.message)
    }
  }

  const parseStudentId = (sid) => ({
    grade:  parseInt(sid[0]),
    class:  parseInt(sid.slice(1, 3)),
    number: parseInt(sid.slice(3, 5)),
  })

  const addStudentsToGroup = async (group, students) => {
    const existing = group.studentIds || []
    const newOnes = students.filter(s => !existing.includes(s.studentId))
    if (newOnes.length === 0) { alert('모두 이미 그룹에 포함된 학생입니다.'); return }

    await Promise.all(newOnes.map(s =>
      setDoc(doc(db, 'schools', schoolId, 'students', s.studentId), s, { merge: true })
    ))
    const newStudentIds = [...existing, ...newOnes.map(s => s.studentId)]
    await updateDoc(doc(db, 'schools', schoolId, 'studentGroups', group.id), { studentIds: newStudentIds })
    setGroups(prev => prev.map(g => g.id === group.id ? { ...g, studentIds: newStudentIds } : g))
    setGroupStudentsMap(prev => ({
      ...prev,
      [group.id]: [...(prev[group.id] || []), ...newOnes.map(s => ({ id: s.studentId, ...s }))]
        .sort((a, b) => a.grade - b.grade || a.class - b.class || a.number - b.number),
    }))
  }

  const handleAddStudent = async (group) => {
    const draft = addStudentDraft[group.id] || {}
    const sid  = (draft.sid  || '').trim()
    const name = (draft.name || '').trim()
    if (!sid || !name) { alert('학번과 이름을 모두 입력해주세요.'); return }
    if (!/^\d{5}$/.test(sid)) { alert('학번은 5자리 숫자로 입력해주세요.'); return }

    const { grade, class: cls, number } = parseStudentId(sid)
    const email = `${new Date().getFullYear()}${sid}@${SCHOOL_DOMAIN}`
    const studentData = { studentId: sid, name, grade, class: cls, number, email }

    try {
      await addStudentsToGroup(group, [studentData])
      setAddStudentDraft(prev => ({ ...prev, [group.id]: { sid: '', name: '' } }))
    } catch (err) {
      alert('학생 추가 오류: ' + err.message)
    }
  }

  const handleGroupCsvAdd = (group, file) => {
    if (!file) return
    setGroupCsvAdding(prev => ({ ...prev, [group.id]: true }))
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const result = parseCSV(e.target.result)
        if (result.error) { alert('CSV 오류: ' + result.error); return }
        await addStudentsToGroup(group, result.rows)
        alert(`${result.rows.length}명 추가 완료`)
      } catch (err) {
        alert('CSV 추가 오류: ' + err.message)
      } finally {
        setGroupCsvAdding(prev => ({ ...prev, [group.id]: false }))
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const formatDate = (createdAt) => {
    if (!createdAt) return '-'
    const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt)
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  return (
    <Layout>
      <h2 style={styles.heading}>학생 명단 관리</h2>

      <section style={styles.section}>
        <h3 style={styles.subHeading}>
          학생 그룹 목록
          {!loadingGroups && <span style={styles.countBadge}>{groups.length}개</span>}
        </h3>

        {loadingGroups ? (
          <p style={styles.muted}>불러오는 중...</p>
        ) : groups.length === 0 ? (
          <p style={styles.empty}>등록된 그룹이 없습니다.</p>
        ) : (
          <div style={styles.groupList}>
            {groups.map(group => (
              <div key={group.id} style={styles.groupCard}>
                <div style={styles.groupRow}>
                  <div style={styles.groupInfo}>
                    {editingGroupId === group.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          value={editingGroupName}
                          onChange={e => setEditingGroupName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRenameGroup(group) }}
                          style={{ ...styles.textInput, minWidth: 0, flex: 1 }}
                          autoFocus
                        />
                        <button onClick={() => handleRenameGroup(group)} style={styles.saveSmallBtn}>저장</button>
                        <button onClick={() => setEditingGroupId(null)} style={styles.cancelSmallBtn}>취소</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={styles.groupName}>{group.name}</span>
                        <button
                          onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name) }}
                          style={styles.editNameBtn}
                          title="이름 변경"
                        >✏️</button>
                      </div>
                    )}
                    <span style={styles.groupMeta}>
                      학생 {(group.studentIds || []).length}명 · {formatDate(group.createdAt)}
                      {group.shared && <span style={styles.sharedBadge}>공유</span>}
                      {(group.mainTeacherName || (role === 'school_admin' && group.assignedTeacherName)) && (
                        <span style={styles.teacherTag}>👤 {group.mainTeacherName || group.assignedTeacherName}</span>
                      )}
                    </span>
                  </div>
                  <div style={styles.groupActions}>
                    <button style={styles.detailBtn} onClick={() => handleToggleGroup(group)}>
                      {expandedGroupId === group.id ? '접기' : '상세보기'}
                    </button>
                    <button style={styles.deleteBtn} onClick={() => handleDeleteGroup(group.id)}>
                      삭제
                    </button>
                  </div>
                </div>

                {expandedGroupId === group.id && (
                  <div style={styles.groupDetail}>
                    <div style={styles.addStudentRow}>
                      <input
                        value={(addStudentDraft[group.id] || {}).sid || ''}
                        onChange={e => setAddStudentDraft(prev => ({ ...prev, [group.id]: { ...(prev[group.id] || {}), sid: e.target.value } }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddStudent(group) }}
                        placeholder="학번 (5자리)"
                        maxLength={5}
                        style={{ ...styles.textInput, width: '90px' }}
                      />
                      <input
                        value={(addStudentDraft[group.id] || {}).name || ''}
                        onChange={e => setAddStudentDraft(prev => ({ ...prev, [group.id]: { ...(prev[group.id] || {}), name: e.target.value } }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddStudent(group) }}
                        placeholder="이름"
                        style={{ ...styles.textInput, flex: 1, minWidth: 0 }}
                      />
                      <button onClick={() => handleAddStudent(group)} style={styles.addStudentBtn}>추가</button>
                      <label style={styles.csvAddBtn}>
                        {groupCsvAdding[group.id] ? '추가 중...' : 'CSV'}
                        <input
                          type="file" accept=".csv" hidden
                          onChange={e => { handleGroupCsvAdd(group, e.target.files[0]); e.target.value = '' }}
                          disabled={groupCsvAdding[group.id]}
                        />
                      </label>
                    </div>
                    {groupStudentsMap[group.id] === undefined ? (
                      <p style={styles.muted}>불러오는 중...</p>
                    ) : groupStudentsMap[group.id].length === 0 ? (
                      <p style={styles.empty}>학생 데이터가 없습니다.</p>
                    ) : (
                      <StudentTable
                        students={groupStudentsMap[group.id]}
                        onRemove={(sid) => handleRemoveStudent(group, sid)}
                        onHistory={(student) => setHistoryStudent(student)}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <h3 style={styles.subHeading}>새 그룹 만들기</h3>

        <div style={styles.uploadBox}>
          <div style={styles.fieldRow}>
            <label style={styles.fieldLabel}>그룹 이름</label>
            <input
              type="text"
              placeholder="예: 물리학Ⅱ-A반 2026"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              style={styles.textInput}
            />
          </div>

          {role === 'school_admin' && (
            <>
              <div style={styles.fieldRow}>
                <label style={styles.fieldLabel}>공유 그룹</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={e => { setIsShared(e.target.checked); setAssignedTeacher('') }}
                  />
                  <span style={{ fontSize: '0.88rem', color: '#555' }}>
                    모든 교사가 이벤트에서 선택 가능한 공유 그룹으로 만들기
                  </span>
                </label>
              </div>
              <div style={styles.fieldRow}>
                <label style={styles.fieldLabel}>
                  {isShared ? '메인 담당교사' : '담당 교사'}
                </label>
                <select
                  value={assignedTeacher}
                  onChange={e => setAssignedTeacher(e.target.value)}
                  style={{ ...styles.textInput, flex: 1 }}
                >
                  <option value="">{isShared ? '선택 안 함 (선택 사항)' : '본인(학교관리자)에게 귀속'}</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            <p style={styles.uploadHint}>
              CSV 파일 (UTF-8) — <strong>학년, 반, 번호, 성명</strong> 컬럼이 포함되면 나머지 컬럼은 무관합니다.<br />
              학번과 이메일은 자동으로 생성됩니다.
            </p>
            <input type="file" accept=".csv" onChange={handleFileChange} />
          </div>
          {parseError && <p style={styles.errorMsg}>{parseError}</p>}
        </div>

        {preview.length > 0 && (
          <div style={styles.previewBox}>
            <div style={styles.previewHeader}>
              <span>미리보기 — {preview.length}명</span>
              <button onClick={handleSave} disabled={uploading} style={styles.saveBtn}>
                {uploading ? '저장 중...' : `저장 (${preview.length}명)`}
              </button>
            </div>
            <StudentTable students={preview} />
          </div>
        )}

        {uploadResult && (
          <p style={uploadResult.success ? styles.successMsg : styles.errorMsg}>
            {uploadResult.success
              ? `저장 완료: ${uploadResult.count}명이 학생 레지스트리에 등록되고 그룹이 생성되었습니다.`
              : `오류: ${uploadResult.message}`}
          </p>
        )}
      </section>
      {historyStudent && (
        <StudentHistoryModal
          student={historyStudent}
          schoolId={schoolId}
          onClose={() => setHistoryStudent(null)}
        />
      )}
    </Layout>
  )
}

function StudentTable({ students, onRemove, onHistory }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={styles.table}>
        <thead>
          <tr>
            {['학번', '학년', '반', '번호', '이름', '이메일', ...(onRemove ? [''] : []), ''].map((h, i) => (
              <th key={i} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.studentId || i}>
              <td style={styles.td}>{s.studentId}</td>
              <td style={styles.td}>{s.grade}학년</td>
              <td style={styles.td}>{s.class}반</td>
              <td style={styles.td}>{s.number}번</td>
              <td style={styles.td}>{s.name}</td>
              <td style={{ ...styles.td, fontSize: '0.8rem', color: '#555' }}>{s.email}</td>
              {onRemove && (
                <td style={styles.td}>
                  <button onClick={() => onRemove(s.studentId)} style={styles.removeStudentBtn}>제거</button>
                </td>
              )}
              <td style={styles.td}>
                <button onClick={() => onHistory?.(s)} style={styles.historyBtn}>이력</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const styles = {
  heading:      { fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem' },
  subHeading:   { fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  section:      { marginBottom: '2.5rem' },
  countBadge:   { fontSize: '0.8rem', fontWeight: 500, backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '0.15rem 0.55rem', borderRadius: '999px' },
  muted:        { color: '#888', fontSize: '0.9rem' },
  empty:        { color: '#aaa', fontSize: '0.9rem' },
  groupList:    { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  groupCard:    { border: '1px solid #e0e0e0', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#fff' },
  groupRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem' },
  groupInfo:    { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  groupName:    { fontWeight: 600, fontSize: '0.95rem' },
  groupMeta:    { fontSize: '0.8rem', color: '#777', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  teacherTag:   { fontSize: '0.75rem', color: '#7b1fa2', backgroundColor: '#f3e5f5', padding: '0.1rem 0.45rem', borderRadius: '999px' },
  sharedBadge:  { fontSize: '0.75rem', color: '#1565c0', backgroundColor: '#e3f2fd', padding: '0.1rem 0.45rem', borderRadius: '999px', fontWeight: 600 },
  groupActions: { display: 'flex', gap: '0.5rem' },
  detailBtn:    { padding: '0.35rem 0.85rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  deleteBtn:    { padding: '0.35rem 0.75rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' },
  groupDetail:  { borderTop: '1px solid #eee', padding: '0.75rem 1rem', backgroundColor: '#fafafa' },
  editNameBtn:  { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.1rem', opacity: 0.6 },
  saveSmallBtn: { padding: '0.25rem 0.6rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' },
  cancelSmallBtn: { padding: '0.25rem 0.6rem', backgroundColor: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' },
  addStudentRow:  { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' },
  addStudentBtn:  { padding: '0.35rem 0.75rem', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' },
  csvAddBtn:      { padding: '0.35rem 0.75rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' },
  removeStudentBtn: { padding: '0.15rem 0.5rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' },
  historyBtn: { padding: '0.15rem 0.5rem', backgroundColor: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' },
  uploadBox:    { border: '2px dashed #ccc', borderRadius: '10px', padding: '1.5rem', backgroundColor: '#fafafa', marginBottom: '1rem' },
  fieldRow:     { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' },
  fieldLabel:   { fontSize: '0.85rem', fontWeight: 600, minWidth: '70px' },
  textInput:    { flex: 1, minWidth: '200px', padding: '0.45rem 0.75rem', border: '1px solid #ccc', borderRadius: '7px', fontSize: '0.9rem', outline: 'none' },
  uploadHint:   { color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' },
  previewBox:    { border: '1px solid #1a73e8', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', backgroundColor: '#f0f7ff' },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontWeight: 600 },
  saveBtn:       { padding: '0.45rem 1rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 },
  successMsg:    { color: '#2e7d32', fontWeight: 600, marginTop: '0.5rem' },
  errorMsg:      { color: '#d32f2f', fontWeight: 600, marginTop: '0.5rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th:    { textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: '#f0f0f0', fontWeight: 600, fontSize: '0.85rem' },
  td:    { padding: '0.5rem 0.75rem', borderBottom: '1px solid #eee' },
}
