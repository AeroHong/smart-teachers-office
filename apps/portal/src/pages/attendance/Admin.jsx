import { useEffect, useState, useRef } from 'react'
import {
  collection, query, where, getDocs, orderBy, limit,
  updateDoc, doc, setDoc, deleteDoc, getDoc, serverTimestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { db, storage, functions } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import Layout from '../../components/Layout'
import { emailToDocId } from '@shared/lib/emailToDocId'

const ROLE_LABELS = {
  teacher: '교직원',
  school_admin: '학교 관리자',
  admin: '학교 관리자',   // 구 시스템 관리자 역할 — school_admin과 동일 처리
  principal: '교감',
}

const CALL_STATUS_STYLE = {
  pending:      { label: '대기 중', bg: '#fdecea', color: '#d32f2f' },
  acknowledged: { label: '확인함',  bg: '#e8f5e9', color: '#2e7d32' },
  done:         { label: '완료',    bg: '#f1f3f4', color: '#5f6368' },
  expired:      { label: '만료',    bg: '#f1f3f4', color: '#9aa0a6' },
}

const STAFF_TYPE_STYLE = {
  '교사':   { bg: '#e0f2fe', color: '#0369a1' },
  '교직원': { bg: '#f0fdf4', color: '#15803d' },
}

// TSV 파싱: "이름\t이메일\t구분" 형식
function parseTsv(text) {
  return text.trim().split(/\r?\n/)
    .map(line => {
      const cols = line.split('\t').map(c => c.trim())
      return { name: cols[0] || '', email: (cols[1] || '').toLowerCase(), staffType: cols[2] || '교사' }
    })
    .filter(r => r.email && r.email.includes('@'))
}

// CSV 파싱: "이름,이메일,구분" 형식
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/\(.*\)/, '').trim().toLowerCase())
  const nameIdx  = headers.findIndex(h => h === '이름' || h === 'name')
  const emailIdx = headers.findIndex(h => h === '이메일' || h === 'email')
  const typeIdx  = headers.findIndex(h => h === '구분' || h === 'stafftype' || h === '직종')
  if (emailIdx === -1) return null
  return lines.slice(1)
    .map(line => {
      const cols = line.split(',').map(v => v.trim())
      return {
        name: nameIdx !== -1 ? cols[nameIdx] || '' : '',
        email: (cols[emailIdx] || '').toLowerCase(),
        staffType: typeIdx !== -1 ? cols[typeIdx] || '교사' : '교사',
      }
    })
    .filter(r => r.email && r.email.includes('@'))
}

