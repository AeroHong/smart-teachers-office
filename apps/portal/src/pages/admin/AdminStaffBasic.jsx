import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, USERS, schoolPath, teacherAssignmentId, currentSchoolYear } from '@shared/lib/schema'
import { RowActions, EditAction, table } from './adminUi'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Select from '@mui/material/Select'
import Autocomplete from '@mui/material/Autocomplete'
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
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'

/**
 * 교직원 기본 배정(부서/담임/사무실) 관리.
 * @param {string} schoolId
 * @param {number} assignmentYear 학년도(year). 입학년도(entryYear)가 아니다 — schema.js 참고.
 */
export default function AdminStaffBasic({ schoolId, assignmentYear }) {
  // 지난 학년도는 기록 조회용 — 목록 구성과 편집 가능 여부가 달라진다
  const isPastYear = assignmentYear < currentSchoolYear()
  const [loading, setLoading] = useState(true)
  const [assignmentRows, setAssignmentRows] = useState([])
  const [editingAssignment, setEditingAssignment] = useState(null)
  const [savingAssignment, setSavingAssignment] = useState(false)

  // 일괄 수정
  const [selectedUids, setSelectedUids] = useState(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkFields, setBulkFields] = useState(null)
  const [savingBulk, setSavingBulk] = useState(false)

  // CSV 업로드
  const [assignParsedRows, setAssignParsedRows] = useState([])
  const [assignUploadMsg, setAssignUploadMsg] = useState('')
  const [savingAssignUpload, setSavingAssignUpload] = useState(false)

  // 부서·교과 드롭다운 보기 목록 — 지금 이 학년도에 실제로 쓰이고 있는 값만 모은다
  // (고정 목록을 따로 안 둔다 — 학교마다 부서 이름이 달라 여기서 못 박으면 오히려
  // 안 맞는 학교가 생긴다). 그래도 자유 입력(freeSolo)은 열어 둔다 — 새로 생긴
  // 부서·교과는 관리자가 그대로 타이핑해 만들 수 있어야 한다. 목적은 "이미 있는
  // 값을 골라 쓰면 오타가 안 난다"는 것이지, 새 값 자체를 막는 게 아니다
  // (사용자 요청, 2026-08-27 — "관리자가 잘못 입력한 경우도 있으니").
  const departmentOptions = useMemo(() => (
    [...new Set(assignmentRows.map(r => r.assignment?.department).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko'))
  ), [assignmentRows])
  const subjectOptions = useMemo(() => (
    [...new Set(assignmentRows.map(r => r.assignment?.subject).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko'))
  ), [assignmentRows])
  const officeOptions = useMemo(() => (
    [...new Set(assignmentRows.map(r => r.assignment?.office).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko'))
  ), [assignmentRows])

  // 표 정렬·필터 — 60명 넘어가면 "부서가 아직 없는 사람"이나 "이름 하나" 찾기가
  // 스크롤로는 괴롭다(사용자 요청, 2026-08-29). 정렬은 헤더 클릭, 필터는 헤더 바로
  // 아래 칸에 값을 입력/선택하는 방식 — 흔한 표 계산 프로그램 UX 그대로.
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [columnFilters, setColumnFilters] = useState({
    name: '', positionLabel: '', department: '', subject: '', homeroom: '', office: '', duty: '', extension: '',
  })
  const hasActiveFilter = Object.values(columnFilters).some(Boolean)

  const getFieldValue = (row, key) => {
    const a = row.assignment
    switch (key) {
      case 'name': return row.name || ''
      case 'positionLabel': return a?.positionLabel || ''
      case 'department': return a?.department || ''
      case 'subject': return a?.subject || ''
      case 'homeroom': return a?.isHomeroom ? `${a.homeroomGrade ?? ''}학년 ${a.homeroomClassNo ?? ''}반` : ''
      case 'office': return a?.office || ''
      case 'duty': return a?.duty || ''
      case 'extension': return a?.extension || ''
      default: return ''
    }
  }

  const toggleSort = (key) => {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const visibleRows = useMemo(() => {
    let rows = assignmentRows
    if (columnFilters.name) {
      const q = columnFilters.name.toLowerCase()
      rows = rows.filter(r => (r.name || '').toLowerCase().includes(q))
    }
    if (columnFilters.positionLabel) {
      const q = columnFilters.positionLabel.toLowerCase()
      rows = rows.filter(r => (r.assignment?.positionLabel || '').toLowerCase().includes(q))
    }
    if (columnFilters.department) rows = rows.filter(r => (r.assignment?.department || '') === columnFilters.department)
    if (columnFilters.subject) rows = rows.filter(r => (r.assignment?.subject || '') === columnFilters.subject)
    if (columnFilters.office) rows = rows.filter(r => (r.assignment?.office || '') === columnFilters.office)
    if (columnFilters.homeroom === 'yes') rows = rows.filter(r => r.assignment?.isHomeroom)
    if (columnFilters.homeroom === 'no') rows = rows.filter(r => !r.assignment?.isHomeroom)
    if (columnFilters.duty) {
      const q = columnFilters.duty.toLowerCase()
      rows = rows.filter(r => (r.assignment?.duty || '').toLowerCase().includes(q))
    }
    if (columnFilters.extension) rows = rows.filter(r => (r.assignment?.extension || '').includes(columnFilters.extension))

    if (sort.key) {
      rows = [...rows].sort((a, b) => {
        const cmp = getFieldValue(a, sort.key).localeCompare(getFieldValue(b, sort.key), 'ko')
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [assignmentRows, columnFilters, sort])

  useEffect(() => {
    if (!schoolId) return
    fetchAssignments()
  }, [schoolId, assignmentYear])

  const fetchAssignments = async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      const [usersSnap, assignSnap] = await Promise.all([
        getDocs(query(
          collection(db, USERS),
          where('schoolId', '==', schoolId),
          where('role', 'in', ['teacher', 'admin', 'school_admin', 'principal']),
        )),
        getDocs(query(
          collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)),
          where('year', '==', assignmentYear),
        )),
      ])
    const assignByUid = {}
    assignSnap.docs.forEach(d => { assignByUid[d.data().uid] = { id: d.id, ...d.data() } })

      const usersByUid = {}
      usersSnap.docs.forEach(d => { usersByUid[d.id] = { id: d.id, ...d.data() } })

      // 과거 학년도는 그 해 배정 기록만 보여준다.
      // users는 "지금 재직 중인" 명단이라, 과거 연도에 그대로 쓰면 그 해 없던 교사가
      // 나오고 정작 그 해 근무하다 퇴직·전출한 교사는 빠진다.
      // 현재·다음 학년도는 배정할 대상을 골라야 하므로 전체 명단 + 미배정 행을 보여준다.
      const rows = isPastYear
        ? assignSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .map(a => {
              const u = usersByUid[a.uid]
              return {
                uid: a.uid,
                // 퇴직·전출로 users에서 사라진 교사는 이름을 복원할 수 없다
                name: u?.name || a.name || '(퇴직·전출)',
                email: u?.email || '',
                staffType: u?.staffType,
                assignment: a,
                departed: !u,
              }
            })
        : usersSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .map(u => ({ uid: u.id, name: u.name, email: u.email, staffType: u.staffType, assignment: assignByUid[u.id] || null, departed: false }))

      setAssignmentRows(rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')))

      // 자동으로 "전체 교직원" 연수 프리셋 생성/업데이트.
      // 지난 학년도는 조회 전용이므로 만들지 않는다 — 과거 연도를 열어보기만 해도
      // 그 해 프리셋이 생기거나 덮어써지면 안 된다.
      if (rows.length > 0 && !isPastYear) {
        const allMembers = rows.map(row => ({
          uid: row.uid,
          name: row.name,
          email: row.email,
          staffType: '교직원'
        }))

        // 기존 "전체 교직원" 프리셋 확인
        const presetsSnap = await getDocs(query(
          collection(db, ...schoolPath(schoolId, COL.TRAINING_PRESETS)),
          where('autoGenerated', '==', true),
          where('year', '==', assignmentYear)
        ))

        const existingPreset = presetsSnap.docs.find(d => d.data().name === `전체 교직원 (${assignmentYear})`)

        if (existingPreset) {
          // 업데이트
          await setDoc(doc(db, ...schoolPath(schoolId, COL.TRAINING_PRESETS), existingPreset.id), {
            name: `전체 교직원 (${assignmentYear})`,
            members: allMembers,
            autoGenerated: true,
            year: assignmentYear,
            updatedAt: serverTimestamp()
          })
        } else {
          // 생성
          await addDoc(collection(db, ...schoolPath(schoolId, COL.TRAINING_PRESETS)), {
            name: `전체 교직원 (${assignmentYear})`,
            members: allMembers,
            autoGenerated: true,
            year: assignmentYear,
            createdAt: serverTimestamp()
          })
        }
      }
    } catch (err) {
      console.error('교직원 배정 로딩 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const openAssignmentModal = (row) => {
    const a = row.assignment || {}
    setEditingAssignment({
      uid: row.uid,
      name: row.name,
      department: a.department || '',
      subject: a.subject || '',
      isHomeroom: a.isHomeroom || false,
      homeroomGrade: a.homeroomGrade || '',
      homeroomClassNo: a.homeroomClassNo || '',
      office: a.office || '',
      positionLabel: a.positionLabel || '',
      duty: a.duty || '',
      extension: a.extension || '',
    })
  }

  const saveAssignment = async () => {
    if (!editingAssignment) return
    setSavingAssignment(true)
    try {
      const { uid, name, homeroomGrade, homeroomClassNo, ...form } = editingAssignment
      const docId = teacherAssignmentId(assignmentYear, uid)
      await setDoc(doc(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS), docId), {
        uid,
        year: assignmentYear,
        ...form,
        homeroomGrade: form.isHomeroom && homeroomGrade ? Number(homeroomGrade) : null,
        homeroomClassNo: form.isHomeroom && homeroomClassNo ? Number(homeroomClassNo) : null,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setEditingAssignment(null)
      await fetchAssignments()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSavingAssignment(false)
    }
  }

  const toggleSelectUid = (uid) => {
    setSelectedUids(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  // 필터로 걸러진 화면 기준으로 전체 선택한다 — 안 보이는 사람까지 한꺼번에
  // 선택되면 "일괄 수정 몇 명" 숫자만 보고는 누가 포함됐는지 알기 어렵다.
  const toggleSelectAllAssignments = () => {
    const visibleUids = visibleRows.map(r => r.uid)
    const allVisibleSelected = visibleUids.length > 0 && visibleUids.every(uid => selectedUids.has(uid))
    setSelectedUids(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleUids.forEach(uid => next.delete(uid))
      else visibleUids.forEach(uid => next.add(uid))
      return next
    })
  }

  const openBulkEdit = () => {
    setBulkFields({
      positionLabel: { on: false, value: '' },
      department: { on: false, value: '' },
      subject: { on: false, value: '' },
      office: { on: false, value: '' },
      homeroom: { on: false, isHomeroom: false, grade: '', classNo: '' },
    })
    setBulkEditOpen(true)
  }

  const saveBulkEdit = async () => {
    if (!bulkFields) return
    setSavingBulk(true)
    try {
      const payload = { updatedAt: serverTimestamp() }
      if (bulkFields.positionLabel.on) payload.positionLabel = bulkFields.positionLabel.value
      if (bulkFields.department.on) payload.department = bulkFields.department.value
      if (bulkFields.subject.on) payload.subject = bulkFields.subject.value
      if (bulkFields.office.on) payload.office = bulkFields.office.value
      if (bulkFields.homeroom.on) {
        payload.isHomeroom = bulkFields.homeroom.isHomeroom
        payload.homeroomGrade = bulkFields.homeroom.isHomeroom && bulkFields.homeroom.grade ? Number(bulkFields.homeroom.grade) : null
        payload.homeroomClassNo = bulkFields.homeroom.isHomeroom && bulkFields.homeroom.classNo ? Number(bulkFields.homeroom.classNo) : null
      }
      await Promise.all([...selectedUids].map(uid =>
        setDoc(doc(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS), teacherAssignmentId(assignmentYear, uid)), {
          uid, year: assignmentYear, ...payload,
        }, { merge: true })
      ))
      setBulkEditOpen(false)
      setSelectedUids(new Set())
      await fetchAssignments()
    } catch (err) {
      alert('일괄 저장 실패: ' + err.message)
    } finally {
      setSavingBulk(false)
    }
  }

  // CSV 관련 함수들
  const csvCell = (v) => {
    const s = (v ?? '').toString()
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const downloadAssignmentCsv = () => {
    const header = ['이메일', '이름', '직함', '부서', '담당교과', '담임학년', '담임반', '사무실']
    const rows = assignmentRows.map(row => {
      const a = row.assignment || {}
      return [
        row.email || '',
        row.name || '',
        a.positionLabel || '',
        a.department || '',
        a.subject || '',
        a.isHomeroom && a.homeroomGrade ? a.homeroomGrade : '',
        a.isHomeroom && a.homeroomClassNo ? a.homeroomClassNo : '',
        a.office || '',
      ].map(csvCell).join(',')
    })
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `교원배정_${assignmentYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const parseAssignmentRows = (text) => {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return null
    const delim = lines[0].includes('\t') ? '\t' : ','
    const headers = lines[0].split(delim).map(h => h.trim().toLowerCase())
    const findIdx = (names) => headers.findIndex(h => names.includes(h))
    const emailIdx = findIdx(['이메일', 'email'])
    if (emailIdx === -1) return null
    const positionIdx = findIdx(['직함', 'position'])
    const deptIdx = findIdx(['부서', 'department'])
    const subjectIdx = findIdx(['담당교과', '과목', 'subject'])
    const gradeIdx = findIdx(['담임학년', '학년'])
    const classIdx = findIdx(['담임반', '반'])
    const officeIdx = findIdx(['사무실', 'office'])

    return lines.slice(1).map(line => {
      const cols = line.split(delim).map(v => v.trim())
      const grade = gradeIdx !== -1 ? cols[gradeIdx] : ''
      const classNo = classIdx !== -1 ? cols[classIdx] : ''
      return {
        email: (cols[emailIdx] || '').toLowerCase(),
        positionLabel: positionIdx !== -1 ? cols[positionIdx] || '' : '',
        department: deptIdx !== -1 ? cols[deptIdx] || '' : '',
        subject: subjectIdx !== -1 ? cols[subjectIdx] || '' : '',
        isHomeroom: !!(grade && classNo),
        homeroomGrade: grade ? Number(grade) : null,
        homeroomClassNo: classNo ? Number(classNo) : null,
        office: officeIdx !== -1 ? cols[officeIdx] || '' : '',
      }
    }).filter(r => r.email && r.email.includes('@'))
  }

  const handleAssignCsvUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const rows = parseAssignmentRows(text)
      if (!rows) { setAssignUploadMsg('CSV 헤더에 "이메일" 열이 필요합니다.'); return }
      if (rows.length === 0) { setAssignUploadMsg('유효한 데이터가 없습니다.'); return }
      setAssignParsedRows(rows)
      setAssignUploadMsg('')
    } catch (err) {
      setAssignUploadMsg('파일 읽기 실패: ' + err.message)
    }
  }

  const handleSaveAssignUpload = async () => {
    if (assignParsedRows.length === 0) return
    setSavingAssignUpload(true)
    setAssignUploadMsg('')
    try {
      const emailToUid = {}
      assignmentRows.forEach(r => { if (r.email) emailToUid[r.email.toLowerCase()] = r.uid })

      let matched = 0
      let unmatched = 0
      await Promise.all(assignParsedRows.map(async (row) => {
        const uid = emailToUid[row.email]
        if (!uid) { unmatched++; return }
        matched++
        const { email, ...form } = row
        await setDoc(doc(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS), teacherAssignmentId(assignmentYear, uid)), {
          uid, year: assignmentYear, ...form, updatedAt: serverTimestamp(),
        }, { merge: true })
      }))

      setAssignUploadMsg(`✅ ${matched}명 반영 완료${unmatched > 0 ? ` · 매칭 안 된 이메일 ${unmatched}건 (구성원 목록에 없는 이메일)` : ''}`)
      setAssignParsedRows([])
      await fetchAssignments()
    } catch (err) {
      setAssignUploadMsg('저장 실패: ' + err.message)
    } finally {
      setSavingAssignUpload(false)
    }
  }

  return (
    <Box>
      {isPastYear && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>{assignmentYear}학년도 기록을 보고 있습니다.</strong> 그해 배정된 교직원만 표시되며 수정할 수 없습니다.
          퇴직·전출한 교직원은 이름이 남아 있지 않을 수 있습니다.
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {selectedUids.size > 0 && !isPastYear && (
          <Button variant="contained" color="secondary" onClick={openBulkEdit}>
            선택 {selectedUids.size}명 일괄 수정
          </Button>
        )}
        {hasActiveFilter && (
          <Button
            size="small"
            onClick={() => setColumnFilters({ name: '', positionLabel: '', department: '', subject: '', homeroom: '', office: '', duty: '', extension: '' })}
          >
            필터 초기화
          </Button>
        )}
        {hasActiveFilter && (
          <Typography variant="body2" color="text.secondary">
            {visibleRows.length}명 표시 중 (전체 {assignmentRows.length}명)
          </Typography>
        )}
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : assignmentRows.length === 0 ? (
        <Typography color="text.secondary">
          {isPastYear
            ? `${assignmentYear}학년도에 배정된 교직원 기록이 없습니다.`
            : '소속 교직원이 없습니다.'}
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <table style={table.table}>
            <thead style={table.thead}>
              <tr>
                <th style={table.th}>
                  <Checkbox
                    size="small"
                    sx={{ p: 0.25 }}
                    checked={visibleRows.length > 0 && visibleRows.every(r => selectedUids.has(r.uid))}
                    indeterminate={visibleRows.some(r => selectedUids.has(r.uid)) && !visibleRows.every(r => selectedUids.has(r.uid))}
                    onChange={toggleSelectAllAssignments}
                    disabled={isPastYear}
                    inputProps={{ 'aria-label': '전체 선택' }}
                  />
                </th>
                <SortableTh label="이름" sortKey="name" sort={sort} onSort={toggleSort} />
                <SortableTh label="직함" sortKey="positionLabel" sort={sort} onSort={toggleSort} />
                <SortableTh label="부서" sortKey="department" sort={sort} onSort={toggleSort} />
                <SortableTh label="담당 교과" sortKey="subject" sort={sort} onSort={toggleSort} />
                <SortableTh label="담임" sortKey="homeroom" sort={sort} onSort={toggleSort} />
                <SortableTh label="사무실" sortKey="office" sort={sort} onSort={toggleSort} />
                <SortableTh label="업무" sortKey="duty" sort={sort} onSort={toggleSort} />
                <SortableTh label="내선번호" sortKey="extension" sort={sort} onSort={toggleSort} />
                <th style={table.th}>수정</th>
              </tr>
              <tr>
                <th style={table.th} />
                <th style={table.th}>
                  <FilterInput value={columnFilters.name} onChange={v => setColumnFilters(prev => ({ ...prev, name: v }))} />
                </th>
                <th style={table.th}>
                  <FilterInput value={columnFilters.positionLabel} onChange={v => setColumnFilters(prev => ({ ...prev, positionLabel: v }))} />
                </th>
                <th style={table.th}>
                  <FilterSelect value={columnFilters.department} options={departmentOptions} onChange={v => setColumnFilters(prev => ({ ...prev, department: v }))} />
                </th>
                <th style={table.th}>
                  <FilterSelect value={columnFilters.subject} options={subjectOptions} onChange={v => setColumnFilters(prev => ({ ...prev, subject: v }))} />
                </th>
                <th style={table.th}>
                  <select
                    value={columnFilters.homeroom}
                    onChange={e => setColumnFilters(prev => ({ ...prev, homeroom: e.target.value }))}
                    style={filterInputStyle}
                  >
                    <option value="">전체</option>
                    <option value="yes">담임만</option>
                    <option value="no">비담임만</option>
                  </select>
                </th>
                <th style={table.th}>
                  <FilterSelect value={columnFilters.office} options={officeOptions} onChange={v => setColumnFilters(prev => ({ ...prev, office: v }))} />
                </th>
                <th style={table.th}>
                  <FilterInput value={columnFilters.duty} onChange={v => setColumnFilters(prev => ({ ...prev, duty: v }))} />
                </th>
                <th style={table.th}>
                  <FilterInput value={columnFilters.extension} onChange={v => setColumnFilters(prev => ({ ...prev, extension: v }))} />
                </th>
                <th style={table.th} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const a = row.assignment
                return (
                  <tr key={row.uid} style={table.tr}>
                    <td style={table.td}>
                      <Checkbox
                        size="small"
                        sx={{ p: 0.25 }}
                        checked={selectedUids.has(row.uid)}
                        onChange={() => toggleSelectUid(row.uid)}
                        disabled={isPastYear}
                        inputProps={{ 'aria-label': `${row.name} 선택` }}
                      />
                    </td>
                    <td style={table.td}>
                      {row.name || '—'}
                      {row.departed && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                          (현재 명단에 없음)
                        </Typography>
                      )}
                    </td>
                    <td style={table.td}>{a?.positionLabel || '—'}</td>
                    <td style={table.td}>{a?.department || '—'}</td>
                    <td style={table.td}>{a?.subject || '—'}</td>
                    <td style={table.td}>{a?.isHomeroom ? `${a.homeroomGrade || ''}학년 ${a.homeroomClassNo || ''}반` : '—'}</td>
                    <td style={table.td}>{a?.office || '—'}</td>
                    <td style={table.td}>{a?.duty || '—'}</td>
                    <td style={table.td}>{a?.extension || '—'}</td>
                    <td style={table.td}>
                      <RowActions>
                        <EditAction
                          onClick={() => openAssignmentModal(row)}
                          title={isPastYear ? '지난 학년도는 수정할 수 없습니다' : '배정 수정'}
                          disabled={isPastYear}
                        />
                      </RowActions>
                    </td>
                  </tr>
                )
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td style={table.td} colSpan={10}>
                    <Typography color="text.secondary" sx={{ py: 1 }}>필터 조건에 맞는 교직원이 없습니다.</Typography>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>
      )}

      {/* 일괄 업로드 섹션 */}
      <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #e0e0e0' }}>
        <Typography variant="h6" fontWeight={600} mb={1}>
          일괄 업로드
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          1) 현재 명단을 CSV로 받아서 엑셀로 채운 뒤 2) 다시 올리면 반영됩니다. <strong>이메일</strong> 열로 구성원 목록과 매칭합니다.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={downloadAssignmentCsv}>
            현재 명단 CSV 다운로드 ({assignmentYear})
          </Button>
          <Button variant="outlined" component="label" disabled={isPastYear}>
            채운 CSV 업로드
            <input type="file" accept=".csv" hidden onChange={handleAssignCsvUpload} disabled={isPastYear} />
          </Button>
        </Box>

        {assignParsedRows.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" mb={1}>
              {assignParsedRows.length}건 확인됨 — 저장하면 즉시 반영됩니다.
            </Typography>
            <Box sx={{ overflowX: 'auto', maxHeight: 300, overflow: 'auto' }}>
              <table style={table.table}>
                <thead style={table.thead}>
                  <tr>
                    <th style={table.th}>이메일</th>
                    <th style={table.th}>직함</th>
                    <th style={table.th}>부서</th>
                    <th style={table.th}>담당교과</th>
                    <th style={table.th}>담임</th>
                    <th style={table.th}>사무실</th>
                  </tr>
                </thead>
                <tbody>
                  {assignParsedRows.map((r, i) => (
                    <tr key={i} style={table.tr}>
                      <td style={table.td}>{r.email}</td>
                      <td style={table.td}>{r.positionLabel || '—'}</td>
                      <td style={table.td}>{r.department || '—'}</td>
                      <td style={table.td}>{r.subject || '—'}</td>
                      <td style={table.td}>{r.isHomeroom ? `${r.homeroomGrade}학년 ${r.homeroomClassNo}반` : '—'}</td>
                      <td style={table.td}>{r.office || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Button
              variant="contained"
              onClick={handleSaveAssignUpload}
              disabled={savingAssignUpload}
              sx={{ mt: 1 }}
            >
              {savingAssignUpload ? '저장 중...' : `${assignParsedRows.length}건 저장`}
            </Button>
          </Box>
        )}

        {assignUploadMsg && (
          <Alert severity={assignUploadMsg.includes('✅') ? 'success' : 'error'} sx={{ mt: 2 }}>
            {assignUploadMsg}
          </Alert>
        )}
      </Box>

      {/* 개별 배정 수정 모달 */}
      <Dialog open={!!editingAssignment} onClose={() => setEditingAssignment(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingAssignment?.name} — 배정 정보 ({assignmentYear})
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="직함"
              value={editingAssignment?.positionLabel || ''}
              onChange={e => setEditingAssignment(prev => ({ ...prev, positionLabel: e.target.value }))}
              placeholder="예: 교무부장"
              fullWidth
            />
            <Autocomplete
              freeSolo
              options={departmentOptions}
              value={editingAssignment?.department || ''}
              onInputChange={(e, newValue) => setEditingAssignment(prev => ({ ...prev, department: newValue }))}
              renderInput={(params) => (
                <TextField {...params} label="부서" placeholder="예: 교무부" fullWidth />
              )}
            />
            <Autocomplete
              freeSolo
              options={subjectOptions}
              value={editingAssignment?.subject || ''}
              onInputChange={(e, newValue) => setEditingAssignment(prev => ({ ...prev, subject: newValue }))}
              renderInput={(params) => (
                <TextField {...params} label="담당 교과" placeholder="예: 수학" fullWidth />
              )}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={editingAssignment?.isHomeroom || false}
                  onChange={e => setEditingAssignment(prev => ({ ...prev, isHomeroom: e.target.checked }))}
                />
              }
              label="담임"
            />

            {editingAssignment?.isHomeroom && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>담임 학년</InputLabel>
                  <Select
                    value={editingAssignment?.homeroomGrade || ''}
                    label="담임 학년"
                    onChange={e => setEditingAssignment(prev => ({ ...prev, homeroomGrade: e.target.value }))}
                  >
                    <MenuItem value="">선택</MenuItem>
                    <MenuItem value="1">1학년</MenuItem>
                    <MenuItem value="2">2학년</MenuItem>
                    <MenuItem value="3">3학년</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="담임 반"
                  value={editingAssignment?.homeroomClassNo || ''}
                  onChange={e => setEditingAssignment(prev => ({ ...prev, homeroomClassNo: e.target.value }))}
                  placeholder="예: 3"
                  fullWidth
                />
              </Box>
            )}

            <TextField
              label="사무실"
              value={editingAssignment?.office || ''}
              onChange={e => setEditingAssignment(prev => ({ ...prev, office: e.target.value }))}
              placeholder="예: 교무실"
              fullWidth
              helperText="실제 자리 배치(좌석 위치)는 공간 관리 탭에서 별도로 관리합니다"
            />
            <TextField
              label="업무"
              value={editingAssignment?.duty || ''}
              onChange={e => setEditingAssignment(prev => ({ ...prev, duty: e.target.value }))}
              placeholder="예: 교육과정"
              fullWidth
              helperText="구성원 페이지에 이름 옆 괄호로 표시됩니다"
            />
            <TextField
              label="내선번호"
              value={editingAssignment?.extension || ''}
              onChange={e => setEditingAssignment(prev => ({ ...prev, extension: e.target.value }))}
              placeholder="예: 1234"
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingAssignment(null)}>취소</Button>
          <Button onClick={saveAssignment} disabled={savingAssignment} variant="contained">
            {savingAssignment ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 일괄 수정 모달 */}
      <Dialog open={bulkEditOpen} onClose={() => setBulkEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedUids.size}명 일괄 수정 ({assignmentYear})
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            체크한 항목만 선택된 교원 전체에 적용됩니다. 체크 안 한 항목은 각자 기존 값 유지.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {[
              { key: 'positionLabel', label: '직함', placeholder: '예: 교무부장' },
              { key: 'department', label: '부서', placeholder: '예: 교무부', options: departmentOptions },
              { key: 'subject', label: '담당 교과', placeholder: '예: 수학', options: subjectOptions },
              { key: 'office', label: '사무실', placeholder: '예: 교무실' },
            ].map(f => (
              <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  checked={bulkFields?.[f.key]?.on || false}
                  onChange={e => setBulkFields(prev => ({ ...prev, [f.key]: { ...prev[f.key], on: e.target.checked } }))}
                />
                {f.options ? (
                  <Autocomplete
                    freeSolo
                    fullWidth
                    size="small"
                    options={f.options}
                    value={bulkFields?.[f.key]?.value || ''}
                    disabled={!bulkFields?.[f.key]?.on}
                    onInputChange={(e, newValue) => setBulkFields(prev => ({ ...prev, [f.key]: { ...prev[f.key], value: newValue } }))}
                    renderInput={(params) => <TextField {...params} label={f.label} placeholder={f.placeholder} />}
                  />
                ) : (
                  <TextField
                    label={f.label}
                    value={bulkFields?.[f.key]?.value || ''}
                    onChange={e => setBulkFields(prev => ({ ...prev, [f.key]: { ...prev[f.key], value: e.target.value } }))}
                    placeholder={f.placeholder}
                    disabled={!bulkFields?.[f.key]?.on}
                    fullWidth
                    size="small"
                  />
                )}
              </Box>
            ))}

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Checkbox
                checked={bulkFields?.homeroom?.on || false}
                onChange={e => setBulkFields(prev => ({ ...prev, homeroom: { ...prev.homeroom, on: e.target.checked } }))}
                sx={{ mt: 0.5 }}
              />
              <Box sx={{ flex: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={bulkFields?.homeroom?.isHomeroom || false}
                      disabled={!bulkFields?.homeroom?.on}
                      onChange={e => setBulkFields(prev => ({ ...prev, homeroom: { ...prev.homeroom, isHomeroom: e.target.checked } }))}
                    />
                  }
                  label="담임"
                />
                {bulkFields?.homeroom?.isHomeroom && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>학년</InputLabel>
                      <Select
                        value={bulkFields?.homeroom?.grade || ''}
                        disabled={!bulkFields?.homeroom?.on}
                        label="학년"
                        onChange={e => setBulkFields(prev => ({ ...prev, homeroom: { ...prev.homeroom, grade: e.target.value } }))}
                      >
                        <MenuItem value="">학년</MenuItem>
                        <MenuItem value="1">1학년</MenuItem>
                        <MenuItem value="2">2학년</MenuItem>
                        <MenuItem value="3">3학년</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="반"
                      value={bulkFields?.homeroom?.classNo || ''}
                      disabled={!bulkFields?.homeroom?.on}
                      onChange={e => setBulkFields(prev => ({ ...prev, homeroom: { ...prev.homeroom, classNo: e.target.value } }))}
                      placeholder="반"
                      size="small"
                      sx={{ width: 100 }}
                    />
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkEditOpen(false)}>취소</Button>
          <Button onClick={saveBulkEdit} disabled={savingBulk} variant="contained">
            {savingBulk ? '저장 중...' : `${selectedUids.size}명 저장`}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  )
}

const filterInputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '0.25rem 0.4rem', fontSize: '0.78rem',
  border: '1px solid #d1d5db', borderRadius: '4px', fontWeight: 400, color: '#111827',
}

/** 정렬 가능한 헤더 칸 — 누르면 오름차순/내림차순을 오간다. */
function SortableTh({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey
  return (
    <th
      style={{ ...table.th, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span style={{ color: active ? '#1976d2' : '#c1c7d0', marginLeft: '0.2rem' }}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  )
}

/** 헤더 아래 텍스트 필터 칸. */
function FilterInput({ value, onChange }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="검색"
      style={filterInputStyle}
      onClick={e => e.stopPropagation()}
    />
  )
}

/** 헤더 아래 드롭다운 필터 칸 — 부서·교과·사무실처럼 값이 정해진 열에 쓴다. */
function FilterSelect({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={filterInputStyle}
      onClick={e => e.stopPropagation()}
    >
      <option value="">전체</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}
