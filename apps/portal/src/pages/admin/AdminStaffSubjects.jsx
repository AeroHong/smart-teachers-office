import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { loadSubjects } from '@shared/lib/subjectData'
import { buildEmailToTeacher, subjectTeacherUids } from '@shared/lib/asaTeacherRefs'
import { entryYearFor, teacherSubjectId } from '@shared/lib/schema'
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
import Autocomplete from '@mui/material/Autocomplete'
import Tooltip from '@mui/material/Tooltip'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

// 배정 화면은 교사 수 × 과목 수만큼 조회가 일어나므로 카탈로그를 미리 색인해 둔다.
// 배정 한 건당 선형 탐색을 하면 교사 80명 규모에서 렌더가 눈에 띄게 느려진다.
function buildCatalogIndex(catalog) {
  const byId = new Map()
  const byCode = new Map()
  const byName = new Map()
  const put = (map, key, val) => { if (key && !map.has(key)) map.set(key, val) }

  for (const c of catalog) {
    byId.set(c.id, c)
    const code = (c.subjectCode || '').trim()
    const name = (c.name || '').trim()
    put(byCode, `${code}|${c.grade}`, c)
    put(byCode, code, c)
    put(byName, `${name}|${c.grade}`, c)
    put(byName, name, c)
  }
  return { byId, byCode, byName }
}

// 배정된 과목을 subjects 카탈로그의 문서와 연결한다.
// 이미 subjectId가 있으면 그대로 쓰고, 없으면 과목코드 → 과목명 순으로 찾는다.
// 학년이 지정된 행은 같은 학년의 과목만 후보로 본다.
// (기존에 자유 입력으로 쌓인 데이터를 화면에서 자동 보정하기 위한 경로)
function matchCatalogSubject(index, subject) {
  if (!index || !subject) return null

  if (subject.subjectId) {
    const hit = index.byId.get(subject.subjectId)
    if (hit) return hit
  }

  const grade = Number(subject.grade) || null
  const code = (subject.subjectCode || '').trim()
  if (code) {
    const hit = grade ? index.byCode.get(`${code}|${grade}`) : index.byCode.get(code)
    if (hit) return hit
  }

  const name = (subject.subjectName || '').trim()
  if (!name) return null
  return (grade ? index.byName.get(`${name}|${grade}`) : index.byName.get(name)) || null
}

// 해당 학기에 배정 가능한 카탈로그 과목 (양학기 과목은 두 학기 모두 노출).
// 이번 학년도에 실제로 편성된 과목을 앞에 놓되, 나머지도 고를 수 있게 남겨둔다.
function catalogOptionsFor(catalog, semester, assignmentYear) {
  const offThisYear = (c) => (isOfferedIn(c, assignmentYear) ? 0 : 1)
  return catalog
    .filter(c => c.semester === 'both' || Number(c.semester) === semester)
    .sort((a, b) =>
      offThisYear(a) - offThisYear(b) ||
      (a.grade || 0) - (b.grade || 0) ||
      (a.name || '').localeCompare(b.name || '', 'ko')
    )
}

// 그 과목의 입학년도가 해당 학년도의 학년과 맞아떨어지는가
function isOfferedIn(subject, assignmentYear) {
  return subject.entryYear === entryYearFor(assignmentYear, subject.grade)
}

function catalogOptionLabel(option) {
  if (typeof option === 'string') return option
  return option?.name || ''
}

// 목록의 과목 칩. 교육과정 과목과 연결되지 않은 과목은 주황색 외곽선으로 구분한다.
function SubjectChip({ subject, catalogIndex }) {
  const linked = !!matchCatalogSubject(catalogIndex, subject)
  return (
    <Chip
      label={`${subject.subjectName} (${subject.grade}-${subject.classes.join(',')}) ${subject.hoursPerWeek}시간`}
      size="small"
      color={linked ? 'default' : 'warning'}
      variant={linked ? 'filled' : 'outlined'}
      title={linked ? '' : '교육과정 과목 목록에 없는 과목'}
      sx={{ mr: 0.5, mb: 0.5 }}
    />
  )
}

