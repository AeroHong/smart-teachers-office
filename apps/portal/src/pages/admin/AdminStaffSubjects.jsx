import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import Chip from '@mui/material/Chip'

export default function AdminStaffSubjects({ schoolId, assignmentYear }) {
  const [loading, setLoading] = useState(true)
  const [teachers, setTeachers] = useState([]) // 전체 교사 목록
  const [subjectAssignments, setSubjectAssignments] = useState([]) // 과목 배정 목록

  // 편집
  const [editingSubject, setEditingSubject] = useState(null)
  const [savingSubject, setSavingSubject] = useState(false)

  // CSV 업로드
  const [parsedRows, setParsedRows] = useState([])
  const [uploadMsg, setUploadMsg] = useState('')
  const [savingUpload, setSavingUpload] = useState(false)

  // ASA 가져오기
  const [asaDialogOpen, setAsaDialogOpen] = useState(false)
  const [asaSemester, setAsaSemester] = useState(1)
  const [asaImporting, setAsaImporting] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    fetchData()
  }, [schoolId, assignmentYear])

  const fetchData = async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      // 1. 기본 배정에서 교사 목록 가져오기 (users 컬렉션에서)
      const usersSnap = await getDocs(query(
        collection(db, 'users'),
        where('schoolId', '==', schoolId)
      ))

      // role 필터링은 클라이언트에서 수행
      const teacherList = usersSnap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => ['teacher', 'admin', 'school_admin', 'principal'].includes(u.role))
        .map(u => ({ uid: u.uid, name: u.name, email: u.email }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
      setTeachers(teacherList)

      // 2. 과목 배정 데이터 (학기 통합)
      const subjectsSnap = await getDocs(query(
        collection(db, 'schools', schoolId, 'teacherSubjects'),
        where('year', '==', assignmentYear)
      ))
      const assignmentsMap = new Map()
      subjectsSnap.docs.forEach(d => {
        assignmentsMap.set(d.data().teacherUid, { id: d.id, ...d.data() })
      })

      // 3. 모든 교사에 대해 과목 배정 데이터 생성 (없으면 빈 데이터)
      const assignments = teacherList.map(teacher => {
        const existing = assignmentsMap.get(teacher.uid)
        if (existing) {
          return existing
        } else {
          return {
            id: `${assignmentYear}_${teacher.uid}`,
            year: assignmentYear,
            teacherUid: teacher.uid,
            teacherName: teacher.name,
            semester1Subjects: [],
            semester2Subjects: []
          }
        }
      })

      setSubjectAssignments(assignments)
    } catch (err) {
      console.error('데이터 로딩 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const openEditDialog = (assignment) => {
    setEditingSubject({
      id: assignment.id,
      teacherUid: assignment.teacherUid,
      teacherName: assignment.teacherName,
      semester1Subjects: assignment.semester1Subjects || [],
      semester2Subjects: assignment.semester2Subjects || []
    })
  }

  const addSubjectRow = (semester) => {
    if (!editingSubject) return
    const field = semester === 1 ? 'semester1Subjects' : 'semester2Subjects'
    setEditingSubject(prev => ({
      ...prev,
      [field]: [
        ...prev[field],
        { subjectCode: '', subjectName: '', grade: '', classes: [], studentRange: '', hoursPerWeek: '' }
      ]
    }))
  }

  const updateSubjectRow = (semester, index, field, value) => {
    if (!editingSubject) return
    const arrayField = semester === 1 ? 'semester1Subjects' : 'semester2Subjects'
    setEditingSubject(prev => ({
      ...prev,
      [arrayField]: prev[arrayField].map((s, i) => i === index ? { ...s, [field]: value } : s)
    }))
  }

  const removeSubjectRow = (semester, index) => {
    if (!editingSubject) return
    const arrayField = semester === 1 ? 'semester1Subjects' : 'semester2Subjects'
    setEditingSubject(prev => ({
      ...prev,
      [arrayField]: prev[arrayField].filter((_, i) => i !== index)
    }))
  }

  const saveSubjectAssignment = async () => {
    if (!editingSubject || !editingSubject.teacherUid) return
    setSavingSubject(true)
    try {
      const docId = `${assignmentYear}_${editingSubject.teacherUid}`
      const teacher = teachers.find(t => t.uid === editingSubject.teacherUid)

      // 유효성 검사
      const validSem1 = editingSubject.semester1Subjects.filter(s =>
        s.subjectName && s.grade && s.classes.length > 0
      ).map(s => ({
        subjectCode: s.subjectCode || '',
        subjectName: s.subjectName,
        grade: Number(s.grade),
        classes: s.classes.map(c => Number(c)),
        studentRange: s.studentRange || '',
        hoursPerWeek: Number(s.hoursPerWeek) || 0
      }))

      const validSem2 = editingSubject.semester2Subjects.filter(s =>
        s.subjectName && s.grade && s.classes.length > 0
      ).map(s => ({
        subjectCode: s.subjectCode || '',
        subjectName: s.subjectName,
        grade: Number(s.grade),
        classes: s.classes.map(c => Number(c)),
        studentRange: s.studentRange || '',
        hoursPerWeek: Number(s.hoursPerWeek) || 0
      }))

      await setDoc(doc(db, 'schools', schoolId, 'teacherSubjects', docId), {
        year: assignmentYear,
        teacherUid: editingSubject.teacherUid,
        teacherName: teacher?.name || '',
        semester1Subjects: validSem1,
        semester2Subjects: validSem2,
        updatedAt: serverTimestamp()
      })

      setEditingSubject(null)
      await fetchData()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSavingSubject(false)
    }
  }

  const deleteAssignment = async (assignment) => {
    if (!confirm(`${assignment.teacherName}의 과목 배정을 삭제하시겠습니까?`)) return
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'teacherSubjects', assignment.id))
      await fetchData()
    } catch (err) {
      alert('삭제 실패: ' + err.message)
    }
  }

  // ASA(성취평가제)에서 가져오기
  const importFromASA = async () => {
    setAsaImporting(true)
    try {
      const snap = await getDocs(collection(db, 'schools', schoolId, 'asaSubjects'))
      const subjectsByEmail = {}

      snap.docs.forEach(d => {
        const data = d.data()
        const subjectInfo = {
          subjectCode: data.code || '',
          subjectName: data.name || '',
          grade: data.grade || 0,
          classes: data.classes || [],
          studentRange: '',
          hoursPerWeek: 0
        }

        ;(data.teacherEmails || []).forEach(email => {
          const key = email.toLowerCase()
          if (!subjectsByEmail[key]) subjectsByEmail[key] = []
          subjectsByEmail[key].push(subjectInfo)
        })
      })

      const emailToTeacher = {}
      teachers.forEach(t => { if (t.email) emailToTeacher[t.email.toLowerCase()] = t })

      let imported = 0
      await Promise.all(Object.entries(subjectsByEmail).map(async ([email, subjects]) => {
        const teacher = emailToTeacher[email]
        if (!teacher) return

        const docId = `${assignmentYear}_${teacher.uid}`
        const existing = subjectAssignments.find(a => a.id === docId)

        const field = asaSemester === 1 ? 'semester1Subjects' : 'semester2Subjects'
        const otherField = asaSemester === 1 ? 'semester2Subjects' : 'semester1Subjects'

        await setDoc(doc(db, 'schools', schoolId, 'teacherSubjects', docId), {
          year: assignmentYear,
          teacherUid: teacher.uid,
          teacherName: teacher.name,
          [field]: subjects,
          [otherField]: existing?.[otherField] || [],
          updatedAt: serverTimestamp()
        })
        imported++
      }))

      alert(`✅ ${imported}명의 ${asaSemester}학기 과목을 ASA에서 가져왔습니다.`)
      setAsaDialogOpen(false)
      await fetchData()
    } catch (err) {
      alert('ASA 가져오기 실패: ' + err.message)
    } finally {
      setAsaImporting(false)
    }
  }

  const downloadCsv = () => {
    const csvCell = (v) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }

    const header = ['이메일', '이름', '학기', '과목코드', '과목명', '학년', '반(쉼표구분)', '학생범위', '시수']
    const rows = []

    subjectAssignments.forEach(assignment => {
      const email = teachers.find(t => t.uid === assignment.teacherUid)?.email || ''
      const name = assignment.teacherName

      ;(assignment.semester1Subjects || []).forEach(subject => {
        rows.push([
          email, name, 1,
          subject.subjectCode || '',
          subject.subjectName || '',
          subject.grade || '',
          subject.classes?.join(',') || '',
          subject.studentRange || '',
          subject.hoursPerWeek || ''
        ].map(csvCell).join(','))
      })

      ;(assignment.semester2Subjects || []).forEach(subject => {
        rows.push([
          email, name, 2,
          subject.subjectCode || '',
          subject.subjectName || '',
          subject.grade || '',
          subject.classes?.join(',') || '',
          subject.studentRange || '',
          subject.hoursPerWeek || ''
        ].map(csvCell).join(','))
      })
    })

    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `과목배정_${assignmentYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const parseCsvRows = (text) => {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return null
    const delim = lines[0].includes('\t') ? '\t' : ','
    const headers = lines[0].split(delim).map(h => h.trim().toLowerCase())

    const findIdx = (names) => headers.findIndex(h => names.includes(h))
    const emailIdx = findIdx(['이메일', 'email'])
    const semesterIdx = findIdx(['학기', 'semester'])
    const codeIdx = findIdx(['과목코드', 'code'])
    const nameIdx = findIdx(['과목명', '과목', 'subject'])
    const gradeIdx = findIdx(['학년', 'grade'])
    const classIdx = findIdx(['반', 'class', '반(쉼표구분)'])
    const rangeIdx = findIdx(['학생범위', 'range', 'studentrange'])
    const hoursIdx = findIdx(['시수', 'hours'])

    if (emailIdx === -1 || nameIdx === -1) return null

    return lines.slice(1).map(line => {
      const cols = line.split(delim).map(v => v.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'))
      return {
        email: (cols[emailIdx] || '').toLowerCase(),
        semester: semesterIdx !== -1 ? Number(cols[semesterIdx]) || 1 : 1,
        subjectCode: codeIdx !== -1 ? cols[codeIdx] || '' : '',
        subjectName: cols[nameIdx] || '',
        grade: gradeIdx !== -1 ? cols[gradeIdx] : '',
        classes: classIdx !== -1 ? (cols[classIdx] || '').split(',').map(c => c.trim()).filter(Boolean) : [],
        studentRange: rangeIdx !== -1 ? cols[rangeIdx] || '' : '',
        hoursPerWeek: hoursIdx !== -1 ? Number(cols[hoursIdx]) || 0 : 0
      }
    }).filter(r => r.email && r.subjectName && r.grade && r.classes.length > 0)
  }

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    try {
      const text = await file.text()
      const rows = parseCsvRows(text)
      if (!rows) {
        setUploadMsg('CSV 헤더에 "이메일"과 "과목명" 열이 필요합니다.')
        return
      }
      if (rows.length === 0) {
        setUploadMsg('유효한 데이터가 없습니다.')
        return
      }
      setParsedRows(rows)
      setUploadMsg('')
    } catch (err) {
      setUploadMsg('파일 읽기 실패: ' + err.message)
    }
  }

  const saveCsvUpload = async () => {
    if (parsedRows.length === 0) return
    setSavingUpload(true)
    setUploadMsg('')

    try {
      const emailToTeacher = {}
      teachers.forEach(t => { if (t.email) emailToTeacher[t.email.toLowerCase()] = t })

      // 교사별, 학기별로 그룹화
      const byTeacher = {}
      parsedRows.forEach(row => {
        const teacher = emailToTeacher[row.email]
        if (!teacher) return

        if (!byTeacher[teacher.uid]) {
          byTeacher[teacher.uid] = {
            teacherUid: teacher.uid,
            teacherName: teacher.name,
            semester1Subjects: [],
            semester2Subjects: []
          }
        }

        const subject = {
          subjectCode: row.subjectCode,
          subjectName: row.subjectName,
          grade: Number(row.grade),
          classes: row.classes.map(c => Number(c)),
          studentRange: row.studentRange,
          hoursPerWeek: row.hoursPerWeek
        }

        if (row.semester === 1) {
          byTeacher[teacher.uid].semester1Subjects.push(subject)
        } else {
          byTeacher[teacher.uid].semester2Subjects.push(subject)
        }
      })

      // 저장
      let saved = 0
      await Promise.all(Object.entries(byTeacher).map(async ([uid, data]) => {
        const docId = `${assignmentYear}_${uid}`
        await setDoc(doc(db, 'schools', schoolId, 'teacherSubjects', docId), {
          year: assignmentYear,
          ...data,
          updatedAt: serverTimestamp()
        })
        saved++
      }))

      setUploadMsg(`✅ ${saved}명의 과목 배정을 저장했습니다.`)
      setParsedRows([])
      await fetchData()
    } catch (err) {
      setUploadMsg('저장 실패: ' + err.message)
    } finally {
      setSavingUpload(false)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={downloadCsv} disabled={subjectAssignments.length === 0}>
          CSV 다운로드
        </Button>

        <Button variant="outlined" component="label">
          CSV 업로드
          <input type="file" accept=".csv" hidden onChange={handleCsvUpload} />
        </Button>

        <Button variant="outlined" onClick={() => setAsaDialogOpen(true)}>
          성취평가제에서 가져오기
        </Button>
      </Box>

      {uploadMsg && (
        <Alert severity={uploadMsg.includes('✅') ? 'success' : 'error'} sx={{ mb: 2 }}>
          {uploadMsg}
        </Alert>
      )}

      {parsedRows.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" mb={1}>
            {parsedRows.length}건 확인됨 — 저장하면 즉시 반영됩니다.
          </Typography>
          <Button variant="contained" onClick={saveCsvUpload} disabled={savingUpload}>
            {savingUpload ? '저장 중...' : `${parsedRows.length}건 저장`}
          </Button>
        </Box>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>교사명</th>
                <th style={styles.th}>1학기 과목</th>
                <th style={styles.th}>2학기 과목</th>
                <th style={styles.th}>작업</th>
              </tr>
            </thead>
            <tbody>
              {subjectAssignments.map(assignment => {
                const sem1Total = (assignment.semester1Subjects || []).reduce((sum, s) => sum + (s.hoursPerWeek || 0), 0)
                const sem2Total = (assignment.semester2Subjects || []).reduce((sum, s) => sum + (s.hoursPerWeek || 0), 0)

                return (
                  <tr key={assignment.id}>
                    <td style={styles.td}>{assignment.teacherName}</td>
                    <td style={styles.td}>
                      {(assignment.semester1Subjects || []).length > 0 ? (
                        <Box>
                          {assignment.semester1Subjects.map((subject, idx) => (
                            <Chip
                              key={idx}
                              label={`${subject.subjectName} (${subject.grade}-${subject.classes.join(',')}) ${subject.hoursPerWeek}시간`}
                              size="small"
                              sx={{ mr: 0.5, mb: 0.5 }}
                            />
                          ))}
                          <Typography variant="caption" color="text.secondary" display="block">
                            총 {sem1Total}시간
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </td>
                    <td style={styles.td}>
                      {(assignment.semester2Subjects || []).length > 0 ? (
                        <Box>
                          {assignment.semester2Subjects.map((subject, idx) => (
                            <Chip
                              key={idx}
                              label={`${subject.subjectName} (${subject.grade}-${subject.classes.join(',')}) ${subject.hoursPerWeek}시간`}
                              size="small"
                              sx={{ mr: 0.5, mb: 0.5 }}
                            />
                          ))}
                          <Typography variant="caption" color="text.secondary" display="block">
                            총 {sem2Total}시간
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </td>
                    <td style={styles.td}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <button style={styles.editBtn} onClick={() => openEditDialog(assignment)}>
                          수정
                        </button>
                        <button style={{...styles.editBtn, backgroundColor: '#d32f2f'}} onClick={() => deleteAssignment(assignment)}>
                          삭제
                        </button>
                      </Box>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Box>
      )}

      {/* 편집 다이얼로그 */}
      <Dialog open={!!editingSubject} onClose={() => setEditingSubject(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingSubject?.teacherName} - 과목 배정 수정
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>

            {/* 1학기 과목 */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">1학기 과목</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addSubjectRow(1)} sx={{ ml: 2 }}>
                  과목 추가
                </Button>
              </Box>

              {editingSubject?.semester1Subjects?.map((subject, idx) => (
                <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                  <TextField
                    label="과목코드"
                    value={subject.subjectCode || ''}
                    onChange={e => updateSubjectRow(1, idx, 'subjectCode', e.target.value)}
                    size="small"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="과목명"
                    value={subject.subjectName || ''}
                    onChange={e => updateSubjectRow(1, idx, 'subjectName', e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="학년"
                    type="number"
                    value={subject.grade || ''}
                    onChange={e => updateSubjectRow(1, idx, 'grade', e.target.value)}
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <TextField
                    label="반(쉼표)"
                    value={subject.classes?.join(',') || ''}
                    onChange={e => updateSubjectRow(1, idx, 'classes', e.target.value.split(',').map(c => c.trim()).filter(Boolean))}
                    size="small"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="학생범위"
                    value={subject.studentRange || ''}
                    onChange={e => updateSubjectRow(1, idx, 'studentRange', e.target.value)}
                    size="small"
                    placeholder="1-20"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="시수"
                    type="number"
                    value={subject.hoursPerWeek || ''}
                    onChange={e => updateSubjectRow(1, idx, 'hoursPerWeek', e.target.value)}
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <IconButton size="small" onClick={() => removeSubjectRow(1, idx)} color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>

            {/* 2학기 과목 */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">2학기 과목</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addSubjectRow(2)} sx={{ ml: 2 }}>
                  과목 추가
                </Button>
              </Box>

              {editingSubject?.semester2Subjects?.map((subject, idx) => (
                <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                  <TextField
                    label="과목코드"
                    value={subject.subjectCode || ''}
                    onChange={e => updateSubjectRow(2, idx, 'subjectCode', e.target.value)}
                    size="small"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="과목명"
                    value={subject.subjectName || ''}
                    onChange={e => updateSubjectRow(2, idx, 'subjectName', e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="학년"
                    type="number"
                    value={subject.grade || ''}
                    onChange={e => updateSubjectRow(2, idx, 'grade', e.target.value)}
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <TextField
                    label="반(쉼표)"
                    value={subject.classes?.join(',') || ''}
                    onChange={e => updateSubjectRow(2, idx, 'classes', e.target.value.split(',').map(c => c.trim()).filter(Boolean))}
                    size="small"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="학생범위"
                    value={subject.studentRange || ''}
                    onChange={e => updateSubjectRow(2, idx, 'studentRange', e.target.value)}
                    size="small"
                    placeholder="1-20"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="시수"
                    type="number"
                    value={subject.hoursPerWeek || ''}
                    onChange={e => updateSubjectRow(2, idx, 'hoursPerWeek', e.target.value)}
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <IconButton size="small" onClick={() => removeSubjectRow(2, idx)} color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingSubject(null)}>취소</Button>
          <Button onClick={saveSubjectAssignment} disabled={savingSubject || !editingSubject?.teacherUid} variant="contained">
            {savingSubject ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ASA 가져오기 다이얼로그 */}
      <Dialog open={asaDialogOpen} onClose={() => !asaImporting && setAsaDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>성취평가제에서 가져오기</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            성취평가제 과목 관리에서 지정한 담당 교사를 기준으로<br />
            과목 배정을 자동으로 가져옵니다.
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>대상 학기</InputLabel>
            <Select
              value={asaSemester}
              label="대상 학기"
              onChange={e => setAsaSemester(Number(e.target.value))}
            >
              <MenuItem value={1}>1학기</MenuItem>
              <MenuItem value={2}>2학기</MenuItem>
            </Select>
          </FormControl>

          <Alert severity="warning">
            * 선택한 학기의 기존 과목 배정은 모두 덮어씁니다.<br />
            * 다른 학기 배정은 영향받지 않습니다.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAsaDialogOpen(false)} disabled={asaImporting}>취소</Button>
          <Button onClick={importFromASA} disabled={asaImporting} variant="contained">
            {asaImporting ? '가져오는 중...' : '가져오기'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

const styles = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '0.6rem 0.8rem', backgroundColor: '#f0f0f0', fontSize: '0.85rem', fontWeight: 600 },
  td: { padding: '0.6rem 0.8rem', borderBottom: '1px solid #eee', fontSize: '0.9rem', verticalAlign: 'middle' },
  editBtn: { padding: '0.3rem 0.75rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
}