function downloadCsvTemplate() {
  const rows = ['이름,이메일,구분(교사/교직원)', '홍길동,hong@school.hs.kr,교사', '김철수,kim@school.hs.kr,교직원'].join('\n')
  const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '사전등록_양식.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function Admin() {
  const { schoolId } = useAuth()
  const [tab, setTab] = useState('pending')   // 'pending' | 'teachers' | 'preapprove' | 'students' | 'assignments' | 'callsystem' | 'settings'

  const [pendingList, setPendingList]   = useState([])
  const [teacherList, setTeacherList]   = useState([])
  const [preApproved, setPreApproved]   = useState([])  // 사전 등록 목록
  const [studentList, setStudentList]   = useState([])
  const [studentSearch, setStudentSearch] = useState('')
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
      .filter(u => ['teacher', 'school_admin', 'admin', 'principal'].includes(u.role))

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

  useEffect(() => {
    if (tab === 'pending')          fetchPending()
    else if (tab === 'teachers')    fetchTeachers()
    else if (tab === 'preapprove')  fetchPreApproved()
    else if (tab === 'students')    fetchStudents()
    else if (tab === 'callsystem')  fetchCallSystem()
    else if (tab === 'settings')    setLoading(false)
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

  const removeMember = async (u) => {
    const label = u.name || u.email
    if (u._preOnly) {
      // 사전 등록 미접속 계정: preApproved에서 제거
      if (!window.confirm(`${label}님을 사전 등록 명단에서 제거하시겠습니까?`)) return
      const docId = emailToDocId(u.email)
      await deleteDoc(doc(db, 'schools', schoolId, 'preApproved', docId))
    } else {
      // 실제 계정: 역할을 rejected로 변경 → 시스템 접근 차단
      if (!window.confirm(`${label}님을 구성원에서 제거하시겠습니까?\n\n제거된 계정은 시스템에 접근할 수 없습니다.`)) return
      await updateDoc(doc(db, 'users', u.id), { role: 'rejected' })
    }
    setTeacherList(prev => prev.filter(t => t.id !== u.id))
  }

  const editName = async (uid, currentName) => {
    const newName = window.prompt('이름을 수정하세요:', currentName || '')
    if (newName === null) return
    const trimmed = newName.trim()
    if (!trimmed || trimmed === currentName) return
    await updateDoc(doc(db, 'users', uid), { name: trimmed })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, name: trimmed } : u))
  }

  // ── 학생 명단 탭 액션 ──────────────────────────────────────
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

  // ── 교원 배정 탭 ──────────────────────────────────────────
  const currentSchoolYear = () => {
    const now = new Date()
    const month = now.getMonth() + 1
    return month <= 2 ? now.getFullYear() - 1 : now.getFullYear()
  }
  const [assignmentYear, setAssignmentYear] = useState(currentSchoolYear())
  const [assignmentRows, setAssignmentRows] = useState([])  // [{ uid, name, email, staffType, assignment }]
  const [editingAssignment, setEditingAssignment] = useState(null)  // { uid, name, ...form }
  const [savingAssignment, setSavingAssignment] = useState(false)

  const fetchAssignments = async () => {
    if (!schoolId) return
    setLoading(true)
    const [usersSnap, assignSnap] = await Promise.all([
      getDocs(query(
        collection(db, 'users'),
        where('schoolId', '==', schoolId),
        where('role', 'in', ['teacher', 'admin', 'school_admin', 'principal']),
      )),
      getDocs(query(
        collection(db, 'schools', schoolId, 'teacherAssignments'),
        where('year', '==', assignmentYear),
      )),
    ])
    const assignByUid = {}
    assignSnap.docs.forEach(d => { assignByUid[d.data().uid] = { id: d.id, ...d.data() } })

    setAssignmentRows(
      usersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .map(u => ({ uid: u.id, name: u.name, email: u.email, staffType: u.staffType, assignment: assignByUid[u.id] || null }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    )
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'assignments') fetchAssignments()
  }, [tab, schoolId, assignmentYear])

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
    })
  }

  const saveAssignment = async () => {
    if (!editingAssignment) return
    setSavingAssignment(true)
    try {
      const { uid, name, homeroomGrade, homeroomClassNo, ...form } = editingAssignment
      const docId = `${assignmentYear}_${uid}`
      await setDoc(doc(db, 'schools', schoolId, 'teacherAssignments', docId), {
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

  // ── 교원 배정 일괄 수정(다중 선택) ────────────────────────
  const [selectedUids, setSelectedUids] = useState(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkFields, setBulkFields] = useState(null)
  const [savingBulk, setSavingBulk] = useState(false)

  const toggleSelectUid = (uid) => {
    setSelectedUids(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  const toggleSelectAllAssignments = () => {
    setSelectedUids(prev =>
      prev.size === assignmentRows.length ? new Set() : new Set(assignmentRows.map(r => r.uid))
    )
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
        setDoc(doc(db, 'schools', schoolId, 'teacherAssignments', `${assignmentYear}_${uid}`), {
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

  // ── 교원 배정 CSV 일괄 업로드 ───────────────────────────────
  const [assignParsedRows, setAssignParsedRows] = useState([])
  const [assignUploadMsg, setAssignUploadMsg] = useState('')
  const [savingAssignUpload, setSavingAssignUpload] = useState(false)

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

  // 현재 학년도 교원 명단 + 기존 배정값을 CSV로 다운로드 (엑셀에서 채워서 재업로드하는 용도)
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
        await setDoc(doc(db, 'schools', schoolId, 'teacherAssignments', `${assignmentYear}_${uid}`), {
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

  // ── 성취평가제 과목 배정에서 담당 교과 가져오기 ─────────────
  // asaSubjects.teacherEmails 기준으로 교사별 담당 과목을 모아 teacherAssignments.subject만 갱신
  // (다른 필드는 건드리지 않음). asaSubjects는 연도 필드가 없어 항상 "현재" 값 기준.
  const [asaImportPreview, setAsaImportPreview] = useState(null)
  const [asaImportLoading, setAsaImportLoading] = useState(false)
  const [savingAsaImport, setSavingAsaImport] = useState(false)

  const previewAsaSubjectImport = async () => {
    setAsaImportLoading(true)
    try {
      const snap = await getDocs(collection(db, 'schools', schoolId, 'asaSubjects'))
      const subjectsByEmail = {}
      snap.docs.forEach(d => {
        const data = d.data()
        ;(data.teacherEmails || []).forEach(email => {
          const key = email.toLowerCase()
          if (!subjectsByEmail[key]) subjectsByEmail[key] = new Set()
          if (data.name) subjectsByEmail[key].add(data.name)
        })
      })

      const emailToRow = {}
      assignmentRows.forEach(r => { if (r.email) emailToRow[r.email.toLowerCase()] = r })

      const preview = Object.entries(subjectsByEmail)
        .map(([email, subjectSet]) => {
          const row = emailToRow[email]
          if (!row) return null
          const newSubject = [...subjectSet].sort().join(', ')
          return { uid: row.uid, name: row.name, email, currentSubject: row.assignment?.subject || '', newSubject }
        })
        .filter(row => row && row.newSubject !== row.currentSubject)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))

      setAsaImportPreview(preview)
    } catch (err) {
      alert('불러오기 실패: ' + err.message)
    } finally {
      setAsaImportLoading(false)
    }
  }

  const applyAsaSubjectImport = async () => {
    if (!asaImportPreview || asaImportPreview.length === 0) return
    setSavingAsaImport(true)
    try {
      await Promise.all(asaImportPreview.map(row =>
        setDoc(doc(db, 'schools', schoolId, 'teacherAssignments', `${assignmentYear}_${row.uid}`), {
          uid: row.uid, year: assignmentYear, subject: row.newSubject, updatedAt: serverTimestamp(),
        }, { merge: true })
      ))
      setAsaImportPreview(null)
      await fetchAssignments()
    } catch (err) {
      alert('반영 실패: ' + err.message)
    } finally {
      setSavingAsaImport(false)
    }
  }

  // ── 호출 시스템 탭 ────────────────────────────────────────
  const [callOffices, setCallOffices] = useState([])
  const [pairOffice, setPairOffice] = useState('')
  const [pairDeviceType, setPairDeviceType] = useState('input')
  const [issuedCode, setIssuedCode] = useState(null)   // { code, office, deviceType, expiresAt }
  const [issuingCode, setIssuingCode] = useState(false)
  const [recentCalls, setRecentCalls] = useState([])

  const fetchCallSystem = async () => {
    if (!schoolId) return
    setLoading(true)
    const [assignSnap, callSnap] = await Promise.all([
      getDocs(query(
        collection(db, 'schools', schoolId, 'teacherAssignments'),
        where('year', '==', currentSchoolYear()),
      )),
      getDocs(query(
        collection(db, 'schools', schoolId, 'callRequests'),
        orderBy('createdAt', 'desc'),
        limit(30),
      )),
    ])

    // 사무실 목록은 별도 컬렉션 없이 교원 배정의 office 값을 그대로 집계
    const offices = [...new Set(
      assignSnap.docs.map(d => (d.data().office || '').trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ko'))

    setCallOffices(offices)
    setPairOffice(prev => (prev && offices.includes(prev)) ? prev : (offices[0] || ''))
    setRecentCalls(callSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const issuePairingCode = async () => {
    if (!pairOffice) return
    setIssuingCode(true)
    setIssuedCode(null)
    try {
      const gen = httpsCallable(functions, 'generatePairingCode')
      const { data } = await gen({ schoolId, office: pairOffice, deviceType: pairDeviceType })
      setIssuedCode({ ...data, office: pairOffice, deviceType: pairDeviceType })
    } catch (err) {
      alert('코드 발급 실패: ' + err.message)
    } finally {
      setIssuingCode(false)
    }
  }

  // ── 학교 설정 탭 ──────────────────────────────────────────
  const [logoUrl, setLogoUrl] = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [studentDomain, setStudentDomain] = useState('')
  const [studentDomainInput, setStudentDomainInput] = useState('')
  const [savingDomain, setSavingDomain] = useState(false)

  // Workspace 자동 동기화 설정
  const [wsEnabled, setWsEnabled] = useState(false)
  const [wsAdminEmail, setWsAdminEmail] = useState('')
  const [wsStaffOu, setWsStaffOu] = useState('')
  const [wsStudentOu, setWsStudentOu] = useState('')
  const [savingWs, setSavingWs] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    if (tab !== 'settings' || !schoolId) return
    getDoc(doc(db, 'schools', schoolId))
      .then(snap => {
        const data = snap.data() || {}
        setLogoUrl(data.logoUrl || null)
        setStudentDomain(data.studentDomain || '')
        setStudentDomainInput(data.studentDomain || '')
        const ws = data.workspaceSync || {}
        setWsEnabled(!!ws.enabled)
        setWsAdminEmail(ws.adminEmail || '')
        setWsStaffOu(ws.staffOuPath || '')
        setWsStudentOu(ws.studentOuPath || '')
      })
      .catch(() => {})
  }, [tab, schoolId])

  const handleSaveWorkspaceSync = async () => {
    setSavingWs(true)
    setSyncMsg('')
    try {
      await updateDoc(doc(db, 'schools', schoolId), {
        workspaceSync: {
          enabled: wsEnabled,
          adminEmail: wsAdminEmail.trim(),
          staffOuPath: wsStaffOu.trim(),
          studentOuPath: wsStudentOu.trim(),
        },
      })
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSavingWs(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncingNow(true)
    setSyncMsg('')
    try {
      const run = httpsCallable(functions, 'runWorkspaceSyncNow')
      const { data } = await run({ schoolId })
      const { staff, students } = data.result || {}
      const parts = []
      if (staff) parts.push(`교직원 사전등록 신규 ${staff.created}·갱신 ${staff.updated}·정리 ${staff.removed} (전체 ${staff.total}명)`)
      if (students) parts.push(`학생 신규 ${students.created}·갱신 ${students.updated} (전체 ${students.total}명, 형식 불일치 ${students.skipped}건)`)
      setSyncMsg('✅ 동기화 완료 — ' + parts.join(' / '))
    } catch (err) {
      setSyncMsg('❌ 동기화 실패: ' + err.message)
    } finally {
      setSyncingNow(false)
    }
  }

  const handleSaveStudentDomain = async () => {
    setSavingDomain(true)
    try {
      await updateDoc(doc(db, 'schools', schoolId), { studentDomain: studentDomainInput.trim() })
      setStudentDomain(studentDomainInput.trim())
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSavingDomain(false)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다.'); return }
    if (file.size > 500 * 1024) { alert('파일 크기는 500KB 이하여야 합니다.'); return }
    setLogoUploading(true)
    try {
      const storageRef = ref(storage, `schools/${schoolId}/logo`)
      await uploadBytes(storageRef, file, { contentType: file.type })
      const url = await getDownloadURL(storageRef)
      await updateDoc(doc(db, 'schools', schoolId), { logoUrl: url })
      setLogoUrl(url)
    } catch (err) {
      alert('업로드 실패: ' + err.message)
    } finally {
      setLogoUploading(false)
      e.target.value = ''
    }
  }

  const handleLogoDelete = async () => {
    if (!window.confirm('학교 로고를 삭제하시겠습니까?')) return
    try {
      await deleteObject(ref(storage, `schools/${schoolId}/logo`)).catch(() => {})
      await updateDoc(doc(db, 'schools', schoolId), { logoUrl: null })
      setLogoUrl(null)
    } catch (err) {
      alert('삭제 실패: ' + err.message)
    }
  }

  // ── 사전 등록 탭 ──────────────────────────────────────────
  const [pasteText, setPasteText] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const csvInputRef = useRef(null)

  const handleParse = () => {
    const rows = parseTsv(pasteText)
    if (rows.length === 0) {
      alert('유효한 데이터가 없습니다.\n형식: 이름 TAB 이메일 TAB 구분(교사/교직원)')
      return
    }
    setParsedRows(rows)
  }

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows === null) { setSaveMsg('CSV 헤더에 "이메일" 또는 "email" 열이 필요합니다.'); return }
      if (rows.length === 0) { setSaveMsg('유효한 데이터가 없습니다.'); return }
      setParsedRows(rows)
      setPasteText('')
      setSaveMsg('')
    } catch (e) {
      setSaveMsg('파일 읽기 실패: ' + e.message)
    }
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
        <button onClick={() => setTab('students')}
          style={{ ...styles.tab, ...(tab === 'students' ? styles.tabActive : {}) }}>
          학생 명단
        </button>
        <button onClick={() => setTab('assignments')}
          style={{ ...styles.tab, ...(tab === 'assignments' ? styles.tabActive : {}) }}>
          교원 배정
        </button>
        <button onClick={() => setTab('callsystem')}
          style={{ ...styles.tab, ...(tab === 'callsystem' ? styles.tabActive : {}) }}>
          호출 시스템
        </button>
        <button onClick={() => setTab('settings')}
          style={{ ...styles.tab, ...(tab === 'settings' ? styles.tabActive : {}) }}>
          학교 설정
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
                <th style={styles.th}>삭제</th>
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
                          backgroundColor: (u.role === 'school_admin' || u.role === 'admin') ? '#f3e5f5' : '#f0f0f0',
                          color: (u.role === 'school_admin' || u.role === 'admin') ? '#7b1fa2' : '#555',
                        }}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {isPreOnly ? (
                        <span style={styles.muted}>로그인 후 활성화</span>
                      ) : (
                        <>
                          {u.role !== 'teacher' && (
                            <button onClick={() => changeRole(u.id, 'teacher')} style={styles.changeBtn}>교사로</button>
                          )}
                          {u.role !== 'principal' && (
                            <button onClick={() => changeRole(u.id, 'principal')} style={styles.principalBtn}>교감으로</button>
                          )}
                          {u.role !== 'school_admin' && (
                            <button onClick={() => changeRole(u.id, 'school_admin')} style={styles.schoolAdminBtn}>관리자로</button>
                          )}
                        </>
                      )}
                    </td>
                    <td style={styles.td}>
                      <button onClick={() => removeMember(u)} style={styles.rejectBtn}>제거</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )

      ) : tab === 'students' ? (

        /* ── 학생 명단 탭 ── */
        <div>
          <input
            value={studentSearch}
            onChange={e => setStudentSearch(e.target.value)}
            placeholder="이름·학번·이메일 검색"
            style={{ ...styles.input, maxWidth: '260px', marginBottom: '1rem' }}
          />
          {studentList.length === 0 ? (
            <p style={styles.empty}>등록된 학생이 없습니다. Workspace 동기화를 사용 중이면 학교 설정 탭에서 실행해보세요.</p>
          ) : filteredStudents.length === 0 ? (
            <p style={styles.empty}>검색 결과가 없습니다.</p>
          ) : (
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
          )}
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.75rem' }}>
            총 {studentList.length}명{studentSearch.trim() && ` · 검색결과 ${filteredStudents.length}명`}
          </p>
        </div>

      ) : tab === 'assignments' ? (

        /* ── 교원 배정 탭 ── */
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.85rem', color: '#64748b' }}>학년도</label>
            <select
              value={assignmentYear}
              onChange={e => setAssignmentYear(Number(e.target.value))}
              style={styles.select}
            >
              {Array.from({ length: 5 }, (_, i) => currentSchoolYear() - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {selectedUids.size > 0 && (
              <button onClick={openBulkEdit} style={styles.schoolAdminBtn}>
                선택 {selectedUids.size}명 일괄 수정
              </button>
            )}
          </div>

          {assignmentRows.length === 0 ? (
            <p style={styles.empty}>소속 교직원이 없습니다.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>
                    <input
                      type="checkbox"
                      checked={selectedUids.size === assignmentRows.length}
                      onChange={toggleSelectAllAssignments}
                    />
                  </th>
                  <th style={styles.th}>이름</th>
                  <th style={styles.th}>직함</th>
                  <th style={styles.th}>부서</th>
                  <th style={styles.th}>담당 교과</th>
                  <th style={styles.th}>담임</th>
                  <th style={styles.th}>사무실</th>
                  <th style={styles.th}>수정</th>
                </tr>
              </thead>
              <tbody>
                {assignmentRows.map(row => {
                  const a = row.assignment
                  return (
                    <tr key={row.uid}>
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          checked={selectedUids.has(row.uid)}
                          onChange={() => toggleSelectUid(row.uid)}
                        />
                      </td>
                      <td style={styles.td}>{row.name || '—'}</td>
                      <td style={styles.td}>{a?.positionLabel || '—'}</td>
                      <td style={styles.td}>{a?.department || '—'}</td>
                      <td style={styles.td}>{a?.subject || '—'}</td>
                      <td style={styles.td}>{a?.isHomeroom ? `${a.homeroomGrade || ''}학년 ${a.homeroomClassNo || ''}반` : '—'}</td>
                      <td style={styles.td}>{a?.office || '—'}</td>
                      <td style={styles.td}>
                        <button onClick={() => openAssignmentModal(row)} style={styles.approveBtn}>배정 수정</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333', marginBottom: '0.35rem' }}>일괄 업로드</p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
              1) 현재 명단을 CSV로 받아서 엑셀로 채운 뒤 2) 다시 올리면 반영됩니다. <strong>이메일</strong> 열로 구성원 목록과 매칭합니다.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={downloadAssignmentCsv} style={styles.changeBtn}>
                현재 명단 CSV 다운로드 ({assignmentYear})
              </button>
              <label style={{ ...styles.changeBtn, display: 'inline-block' }}>
                채운 CSV 업로드
                <input type="file" accept=".csv" hidden onChange={handleAssignCsvUpload} />
              </label>
            </div>

            {assignParsedRows.length > 0 && (
              <div style={{ marginTop: '0.9rem' }}>
                <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>{assignParsedRows.length}건 확인됨 — 저장하면 즉시 반영됩니다.</p>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>이메일</th>
                      <th style={styles.th}>직함</th>
                      <th style={styles.th}>부서</th>
                      <th style={styles.th}>담당교과</th>
                      <th style={styles.th}>담임</th>
                      <th style={styles.th}>사무실</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignParsedRows.map((r, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{r.email}</td>
                        <td style={styles.td}>{r.positionLabel || '—'}</td>
                        <td style={styles.td}>{r.department || '—'}</td>
                        <td style={styles.td}>{r.subject || '—'}</td>
                        <td style={styles.td}>{r.isHomeroom ? `${r.homeroomGrade}학년 ${r.homeroomClassNo}반` : '—'}</td>
                        <td style={styles.td}>{r.office || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={handleSaveAssignUpload} disabled={savingAssignUpload} style={{ ...styles.approveBtn, marginTop: '0.75rem' }}>
                  {savingAssignUpload ? '저장 중...' : `${assignParsedRows.length}건 저장`}
                </button>
              </div>
            )}
            {assignUploadMsg && (
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.6rem' }}>{assignUploadMsg}</p>
            )}
          </div>

          <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333', marginBottom: '0.35rem' }}>
              성취평가제 과목 배정에서 담당 교과 가져오기
            </p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
              도구모음 &gt; 성취평가제 체크리스트의 과목 관리에서 지정한 담당 교사를 기준으로 담당 교과만 채웁니다
              (직함·부서·담임·사무실은 안 건드림). 성취평가제 과목은 학년도 구분이 없어 항상 현재 등록된 값 기준입니다.
            </p>
            <button onClick={previewAsaSubjectImport} disabled={asaImportLoading} style={styles.changeBtn}>
              {asaImportLoading ? '불러오는 중...' : '변경사항 미리보기'}
            </button>

            {asaImportPreview && (
              asaImportPreview.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.75rem' }}>변경할 내용이 없습니다 — 이미 최신 상태입니다.</p>
              ) : (
                <div style={{ marginTop: '0.9rem' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>이름</th>
                        <th style={styles.th}>기존 담당 교과</th>
                        <th style={styles.th}>변경 후</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asaImportPreview.map(row => (
                        <tr key={row.uid}>
                          <td style={styles.td}>{row.name || row.email}</td>
                          <td style={styles.td}>{row.currentSubject || '—'}</td>
                          <td style={styles.td}><strong>{row.newSubject}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={applyAsaSubjectImport} disabled={savingAsaImport} style={{ ...styles.approveBtn, marginTop: '0.75rem' }}>
                    {savingAsaImport ? '반영 중...' : `${asaImportPreview.length}명 반영`}
                  </button>
                </div>
              )
            )}
          </div>
        </div>

      ) : tab === 'callsystem' ? (

        /* ── 호출 시스템 탭 ── */
        <div>
          <div style={styles.infoBox}>
            사무실 앞 <strong>학생용 입력 기기</strong>와 사무실 내부 <strong>현황판 기기</strong>를 각각 등록합니다.
            기기에서 호출 사이트를 연 뒤 아래에서 발급한 6자리 코드를 입력하면 등록이 완료되며, 재부팅 후에도 유지됩니다.
          </div>

          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333', marginBottom: '0.75rem' }}>기기 등록 코드 발급</p>

          {callOffices.length === 0 ? (
            <p style={styles.empty}>
              등록된 사무실이 없습니다. 교원 배정 탭에서 교원별 사무실을 먼저 입력해 주세요.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                <select value={pairOffice} onChange={e => setPairOffice(e.target.value)} style={styles.select}>
                  {callOffices.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select value={pairDeviceType} onChange={e => setPairDeviceType(e.target.value)} style={styles.select}>
                  <option value="input">학생용 입력 기기</option>
                  <option value="display">사무실 현황판</option>
                </select>
                <button onClick={issuePairingCode} disabled={issuingCode} style={styles.approveBtn}>
                  {issuingCode ? '발급 중...' : '코드 발급'}
                </button>
              </div>

              {issuedCode && (
                <div style={{
                  border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: 8,
                  padding: '1rem 1.25rem', marginBottom: '1.25rem', maxWidth: 460,
                }}>
                  <p style={{ fontSize: '0.8rem', color: '#1e40af', margin: 0 }}>
                    {issuedCode.office} · {issuedCode.deviceType === 'display' ? '사무실 현황판' : '학생용 입력 기기'}
                  </p>
                  <p style={{
                    fontSize: '2.6rem', fontWeight: 800, letterSpacing: '0.4rem',
                    color: '#1e3a8a', margin: '0.35rem 0',
                  }}>
                    {issuedCode.code}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                    10분 내 기기에서 입력하세요 (만료: {new Date(issuedCode.expiresAt).toLocaleTimeString('ko-KR')})
                  </p>
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333', marginBottom: '0.75rem' }}>최근 호출 내역</p>
            {recentCalls.length === 0 ? (
              <p style={styles.empty}>호출 기록이 없습니다.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>시각</th>
                    <th style={styles.th}>사무실</th>
                    <th style={styles.th}>학생</th>
                    <th style={styles.th}>호출 대상</th>
                    <th style={styles.th}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map(c => (
                    <tr key={c.id}>
                      <td style={styles.td}>
                        {c.createdAt?.toDate?.().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—'}
                      </td>
                      <td style={styles.td}>{c.office || '—'}</td>
                      <td style={styles.td}>{c.grade}-{c.classNo}-{c.number} {c.studentName}</td>
                      <td style={styles.td}>{c.teacherName || '—'}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.roleBadge,
                          backgroundColor: CALL_STATUS_STYLE[c.status]?.bg || '#f0f0f0',
                          color: CALL_STATUS_STYLE[c.status]?.color || '#555',
                        }}>
                          {CALL_STATUS_STYLE[c.status]?.label || c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      ) : tab === 'settings' ? (

        /* ── 학교 설정 탭 ── */
        <div>
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333', marginBottom: '1rem' }}>학교 로고</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {/* 미리보기 */}
            <div style={{
              width: 80, height: 80, borderRadius: 12,
              border: '1.5px dashed #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#f8fafc', flexShrink: 0, overflow: 'hidden',
            }}>
              {logoUrl
                ? <img src={logoUrl} alt="로고" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: '2rem' }}>🏫</span>
              }
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{
                display: 'inline-block',
                padding: '0.35rem 0.9rem',
                backgroundColor: logoUploading ? '#93c5fd' : '#1a73e8',
                color: '#fff', border: 'none', borderRadius: 6, cursor: logoUploading ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem', fontWeight: 600,
              }}>
                {logoUploading ? '업로드 중...' : '로고 업로드'}
                <input
                  type="file" accept="image/*" hidden
                  disabled={logoUploading}
                  onChange={handleLogoUpload}
                />
              </label>
              {logoUrl && (
                <button onClick={handleLogoDelete} style={styles.rejectBtn}>
                  로고 삭제
                </button>
              )}
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
            PNG, JPG, SVG 권장 · 최대 500KB · 정사각형 이미지가 가장 잘 표시됩니다.<br />
            업로드 후 페이지를 새로고침하면 사이드바에 반영됩니다.
          </p>

          <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333', marginBottom: '0.35rem' }}>학생 이메일 도메인</p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
              학생 명단에서 이메일 자동 생성에 사용됩니다. 비워두면 학생 추가 시 이메일을 직접 입력합니다.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={studentDomainInput}
                onChange={e => setStudentDomainInput(e.target.value)}
                placeholder="예: seonyoo.hs.kr"
                style={{ ...styles.input, maxWidth: '220px' }}
              />
              <button onClick={handleSaveStudentDomain} disabled={savingDomain} style={styles.approveBtn}>
                {savingDomain ? '저장 중...' : '저장'}
              </button>
            </div>
            {studentDomain && (
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.4rem' }}>
                현재 설정: @{studentDomain}
              </p>
            )}
          </div>

          <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333', marginBottom: '0.35rem' }}>
              Google Workspace 자동 동기화
            </p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
              매일 새벽 3시, Workspace 조직단위(OU) 기준으로 교직원 사전등록·학생 명단을 자동 갱신합니다.
            </p>

            <div style={{
              backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '0.9rem 1rem', marginBottom: '1.1rem', fontSize: '0.78rem', color: '#475569',
            }}>
              <p style={{ fontWeight: 700, marginBottom: '0.4rem', color: '#334155' }}>
                처음 설정하는 학교라면 먼저 필요한 것
              </p>
              <p style={{ marginBottom: '0.5rem', lineHeight: 1.6 }}>
                서비스계정은 학교마다 새로 만들지 않고 공용으로 씁니다. 대신 <strong>우리 학교 Workspace 최고관리자가
                자기 학교 admin.google.com</strong>에서 아래 클라이언트 ID를 도메인 전체 위임으로 직접 승인해야 합니다
                (다른 학교 관리자가 대신 해줄 수 없음).
              </p>
              <p style={{ margin: '0.3rem 0 0.15rem' }}>
                경로: 보안 → API 제어 → 도메인 전체 위임 관리 → 새로 추가
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.3rem 0' }}>
                <code style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '0.15rem 0.5rem' }}>
                  클라이언트 ID: 109872053946219411555
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText('109872053946219411555')}
                  style={{ ...styles.editNameBtn, opacity: 1, fontSize: '0.72rem' }}
                >복사</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', margin: '0.3rem 0' }}>
                <code style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '0.15rem 0.5rem', wordBreak: 'break-all' }}>
                  범위(OAuth Scopes): https://www.googleapis.com/auth/admin.directory.user.readonly,https://www.googleapis.com/auth/admin.directory.orgunit.readonly
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText('https://www.googleapis.com/auth/admin.directory.user.readonly,https://www.googleapis.com/auth/admin.directory.orgunit.readonly')}
                  style={{ ...styles.editNameBtn, opacity: 1, fontSize: '0.72rem', flexShrink: 0 }}
                >복사</button>
              </div>
              <p style={{ marginTop: '0.5rem' }}>
                승인이 끝난 뒤에 아래 항목(관리자 이메일·OU 경로)을 채우고 저장하면 됩니다.
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              <input type="checkbox" checked={wsEnabled} onChange={e => setWsEnabled(e.target.checked)} />
              동기화 사용
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: '360px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>
                  대리 인증(impersonate)할 Workspace 관리자 이메일
                </label>
                <input
                  value={wsAdminEmail}
                  onChange={e => setWsAdminEmail(e.target.value)}
                  placeholder="예: seonyoo@seonyoo.hs.kr"
                  style={styles.input}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>
                  교직원 OU 경로
                </label>
                <input
                  value={wsStaffOu}
                  onChange={e => setWsStaffOu(e.target.value)}
                  placeholder="예: /교원 (관리 콘솔 > 디렉토리 > 조직단위의 실제 경로, 최상위 조직명은 포함하지 않음)"
                  style={styles.input}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>
                  학생 OU 경로 (학년도가 바뀌면 매년 갱신 필요)
                </label>
                <input
                  value={wsStudentOu}
                  onChange={e => setWsStudentOu(e.target.value)}
                  placeholder="예: /학생 2026 (하위 학년 OU가 있어도 자동 포함됨)"
                  style={styles.input}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
              <button onClick={handleSaveWorkspaceSync} disabled={savingWs} style={styles.approveBtn}>
                {savingWs ? '저장 중...' : '설정 저장'}
              </button>
              <button onClick={handleSyncNow} disabled={syncingNow || !wsEnabled} style={styles.schoolAdminBtn}>
                {syncingNow ? '동기화 중...' : '지금 동기화'}
              </button>
            </div>
            {syncMsg && (
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.6rem' }}>{syncMsg}</p>
            )}
          </div>
        </div>

      ) : (

        /* ── 사전 등록 탭 ── */
        <div>
          {/* 안내 */}
          <div style={styles.infoBox}>
            <strong>사전 등록이란?</strong> 교사 명단을 미리 등록해두면, 해당 선생님이 구글 계정으로 첫 로그인 시
            승인 대기 없이 바로 <strong>교직원</strong> 역할로 자동 활성화됩니다.
          </div>

          {/* 입력 방법 선택 */}
          <div style={{ marginBottom: '1.5rem' }}>
            {/* CSV 업로드 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCsvUpload} />
              <button onClick={() => { setSaveMsg(''); setParsedRows([]); csvInputRef.current?.click() }} style={styles.approveBtn}>
                CSV 파일 업로드
              </button>
              <button onClick={downloadCsvTemplate} style={styles.changeBtn}>
                양식 다운로드
              </button>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>또는 아래에 붙여넣기</span>
            </div>

            {/* 붙여넣기 입력 */}
            <p style={{ fontSize: '0.88rem', color: '#555', marginBottom: '0.5rem' }}>
              엑셀/스프레드시트에서 <strong>이름 → 이메일(구글계정) → 구분(교사/교직원)</strong> 열을 복사 후 붙여넣기 하세요.
            </p>
            <textarea
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setParsedRows([]) }}
              placeholder={'홍길동\thong@seonyoo.hs.kr\t교사\n김철수\tkim@seonyoo.hs.kr\t교직원'}
              rows={5}
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

      {editingAssignment && (
        <div style={styles.modalOverlay} onClick={() => setEditingAssignment(null)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>{editingAssignment.name} — 배정 정보 ({assignmentYear})</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={styles.modalLabel}>
                직함
                <input
                  value={editingAssignment.positionLabel}
                  onChange={e => setEditingAssignment(prev => ({ ...prev, positionLabel: e.target.value }))}
                  placeholder="예: 교무부장"
                  style={styles.input}
                />
              </label>
              <label style={styles.modalLabel}>
                부서
                <input
                  value={editingAssignment.department}
                  onChange={e => setEditingAssignment(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="예: 교무부"
                  style={styles.input}
                />
              </label>
              <label style={styles.modalLabel}>
                담당 교과
                <input
                  value={editingAssignment.subject}
                  onChange={e => setEditingAssignment(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="예: 수학"
                  style={styles.input}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={editingAssignment.isHomeroom}
                  onChange={e => setEditingAssignment(prev => ({ ...prev, isHomeroom: e.target.checked }))}
                />
                담임
              </label>
              {editingAssignment.isHomeroom && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <label style={{ ...styles.modalLabel, flex: 1 }}>
                    담임 학년
                    <select
                      value={editingAssignment.homeroomGrade}
                      onChange={e => setEditingAssignment(prev => ({ ...prev, homeroomGrade: e.target.value }))}
                      style={styles.select}
                    >
                      <option value="">선택</option>
                      <option value="1">1학년</option>
                      <option value="2">2학년</option>
                      <option value="3">3학년</option>
                    </select>
                  </label>
                  <label style={{ ...styles.modalLabel, flex: 1 }}>
                    담임 반
                    <input
                      value={editingAssignment.homeroomClassNo}
                      onChange={e => setEditingAssignment(prev => ({ ...prev, homeroomClassNo: e.target.value }))}
                      placeholder="예: 3"
                      style={styles.input}
                    />
                  </label>
                </div>
              )}
              <label style={styles.modalLabel}>
                사무실
                <input
                  value={editingAssignment.office}
                  onChange={e => setEditingAssignment(prev => ({ ...prev, office: e.target.value }))}
                  placeholder="예: 교무실"
                  style={styles.input}
                />
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>
                  실제 자리 배치(좌석 위치)는 호출 대시보드 앱에서 별도로 관리 예정
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingAssignment(null)} style={styles.rejectBtn}>취소</button>
              <button onClick={saveAssignment} disabled={savingAssignment} style={styles.approveBtn}>
                {savingAssignment ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkEditOpen && bulkFields && (
        <div style={styles.modalOverlay} onClick={() => setBulkEditOpen(false)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{selectedUids.size}명 일괄 수정 ({assignmentYear})</h3>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '1rem' }}>
              체크한 항목만 선택된 교원 전체에 적용됩니다. 체크 안 한 항목은 각자 기존 값 유지.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { key: 'positionLabel', label: '직함', placeholder: '예: 교무부장' },
                { key: 'department', label: '부서', placeholder: '예: 교무부' },
                { key: 'subject', label: '담당 교과', placeholder: '예: 수학' },
                { key: 'office', label: '사무실', placeholder: '예: 교무실' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={bulkFields[f.key].on}
                    onChange={e => setBulkFields(prev => ({ ...prev, [f.key]: { ...prev[f.key], on: e.target.checked } }))}
                  />
                  <label style={{ ...styles.modalLabel, flex: 1 }}>
                    {f.label}
                    <input
                      value={bulkFields[f.key].value}
                      onChange={e => setBulkFields(prev => ({ ...prev, [f.key]: { ...prev[f.key], value: e.target.value } }))}
                      placeholder={f.placeholder}
                      disabled={!bulkFields[f.key].on}
                      style={styles.input}
                    />
                  </label>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={bulkFields.homeroom.on}
                  onChange={e => setBulkFields(prev => ({ ...prev, homeroom: { ...prev.homeroom, on: e.target.checked } }))}
                  style={{ marginTop: '0.3rem' }}
                />
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                    <input
                      type="checkbox"
                      checked={bulkFields.homeroom.isHomeroom}
                      disabled={!bulkFields.homeroom.on}
                      onChange={e => setBulkFields(prev => ({ ...prev, homeroom: { ...prev.homeroom, isHomeroom: e.target.checked } }))}
                    />
                    담임
                  </label>
                  {bulkFields.homeroom.isHomeroom && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select
                        value={bulkFields.homeroom.grade}
                        disabled={!bulkFields.homeroom.on}
                        onChange={e => setBulkFields(prev => ({ ...prev, homeroom: { ...prev.homeroom, grade: e.target.value } }))}
                        style={styles.select}
                      >
                        <option value="">학년</option>
                        <option value="1">1학년</option>
                        <option value="2">2학년</option>
                        <option value="3">3학년</option>
                      </select>
                      <input
                        value={bulkFields.homeroom.classNo}
                        disabled={!bulkFields.homeroom.on}
                        onChange={e => setBulkFields(prev => ({ ...prev, homeroom: { ...prev.homeroom, classNo: e.target.value } }))}
                        placeholder="반"
                        style={{ ...styles.input, width: '80px' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setBulkEditOpen(false)} style={styles.rejectBtn}>취소</button>
              <button onClick={saveBulkEdit} disabled={savingBulk} style={styles.approveBtn}>
                {savingBulk ? '저장 중...' : `${selectedUids.size}명 저장`}
              </button>
            </div>
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
  principalBtn: { marginRight: '0.4rem', padding: '0.3rem 0.75rem', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  schoolAdminBtn: { marginRight: '0.4rem', padding: '0.3rem 0.75rem', backgroundColor: '#7b1fa2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  rejectBtn: { padding: '0.3rem 0.75rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  changeBtn: { marginRight: '0.4rem', padding: '0.3rem 0.75rem', backgroundColor: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  muted: { color: '#aaa', fontSize: '0.82rem' },
  editNameBtn: { marginLeft: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', padding: '0 2px', opacity: 0.45, verticalAlign: 'middle' },
  textarea: { width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '0.75rem' },
  infoBox: { backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.88rem', color: '#1e40af', marginBottom: '1.25rem', lineHeight: 1.6 },
  input: { padding: '0.4rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', width: '420px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' },
  modalLabel: { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: '#475569', fontWeight: 600 },
}