export default function AdminStaffSubjects({ schoolId, assignmentYear }) {
  const [loading, setLoading] = useState(true)
  const [teachers, setTeachers] = useState([]) // 전체 교사 목록
  const [subjectAssignments, setSubjectAssignments] = useState([]) // 과목 배정 목록
  const [catalog, setCatalog] = useState([]) // subjects 컬렉션 (교육과정 과목)
  const catalogIndex = useMemo(() => buildCatalogIndex(catalog), [catalog])

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

      // 2. 교육과정 과목 카탈로그 (배정 시 참조 대상)
      setCatalog(await loadSubjects(schoolId))

      // 3. 과목 배정 데이터 (학기 통합)
      const subjectsSnap = await getDocs(query(
        collection(db, 'schools', schoolId, 'teacherSubjects'),
        where('year', '==', assignmentYear)
      ))
      const assignmentsMap = new Map()
      subjectsSnap.docs.forEach(d => {
        assignmentsMap.set(d.data().teacherUid, { id: d.id, ...d.data() })
      })

      // 4. 모든 교사에 대해 과목 배정 데이터 생성 (없으면 빈 데이터)
      const assignments = teacherList.map(teacher => {
        const existing = assignmentsMap.get(teacher.uid)
        if (existing) {
          return existing
        } else {
          return {
            id: teacherSubjectId(assignmentYear, teacher.uid),
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
        { subjectId: '', subjectCode: '', subjectName: '', grade: '', classes: [], studentRange: '', hoursPerWeek: '' }
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

  // 과목명 칸에서 카탈로그 과목을 고르거나 직접 입력했을 때
  const selectCatalogSubject = (semester, index, value) => {
    if (!editingSubject) return
    const arrayField = semester === 1 ? 'semester1Subjects' : 'semester2Subjects'

    // 카탈로그에 없는 과목명을 직접 입력한 경우 — 참조 없이 이름만 남긴다
    const patch = typeof value === 'string' || value == null
      ? { subjectId: '', subjectName: value || '' }
      : {
          subjectId: value.id,
          subjectName: value.name || '',
          subjectCode: value.subjectCode || '',
          grade: value.grade || '',
        }

    setEditingSubject(prev => ({
      ...prev,
      [arrayField]: prev[arrayField].map((s, i) => i === index ? { ...s, ...patch } : s)
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
      const docId = teacherSubjectId(assignmentYear, editingSubject.teacherUid)
      const teacher = teachers.find(t => t.uid === editingSubject.teacherUid)

      // 유효성 검사 + 카탈로그 참조 보정
      const normalize = (rows) => rows
        .filter(s => s.subjectName && s.grade && s.classes.length > 0)
        .map(s => {
          // 저장 시점에 한 번 더 카탈로그와 맞춰본다.
          // 코드/이름만 손으로 고친 행도 참조를 되찾을 수 있다.
          const matched = matchCatalogSubject(catalogIndex, s)
          return {
            subjectId: matched?.id || '',
            subjectCode: matched?.subjectCode || s.subjectCode || '',
            subjectName: matched?.name || s.subjectName,
            grade: Number(s.grade),
            classes: s.classes.map(c => Number(c)),
            studentRange: s.studentRange || '',
            hoursPerWeek: Number(s.hoursPerWeek) || 0
          }
        })

      const validSem1 = normalize(editingSubject.semester1Subjects)
      const validSem2 = normalize(editingSubject.semester2Subjects)

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
      // 담당 교사 식별은 uid 기준. asaSubjects에 teacherUids가 있으면 그것을 쓰고,
      // 아직 없는 기존 문서만 teacherEmails → uid로 해석해 폴백한다.
      const byEmail = buildEmailToTeacher(teachers)
      const teacherByUid = new Map(teachers.map(t => [t.uid, t]))
      const subjectsByUid = {}
      const unresolvedEmails = new Set()   // 계정을 찾지 못한 이메일
      const legacySubjects = new Set()     // 아직 uid가 없어 이메일로 매칭한 과목

      let unmatched = 0
      snap.docs.forEach(d => {
        const data = d.data()
        // asaSubjects 문서에는 name / grade / semester / achievementLevel / 담당교사만 있다.
        // 과목코드와 반 정보는 없으므로 이름+학년으로만 카탈로그와 맞춘다.
        // (과목코드는 매칭된 카탈로그 과목에서 가져온다)
        const matched = matchCatalogSubject(catalogIndex, {
          subjectName: data.name, grade: data.grade
        })
        if (!matched) unmatched++
        const subjectInfo = {
          subjectId: matched?.id || '',
          subjectCode: matched?.subjectCode || '',
          subjectName: matched?.name || data.name || '',
          grade: data.grade || 0,
          classes: [],          // ASA에 반 정보가 없다 — 가져온 뒤 직접 입력해야 한다
          studentRange: '',
          hoursPerWeek: 0
        }

        const { uids, unmatchedEmails, source } = subjectTeacherUids(data, byEmail)
        if (source === 'emails') legacySubjects.add(data.name || d.id)
        unmatchedEmails.forEach(e => unresolvedEmails.add(e))

        uids.forEach(uid => {
          if (!subjectsByUid[uid]) subjectsByUid[uid] = []
          subjectsByUid[uid].push(subjectInfo)
        })
      })

      let imported = 0
      await Promise.all(Object.entries(subjectsByUid).map(async ([uid, subjects]) => {
        const teacher = teacherByUid.get(uid)
        // 이 학교 교사 목록에 없는 uid (퇴직·전출 등) — 배정을 만들지 않는다
        if (!teacher) return

        const docId = teacherSubjectId(assignmentYear, teacher.uid)
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

      alert(
        `✅ ${imported}명의 ${asaSemester}학기 과목을 ASA에서 가져왔습니다.` +
        // ASA에는 반 정보가 없어 반 칸이 비어 있다. 이 상태로 편집 화면에서 저장하면
        // 유효성 검사(반 1개 이상)에 걸려 행이 사라지므로 미리 알린다.
        `\n\n📝 가져온 과목은 담당 "반"이 비어 있습니다. 각 교사의 과목 배정을 수정해 반을 입력하세요. 반을 채우지 않은 채 저장하면 해당 과목은 저장되지 않습니다.` +
        (unmatched > 0 ? `\n\n⚠️ ${unmatched}개 과목은 교육과정 과목 목록에서 찾지 못해 이름만 저장했습니다. 과목 관리에서 등록 여부를 확인하세요.` : '') +
        (legacySubjects.size > 0 ? `\n\n⚠️ ${legacySubjects.size}개 과목은 담당 교사가 아직 이메일로만 저장돼 있어 이메일로 매칭했습니다. 성취평가제 과목 관리에서 "담당 교사 uid 연결"을 실행하세요.` : '') +
        (unresolvedEmails.size > 0 ? `\n\n❌ 계정을 찾지 못한 담당 교사 이메일 ${unresolvedEmails.size}건 — 이 교사들의 과목은 가져오지 못했습니다:\n${[...unresolvedEmails].join('\n')}` : '')
      )
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
      let unmatchedRows = 0
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

        const matched = matchCatalogSubject(catalogIndex, row)
        if (!matched) unmatchedRows++
        const subject = {
          subjectId: matched?.id || '',
          subjectCode: matched?.subjectCode || row.subjectCode,
          subjectName: matched?.name || row.subjectName,
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
        const docId = teacherSubjectId(assignmentYear, uid)
        await setDoc(doc(db, 'schools', schoolId, 'teacherSubjects', docId), {
          year: assignmentYear,
          ...data,
          updatedAt: serverTimestamp()
        })
        saved++
      }))

      setUploadMsg(
        `✅ ${saved}명의 과목 배정을 저장했습니다.` +
        (unmatchedRows > 0 ? ` (${unmatchedRows}개 행은 교육과정 과목 목록에 없어 이름만 저장)` : '')
      )
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
                            <SubjectChip key={idx} subject={subject} catalogIndex={catalogIndex} />
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
                            <SubjectChip key={idx} subject={subject} catalogIndex={catalogIndex} />
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

            {catalog.length === 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                등록된 교육과정 과목이 없습니다. <strong>과목 관리</strong>에서 먼저 과목을 등록하면
                여기서 목록으로 선택할 수 있고, 과목명이 바뀌어도 배정이 따라갑니다.
              </Alert>
            )}

            {[1, 2].map(semester => {
              const field = semester === 1 ? 'semester1Subjects' : 'semester2Subjects'
              const options = catalogOptionsFor(catalog, semester, assignmentYear)
              return (
                <Box key={semester} sx={{ mb: semester === 1 ? 3 : 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h6">{semester}학기 과목</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => addSubjectRow(semester)} sx={{ ml: 2 }}>
                      과목 추가
                    </Button>
                  </Box>

                  {editingSubject?.[field]?.map((subject, idx) => {
                    const matched = matchCatalogSubject(catalogIndex, subject)
                    return (
                      <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                        <TextField
                          label="과목코드"
                          value={subject.subjectCode || ''}
                          onChange={e => updateSubjectRow(semester, idx, 'subjectCode', e.target.value)}
                          size="small"
                          sx={{ width: 100 }}
                        />
                        <Autocomplete
                          freeSolo
                          options={options}
                          value={matched || subject.subjectName || ''}
                          getOptionLabel={catalogOptionLabel}
                          isOptionEqualToValue={(opt, val) => opt.id === val?.id}
                          groupBy={(o) => isOfferedIn(o, assignmentYear)
                            ? `${assignmentYear}학년도 편성 과목`
                            : '다른 학년도 과목'}
                          onChange={(_, val) => selectCatalogSubject(semester, idx, val)}
                          onInputChange={(_, val, reason) => {
                            // 직접 타이핑한 경우에만 이름을 갱신한다 (선택 시에는 onChange가 처리)
                            if (reason === 'input') selectCatalogSubject(semester, idx, val)
                          }}
                          renderOption={(props, option) => (
                            <li {...props} key={option.id}>
                              {option.name}
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                {option.grade}학년 · {option.entryYear}학번 · {option.credits}학점
                              </Typography>
                            </li>
                          )}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="과목명"
                              size="small"
                              InputProps={{
                                ...params.InputProps,
                                endAdornment: (
                                  <>
                                    {subject.subjectName && !matched && (
                                      <Tooltip title="교육과정 과목 목록에 없는 과목입니다. 이름만 저장되며 과목 관리에서 이름이 바뀌어도 연동되지 않습니다.">
                                        <WarningAmberIcon sx={{ fontSize: '1.1rem', color: '#ed6c02' }} />
                                      </Tooltip>
                                    )}
                                    {params.InputProps.endAdornment}
                                  </>
                                ),
                              }}
                            />
                          )}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          label="학년"
                          type="number"
                          value={subject.grade || ''}
                          onChange={e => updateSubjectRow(semester, idx, 'grade', e.target.value)}
                          size="small"
                          sx={{ width: 80 }}
                        />
                        <TextField
                          label="반(쉼표)"
                          value={subject.classes?.join(',') || ''}
                          onChange={e => updateSubjectRow(semester, idx, 'classes', e.target.value.split(',').map(c => c.trim()).filter(Boolean))}
                          size="small"
                          sx={{ width: 100 }}
                        />
                        <TextField
                          label="학생범위"
                          value={subject.studentRange || ''}
                          onChange={e => updateSubjectRow(semester, idx, 'studentRange', e.target.value)}
                          size="small"
                          placeholder="1-20"
                          sx={{ width: 100 }}
                        />
                        <TextField
                          label="시수"
                          type="number"
                          value={subject.hoursPerWeek || ''}
                          onChange={e => updateSubjectRow(semester, idx, 'hoursPerWeek', e.target.value)}
                          size="small"
                          sx={{ width: 80 }}
                        />
                        <IconButton size="small" onClick={() => removeSubjectRow(semester, idx)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )
                  })}
                </Box>
              )
            })}
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
