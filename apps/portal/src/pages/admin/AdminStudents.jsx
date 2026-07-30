import { useEffect, useState } from 'react'
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'

export default function AdminStudents() {
  const { schoolId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [studentList, setStudentList] = useState([])
  const [studentSearch, setStudentSearch] = useState('')

  useEffect(() => {
    if (!schoolId) return
    fetchStudents()
  }, [schoolId])

  const fetchStudents = async () => {
    if (!schoolId) return
    setLoading(true)
    const snap = await getDocs(collection(db, 'schools', schoolId, 'students'))
    setStudentList(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.studentId || '').localeCompare(b.studentId || ''))
    )
    setLoading(false)
  }

  const editStudentName = async (studentId, currentName) => {
    const newName = window.prompt('이름을 수정하세요:', currentName || '')
    if (newName === null) return
    const trimmed = newName.trim()
    if (!trimmed || trimmed === currentName) return
    // nameEditedManually: true — 다음 Workspace 동기화가 이 이름을 되돌리지 않도록 표시
    await updateDoc(doc(db, 'schools', schoolId, 'students', studentId), { name: trimmed, nameEditedManually: true })
    setStudentList(prev => prev.map(s => s.id === studentId ? { ...s, name: trimmed, nameEditedManually: true } : s))
  }

  const deleteStudent = async (studentId, name) => {
    if (!window.confirm(`${name}님을 학생 명단에서 삭제하시겠습니까?\n\nWorkspace 동기화가 켜져 있으면 다음 동기화 때 다시 추가될 수 있습니다.`)) return
    await deleteDoc(doc(db, 'schools', schoolId, 'students', studentId))
    setStudentList(prev => prev.filter(s => s.id !== studentId))
  }

  const filteredStudents = studentList.filter(s => {
    if (!studentSearch.trim()) return true
    const q = studentSearch.trim().toLowerCase()
    return (s.name || '').toLowerCase().includes(q) ||
      (s.studentId || '').includes(q) ||
      (s.email || '').toLowerCase().includes(q)
  })

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={3}>
        학생 관리
      </Typography>

      <Box sx={{ mb: 3 }}>
        <TextField
          value={studentSearch}
          onChange={e => setStudentSearch(e.target.value)}
          placeholder="이름·학번·이메일 검색"
          size="small"
          sx={{ maxWidth: 300 }}
        />
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : studentList.length === 0 ? (
        <Alert severity="info">
          등록된 학생이 없습니다. Workspace 동기화를 사용 중이면 계정 관리 탭에서 동기화를 실행해보세요.
        </Alert>
      ) : filteredStudents.length === 0 ? (
        <Typography color="text.secondary">검색 결과가 없습니다.</Typography>
      ) : (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>학년</th>
                <th style={styles.th}>반</th>
                <th style={styles.th}>번호</th>
                <th style={styles.th}>이름</th>
                <th style={styles.th}>학번</th>
                <th style={styles.th}>이메일</th>
                <th style={styles.th}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(s => (
                <tr key={s.id}>
                  <td style={styles.td}>{s.grade ?? '—'}</td>
                  <td style={styles.td}>{s.class ?? '—'}</td>
                  <td style={styles.td}>{s.number ?? '—'}</td>
                  <td style={styles.td}>
                    {s.name || '—'}
                    <button onClick={() => editStudentName(s.id, s.name || '')} style={styles.editNameBtn} title="이름 수정">✏️</button>
                  </td>
                  <td style={styles.td}>{s.studentId}</td>
                  <td style={styles.td}>{s.email || '—'}</td>
                  <td style={styles.td}>
                    <button onClick={() => deleteStudent(s.id, s.name || s.studentId)} style={styles.rejectBtn}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            총 {studentList.length}명{studentSearch.trim() && ` · 검색결과 ${filteredStudents.length}명`}
          </Typography>
        </>
      )}
    </Box>
  )
}

const styles = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '0.6rem 0.8rem', backgroundColor: '#f0f0f0', fontSize: '0.85rem', fontWeight: 600 },
  td: { padding: '0.6rem 0.8rem', borderBottom: '1px solid #eee', fontSize: '0.9rem', verticalAlign: 'middle' },
  rejectBtn: { padding: '0.3rem 0.75rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  editNameBtn: { marginLeft: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', padding: '0 2px', opacity: 0.45, verticalAlign: 'middle' },
}
