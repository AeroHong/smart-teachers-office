import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import Tooltip from '@mui/material/Tooltip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, query, where, getDocs, arrayUnion, limit,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { openProcessChecklistPrint, openResultChecklistPrint } from './asaChecklistPrint'
import { cleanTeacherName } from '../../utils/nameUtils'
import { getFixedCategory, parseNeisTeacherSubjectFile } from './asaUtils'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

// 분할점수 경계 개수로 성취도 단계 추정 (A~C=3단계는 경계 2~3개, A~E=5단계는 경계 4~5개)
function levelFromBoundaries(boundaries) {
  return (boundaries?.length ?? 0) <= 3 ? 3 : 5
}

// asaCutoffs의 과목명은 나이스 표기 그대로 뒤에 운영학점이 "(4)" 형태로 붙어있다
// (성적 일람표 파싱과 매칭하는 키로 쓰이므로 asaCutoffs 원본에서는 지우면 안 됨).
// 체크리스트 과목명(공문서 "점검 과목"란)에는 학점수가 필요 없으므로 가져올 때만 제거한다.
function stripCreditSuffix(name) {
  return (name || '').replace(/\s*\(\d+\)\s*$/, '').trim()
}

// 나이스 담당과목 그룹({grade, subjectName, teacherNames})을 현재 teachers/subjects 상태 기준으로
// 매칭한다. 최초 업로드와 이력에서 다시 매칭할 때(재매칭) 둘 다 이 함수를 공유해서 쓴다 —
// 재매칭은 스냅샷 당시가 아니라 "지금" 등록돼 있는 계정/과목 기준으로 다시 계산해야 의미가 있다.
function buildNeisMatchRows(groups, teachers, subjects) {
  const byName = new Map()
  teachers.forEach((t) => {
    const cleaned = cleanTeacherName(t.name || '')
    if (!cleaned) return
    if (!byName.has(cleaned)) byName.set(cleaned, [])
    byName.get(cleaned).push(t)
  })

  return groups.map(({ grade, subjectName, teacherNames }) => {
    const resolved = []
    const unresolved = []
    ;[...new Set(teacherNames)].forEach((name) => {
      const candidates = byName.get(name) || []
      if (candidates.length === 1) resolved.push({ name, email: candidates[0].email })
      else unresolved.push({ name, candidateEmails: candidates.map((c) => c.email) })
    })
    const matchingDocs = subjects.filter((s) => s.grade === grade && s.name === subjectName)
    return {
      key: `${grade}_${subjectName}`,
      grade,
      subjectName,
      teacherNames: [...new Set(teacherNames)],
      resolved,
      unresolved,
      registered: matchingDocs.length > 0,
      matchingDocs, // 런타임 전용 (asaSubjects 문서 참조) — 저장 시 제외
    }
  }).sort((a, b) => a.grade - b.grade || a.subjectName.localeCompare(b.subjectName, 'ko'))
}

// ── 상태 레이블 ──────────────────────────────────────────────
const STATUS_LABELS = {
  draft: '작성중',
  submitted: '제출완료',
  locked: '잠금',
}

const STATUS_COLORS = {
  draft: 'default',
  submitted: 'primary',
  locked: 'error',
}

// ── 날짜 포맷 ────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '-'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// ── 이메일 유효성 ────────────────────────────────────────────
function isValidEmail(email) {
  return email.includes('@')
}

// ── 기본 빈 과목 폼 ──────────────────────────────────────────
// achievementLevel: 성취도 산출 단계 (5=A~E, 3=A~C — 과학탐구실험/체육·예술 교과군 등)
const EMPTY_FORM = { name: '', grade: '', semester: '', teacherEmails: [], achievementLevel: 5 }

export default function AsaChecklistAdmin() {
  const { schoolId: authSchoolId, user, userName, isAdmin, isPrincipal, isSuperAdmin } = useAuth()
  // 슈퍼어드민은 schoolId가 null이므로 직접 입력 가능
  const [superAdminSchoolId, setSuperAdminSchoolId] = useState('seonyoo-hs')
  const schoolId = isSuperAdmin ? superAdminSchoolId : authSchoolId
  const [tab, setTab] = useState(0)

  // 과목 관리
  const [subjects, setSubjects] = useState([])
  const [loadingSubjects, setLoadingSubjects] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [emailInput, setEmailInput] = useState('')
  const [saving, setSaving] = useState(false)

  // 엑셀 업로드
  const [xlsxDialogOpen, setXlsxDialogOpen] = useState(false)
  const [xlsxPreview, setXlsxPreview] = useState([]) // [{ grade, semester, name, teacherEmails }]
  const [xlsxParsing, setXlsxParsing] = useState(false)
  const [xlsxSaving, setXlsxSaving] = useState(false)
  const xlsxInputRef = useRef(null)

  // 분할점수 기준(asaCutoffs)에서 과목 가져오기
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importCutoffs, setImportCutoffs] = useState([]) // [{ id, subjectName, grade, boundaries, source, fixedCategory }]
  const [importSemester, setImportSemester] = useState(1)
  const [importSelected, setImportSelected] = useState(new Set())
  const [importSaving, setImportSaving] = useState(false)

  // 나이스 "교사별 담당과목 목록"으로 이미 등록된 과목에 배정 교사 자동 매칭
  const [neisDialogOpen, setNeisDialogOpen] = useState(false)
  const [neisParsing, setNeisParsing] = useState(false)
  const [neisSaving, setNeisSaving] = useState(false)
  const [neisRows, setNeisRows] = useState([]) // [{ key, grade, subjectName, resolved, unresolved, matchingDocs }] (등록된 과목만)
  const [neisSelected, setNeisSelected] = useState(new Set())
  const [neisOverrides, setNeisOverrides] = useState({}) // `${rowKey}|${teacherName}` → email ('' = 건너뛰기)
  const [neisImportDocId, setNeisImportDocId] = useState(null) // 이번 업로드의 이력 문서 id (적용 시 갱신용)
  const neisInputRef = useRef(null)

  // 나이스 업로드 이력
  const [neisHistory, setNeisHistory] = useState([])
  const [loadingNeisHistory, setLoadingNeisHistory] = useState(true)
  const [neisHistoryDetail, setNeisHistoryDetail] = useState(null) // 상세보기 중인 이력 문서

  // 체크리스트 현황
  const [submissions, setSubmissions] = useState([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [filterGrade, setFilterGrade] = useState('all')
  const [filterSemester, setFilterSemester] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')


  // 등록된 교사 목록 (picker용)
  const [teachers, setTeachers] = useState([])

  const [snackbar, setSnackbar] = useState('')
  const [error, setError] = useState(null)

  // ── Firestore 구독: teachers (/users 에서 schoolId 필터) ──
  useEffect(() => {
    if (!schoolId) return
    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', schoolId),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((t) => t.email && ['teacher', 'admin', 'school_admin', 'principal'].includes(t.role))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
        setTeachers(list)
      },
      (err) => console.error('[Admin] teachers fetch error:', err),
    )
    return unsub
  }, [schoolId])

  // ── Firestore 구독: asaSubjects ──────────────────────────
  useEffect(() => {
    if (!schoolId) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaSubjects'),
      orderBy('grade'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoadingSubjects(false)
    }, (err) => {
      setError(`과목 목록 불러오기 실패: ${err.message}`)
      setLoadingSubjects(false)
    })
    return unsub
  }, [schoolId])

  // ── Firestore 구독: asaNeisImports (나이스 업로드 이력) ────
  useEffect(() => {
    if (!schoolId) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaNeisImports'),
      orderBy('uploadedAt', 'desc'),
      limit(30),
    )
    const unsub = onSnapshot(q, (snap) => {
      setNeisHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoadingNeisHistory(false)
    }, (err) => {
      setError(`나이스 업로드 이력을 불러오지 못했습니다: ${err.message}`)
      setLoadingNeisHistory(false)
    })
    return unsub
  }, [schoolId])

  // ── Firestore 구독: asaSubmissions ───────────────────────
  useEffect(() => {
    if (!schoolId) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaSubmissions'),
      orderBy('updatedAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoadingSubmissions(false)
    }, (err) => {
      setError(`제출 현황 불러오기 실패: ${err.message}`)
      setLoadingSubmissions(false)
    })
    return unsub
  }, [schoolId])

  // ── 과목 추가/수정 Dialog 열기 ──────────────────────────
  const handleOpenAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setEmailInput('')
    setDialogOpen(true)
  }

  const handleOpenEdit = (subject) => {
    setEditingId(subject.id)
    setForm({
      name: subject.name || '',
      grade: subject.grade ?? '',
      semester: subject.semester ?? '',
      teacherEmails: subject.teacherEmails || [],
      achievementLevel: subject.achievementLevel ?? 5, // 기존 과목(필드 없음)은 5단계로 취급
    })
    setEmailInput('')
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setEmailInput('')
  }

  // 이메일 태그 추가
  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addEmailTag()
    }
  }

  const addEmailTag = () => {
    const trimmed = emailInput.trim().replace(/,$/, '')
    if (!trimmed) return
    if (!isValidEmail(trimmed)) {
      setError('올바른 이메일 주소를 입력하세요 (@ 포함).')
      return
    }
    if (form.teacherEmails.includes(trimmed)) {
      setEmailInput('')
      return
    }
    setForm((prev) => ({ ...prev, teacherEmails: [...prev.teacherEmails, trimmed] }))
    setEmailInput('')
  }

  const removeEmailTag = (email) => {
    setForm((prev) => ({ ...prev, teacherEmails: prev.teacherEmails.filter((e) => e !== email) }))
  }

  // 과목 저장
  const handleSaveSubject = async () => {
    if (!form.name.trim()) { setError('과목명을 입력하세요.'); return }
    if (!form.grade) { setError('학년을 선택하세요.'); return }
    if (!form.semester) { setError('학기를 선택하세요.'); return }

    // 아직 입력 중인 이메일도 추가
    let finalEmails = [...form.teacherEmails]
    if (emailInput.trim()) {
      const trimmed = emailInput.trim().replace(/,$/, '')
      if (isValidEmail(trimmed) && !finalEmails.includes(trimmed)) {
        finalEmails.push(trimmed)
      }
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        grade: Number(form.grade),
        semester: Number(form.semester),
        teacherEmails: finalEmails,
        achievementLevel: Number(form.achievementLevel) === 3 ? 3 : 5,
        updatedAt: serverTimestamp(),
      }
      if (editingId) {
        await updateDoc(doc(db, 'schools', schoolId, 'asaSubjects', editingId), payload)
        setSnackbar('과목이 수정됐습니다.')
      } else {
        await addDoc(collection(db, 'schools', schoolId, 'asaSubjects'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
        setSnackbar('과목이 추가됐습니다.')
      }
      handleCloseDialog()
    } catch (err) {
      setError(`저장 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // 과목 삭제 (관련 submission 도 함께 삭제)
  const handleDeleteSubject = async (subject) => {
    if (!window.confirm(`"${subject.name}" 과목을 삭제할까요?\n관련 체크리스트 데이터도 모두 삭제됩니다.`)) return
    try {
      const related = submissions.filter((s) => s.subjectId === subject.id)
      await Promise.all(related.map((s) => deleteDoc(doc(db, 'schools', schoolId, 'asaSubmissions', s.id))))
      await deleteDoc(doc(db, 'schools', schoolId, 'asaSubjects', subject.id))
      setSnackbar('과목 및 관련 데이터가 삭제됐습니다.')
    } catch (err) {
      setError(`삭제 실패: ${err.message}`)
    }
  }

  // ── 엑셀 업로드 ──────────────────────────────────────────
  const handleXlsxFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setXlsxParsing(true)
    setError(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const parsed = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0) continue
        const grade = Number(row[0])
        const semester = Number(row[1])
        const name = String(row[2] || '').trim()
        const emailRaw = String(row[3] || '').trim()
        const achievementLevel = Number(row[4]) === 3 ? 3 : 5
        if (!name) continue
        const teacherEmails = emailRaw
          ? emailRaw.split(',').map((s) => s.trim()).filter((s) => s && isValidEmail(s))
          : []
        parsed.push({ grade, semester, name, teacherEmails, achievementLevel })
      }
      if (!parsed.length) {
        setError('인식된 데이터가 없습니다. A=학년, B=학기, C=과목명, D=교사이메일 형식을 확인하세요.')
        setXlsxParsing(false)
        return
      }
      setXlsxPreview(parsed)
      setXlsxDialogOpen(true)
    } catch (err) {
      setError(`엑셀 파싱 실패: ${err.message}`)
    } finally {
      setXlsxParsing(false)
    }
  }

  // ── 엑셀 다운로드: 현재 등록된 과목 목록을 그대로 내보냄 (엑셀 업로드로 재사용 가능한 형식) ──
  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const sorted = [...subjects].sort((a, b) =>
      a.grade - b.grade || a.semester - b.semester || a.name.localeCompare(b.name, 'ko'))
    const rows = sorted.map((s) => [
      s.grade,
      s.semester,
      s.name,
      (s.teacherEmails || []).join(','),
      (s.achievementLevel ?? 5) === 3 ? 3 : 5,
    ])
    const ws = XLSX.utils.aoa_to_sheet([
      ['학년', '학기', '과목명', '교사이메일(콤마구분)', '성취도단계(5 또는 3, 비우면 5)'],
      ...rows,
    ])
    ws['!cols'] = [{ wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 40 }, { wch: 24 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '과목목록')
    XLSX.writeFile(wb, '성취평가제_과목목록.xlsx')
  }

  const handleXlsxSave = async () => {
    setXlsxSaving(true)
    try {
      await Promise.all(xlsxPreview.map((row) =>
        addDoc(collection(db, 'schools', schoolId, 'asaSubjects'), {
          name: row.name,
          grade: row.grade,
          semester: row.semester,
          teacherEmails: row.teacherEmails,
          achievementLevel: row.achievementLevel,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      ))
      setSnackbar(`${xlsxPreview.length}개 과목이 추가됐습니다.`)
      setXlsxDialogOpen(false)
      setXlsxPreview([])
    } catch (err) {
      setError(`일괄 저장 실패: ${err.message}`)
    } finally {
      setXlsxSaving(false)
    }
  }

  // ── 분할점수 기준(asaCutoffs)에서 과목 가져오기 ──────────────────
  const handleOpenImport = async () => {
    setImportDialogOpen(true)
    setImportLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'schools', schoolId, 'asaCutoffs'), orderBy('grade')))
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.grade - b.grade || a.subjectName.localeCompare(b.subjectName, 'ko'))
      setImportCutoffs(list)
      // 이미 등록된(같은 학년+과목명+학기) 과목은 기본 선택 해제
      const already = new Set(
        subjects.filter((s) => s.semester === importSemester).map((s) => `${s.grade}_${s.name}`),
      )
      setImportSelected(new Set(
        list.filter((c) => !already.has(`${c.grade}_${stripCreditSuffix(c.subjectName)}`)).map((c) => c.id),
      ))
    } catch (err) {
      setError(`분할점수 기준 목록을 불러오지 못했습니다: ${err.message}`)
    } finally {
      setImportLoading(false)
    }
  }

  const handleCloseImport = () => {
    setImportDialogOpen(false)
    setImportCutoffs([])
    setImportSelected(new Set())
  }

  const toggleImportSelected = (id) => {
    setImportSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isAlreadyImported = (c) =>
    subjects.some((s) => s.grade === c.grade && s.name === stripCreditSuffix(c.subjectName) && s.semester === importSemester)

  const handleImportSave = async () => {
    const targets = importCutoffs.filter((c) => importSelected.has(c.id) && !isAlreadyImported(c))
    if (!targets.length) { setError('추가할 과목이 없습니다.'); return }
    setImportSaving(true)
    try {
      await Promise.all(targets.map((c) =>
        addDoc(collection(db, 'schools', schoolId, 'asaSubjects'), {
          name: stripCreditSuffix(c.subjectName),
          grade: c.grade,
          semester: importSemester,
          teacherEmails: [],
          achievementLevel: levelFromBoundaries(c.boundaries),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      ))
      setSnackbar(`${targets.length}개 과목이 추가됐습니다. 배정 교사는 각 과목을 수정해서 입력하세요.`)
      handleCloseImport()
    } catch (err) {
      setError(`가져오기 실패: ${err.message}`)
    } finally {
      setImportSaving(false)
    }
  }

  // ── 나이스 "교사별 담당과목 목록"으로 배정 교사 자동 매칭 ──────────
  const handleNeisFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setNeisParsing(true)
    setError(null)
    try {
      const parsed = await parseNeisTeacherSubjectFile(file)

      // grade+과목명 단위로 담당 교사명 취합
      const grouped = new Map()
      parsed.forEach(({ teacherName, subjectName, grade }) => {
        const key = `${grade}_${subjectName}`
        if (!grouped.has(key)) grouped.set(key, { grade, subjectName, teacherNames: new Set() })
        grouped.get(key).teacherNames.add(teacherName)
      })

      // 파일 안의 모든 학년+과목 조합을 스냅샷으로 남김 (체크리스트에 등록 안 된 과목도 포함 —
      // 나중에 과목을 등록하고 나서 이 이력을 참고할 수 있도록). 실제 "적용"은 등록된 과목만 가능.
      const groupList = [...grouped.values()].map((g) => ({ ...g, teacherNames: [...g.teacherNames] }))
      const allRows = buildNeisMatchRows(groupList, teachers, subjects)

      if (!allRows.length) {
        setError('인식된 담당과목 데이터가 없습니다.')
        return
      }

      // 이력 저장 (등록 안 된 과목 포함 전체 스냅샷 — matchingDocs 런타임 필드는 제외)
      const importRef = await addDoc(collection(db, 'schools', schoolId, 'asaNeisImports'), {
        fileName: file.name,
        uploadedBy: user.uid,
        uploadedByName: userName || user.email,
        rows: allRows.map(({ matchingDocs, ...rest }) => rest),
        appliedKeys: [],
        uploadedAt: serverTimestamp(),
      })
      setNeisImportDocId(importRef.id)

      const registeredRows = allRows.filter((r) => r.registered)
      if (!registeredRows.length) {
        setSnackbar('업로드 이력에 저장했습니다. 다만 이미 체크리스트에 등록된 과목과 일치하는 항목이 없어 바로 적용할 내용은 없습니다.')
        return
      }

      setNeisRows(registeredRows)
      // 전원 자동 매칭된(동명이인/미매칭 없는) 행만 기본 선택
      setNeisSelected(new Set(registeredRows.filter((r) => r.unresolved.length === 0).map((r) => r.key)))
      setNeisOverrides({})
      setNeisDialogOpen(true)
    } catch (err) {
      setError(`나이스 파일 파싱 실패: ${err.message}`)
    } finally {
      setNeisParsing(false)
    }
  }

  const handleCloseNeis = () => {
    setNeisDialogOpen(false)
    setNeisRows([])
    setNeisSelected(new Set())
    setNeisOverrides({})
    setNeisImportDocId(null)
  }

  const toggleNeisSelected = (key) => {
    setNeisSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 업로드 이력에 저장된 원본 담당 교사명을 "지금" 계정/과목 상태로 다시 매칭한다.
  // (스냅샷 당시 registered:false였어도 그 뒤 과목이 등록됐으면 지금은 매칭될 수 있음)
  const openNeisRematch = (historyDoc, rowKeys) => {
    const source = (historyDoc.rows || []).filter((r) => !rowKeys || rowKeys.includes(r.key))
    if (!source.length) return
    const groupList = source.map((r) => ({ grade: r.grade, subjectName: r.subjectName, teacherNames: r.teacherNames || [] }))
    const rows = buildNeisMatchRows(groupList, teachers, subjects)
    const registeredRows = rows.filter((r) => r.registered)
    if (!registeredRows.length) {
      setError('현재 체크리스트에 등록된 과목과 일치하는 항목이 없습니다. 먼저 과목을 등록하세요.')
      return
    }
    setNeisRows(registeredRows)
    setNeisSelected(new Set(registeredRows.filter((r) => r.unresolved.length === 0).map((r) => r.key)))
    setNeisOverrides({})
    setNeisImportDocId(historyDoc.id) // 재적용 시 이 이력 문서의 appliedKeys를 갱신
    setNeisHistoryDetail(null)
    setNeisDialogOpen(true)
  }

  const handleRematchAll = (historyDoc) => openNeisRematch(historyDoc, null)
  const handleRematchOne = (historyDoc, rowKey) => openNeisRematch(historyDoc, [rowKey])

  const handleNeisSave = async () => {
    const targets = neisRows.filter((r) => neisSelected.has(r.key))
    if (!targets.length) { setError('적용할 과목이 없습니다.'); return }
    setNeisSaving(true)
    try {
      const updates = []
      targets.forEach((r) => {
        const emails = new Set(r.resolved.map((x) => x.email))
        r.unresolved.forEach((u) => {
          const override = neisOverrides[`${r.key}|${u.name}`]
          if (override) emails.add(override)
        })
        r.matchingDocs.forEach((docObj) => {
          const merged = new Set([...(docObj.teacherEmails || []), ...emails])
          updates.push(updateDoc(doc(db, 'schools', schoolId, 'asaSubjects', docObj.id), {
            teacherEmails: [...merged],
            updatedAt: serverTimestamp(),
          }))
        })
      })
      if (neisImportDocId) {
        updates.push(updateDoc(doc(db, 'schools', schoolId, 'asaNeisImports', neisImportDocId), {
          appliedKeys: arrayUnion(...targets.map((r) => r.key)),
        }))
      }
      await Promise.all(updates)
      setSnackbar(`${targets.length}개 과목의 배정 교사가 업데이트됐습니다.`)
      handleCloseNeis()
    } catch (err) {
      setError(`적용 실패: ${err.message}`)
    } finally {
      setNeisSaving(false)
    }
  }

  // ── 인쇄/PDF: 체크리스트 인쇄 창 열기 ───────────────────────────
  // checklistType에 따라 붙임1/붙임2 인쇄 함수를 분기해야 하는데 항상 붙임1로 고정돼 있던 버그 수정
  const openPrint = (submission) => {
    const subjectObj = subjects.find((s) => s.id === submission.subjectId)
    const nameMap = Object.fromEntries(teachers.map((t) => [t.email, t.name]))
    if (submission.checklistType === 'result') {
      openResultChecklistPrint(submission, subjectObj, nameMap)
    } else {
      openProcessChecklistPrint(submission, subjectObj, nameMap)
    }
  }

  // ── 체크리스트 현황 필터링 (삭제된 과목의 submission 제외) ──────
  const filteredSubmissions = submissions.filter((s) => {
    if (!subjects.some((sub) => sub.id === s.subjectId)) return false  // 과목 삭제됨
    const subjectObj = subjects.find((sub) => sub.id === s.subjectId)
    if (filterGrade !== 'all' && String(subjectObj?.grade ?? '') !== filterGrade) return false
    if (filterSemester !== 'all' && String(subjectObj?.semester ?? '') !== filterSemester) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  const importAddCount = importCutoffs.filter((c) => importSelected.has(c.id) && !isAlreadyImported(c)).length

  // ── 접근 제한 ────────────────────────────────────────────
  if (!isAdmin && !isPrincipal && !isSuperAdmin) {
    return (
      <Layout>
        <Alert severity="error">관리자(admin/school_admin) 또는 교감 계정만 접근할 수 있습니다.</Alert>
      </Layout>
    )
  }

  return (
    <Layout wide>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        성취평가제 체크리스트 관리
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={isSuperAdmin ? 1 : 3}>
        과목·교사 배정을 관리하고 제출된 체크리스트 현황을 확인합니다.
      </Typography>

      {/* 슈퍼어드민 학교 선택 */}
      {isSuperAdmin && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, p: 1.5, bgcolor: '#fff7ed', borderRadius: 2, border: '1px solid #fed7aa' }}>
          <Typography variant="caption" color="warning.dark" fontWeight={700}>슈퍼어드민 모드</Typography>
          <TextField
            label="schoolId"
            size="small"
            value={superAdminSchoolId}
            onChange={(e) => setSuperAdminSchoolId(e.target.value)}
            sx={{ width: 200 }}
          />
        </Box>
      )}

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: '1px solid #e2e8f0', px: 2 }}>
          <Tab label="과목 관리" />
          <Tab label="체크리스트 현황" />
          <Tab label="나이스 업로드 이력" />
        </Tabs>

        {/* ══ 탭 1: 과목 관리 ══════════════════════════════════ */}
        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            {/* 상단 액션 */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" size="small" onClick={handleOpenAdd}>
                + 과목 추가
              </Button>
              <Button
                variant="outlined"
                size="small"
                component="label"
                disabled={xlsxParsing}
              >
                {xlsxParsing ? '파싱 중...' : '엑셀 업로드'}
                <input
                  ref={xlsxInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={handleXlsxFile}
                />
              </Button>
              <Button
                variant="text"
                size="small"
                startIcon={<DownloadOutlinedIcon />}
                onClick={handleDownloadTemplate}
              >
                과목 목록 다운로드
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleOpenImport}
              >
                분할점수 기준에서 가져오기
              </Button>
              <Button
                variant="outlined"
                size="small"
                component="label"
                disabled={neisParsing}
              >
                {neisParsing ? '분석 중...' : '나이스 담당과목으로 교사 매칭'}
                <input
                  ref={neisInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={handleNeisFile}
                />
              </Button>
            </Box>

            {/* 과목 목록 */}
            {loadingSubjects ? (
              <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
            ) : subjects.length === 0 ? (
              <Alert severity="info">
                과목이 없습니다. 과목을 추가하거나 엑셀로 업로드하세요.
              </Alert>
            ) : (
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, width: 64 }}>학년</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 64 }}>학기</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 160 }}>과목명</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 96 }}>단계</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>배정 교사</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 80 }}>작업</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {subjects.map((subject) => (
                    <TableRow key={subject.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{subject.grade}학년</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{subject.semester}학기</TableCell>
                      <TableCell sx={{ wordBreak: 'keep-all' }}>{subject.name}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {(subject.achievementLevel ?? 5) === 3
                          ? <Chip label="3단계" size="small" color="warning" variant="outlined" />
                          : <Chip label="5단계" size="small" variant="outlined" />}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(subject.teacherEmails || []).length === 0 ? (
                            <Typography variant="caption" color="text.disabled">미배정</Typography>
                          ) : (
                            (subject.teacherEmails || []).map((email) => {
                              const t = teachers.find((t) => t.email === email)
                              const tName = t?.name ? cleanTeacherName(t.name) : null
                              return (
                                <Tooltip key={email} title={email}>
                                  <Chip
                                    label={tName || email}
                                    size="small"
                                    variant="outlined"
                                  />
                                </Tooltip>
                              )
                            })
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => handleOpenEdit(subject)} title="수정">
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteSubject(subject)} title="삭제">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        )}

        {/* ══ 탭 2: 체크리스트 현황 ══════════════════════════════ */}
        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            {/* 필터 영역 */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>학년</InputLabel>
                <Select value={filterGrade} label="학년" onChange={(e) => setFilterGrade(e.target.value)}>
                  <MenuItem value="all">전체</MenuItem>
                  <MenuItem value="1">1학년</MenuItem>
                  <MenuItem value="2">2학년</MenuItem>
                  <MenuItem value="3">3학년</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>학기</InputLabel>
                <Select value={filterSemester} label="학기" onChange={(e) => setFilterSemester(e.target.value)}>
                  <MenuItem value="all">전체</MenuItem>
                  <MenuItem value="1">1학기</MenuItem>
                  <MenuItem value="2">2학기</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>상태</InputLabel>
                <Select value={filterStatus} label="상태" onChange={(e) => setFilterStatus(e.target.value)}>
                  <MenuItem value="all">전체</MenuItem>
                  <MenuItem value="draft">작성중</MenuItem>
                  <MenuItem value="submitted">제출완료</MenuItem>
                  <MenuItem value="locked">잠금</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ ml: 'auto' }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PrintOutlinedIcon />}
                  onClick={() => {
                    const targets = filteredSubmissions.filter((s) => s.status === 'submitted')
                    if (!targets.length) { setError('제출완료 상태의 항목이 없습니다.'); return }
                    targets.forEach((sub) => openPrint(sub))
                  }}
                >
                  제출완료 전체 인쇄
                </Button>
              </Box>
            </Box>

            {/* 현황 테이블 */}
            {loadingSubmissions ? (
              <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
            ) : filteredSubmissions.length === 0 ? (
              <Alert severity="info">해당 조건의 체크리스트 제출 내역이 없습니다.</Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700 }}>과목명</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>학년</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>학기</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>교사 서명</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>교감 서명</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>마지막 수정</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 80 }}>PDF</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSubmissions.map((sub) => {
                    const subjectObj = subjects.find((s) => s.id === sub.subjectId)
                    const subjectName = subjectObj?.name || sub.subjectName || '-'
                    const grade = subjectObj?.grade ?? sub.grade ?? '-'
                    const semester = subjectObj?.semester ?? sub.semester ?? '-'
                    const teacherSigs = sub.signatures || {}
                    const sigTotal = subjectObj?.teacherEmails?.length ?? 0
                    const sigDone = (subjectObj?.teacherEmails || []).filter((e) => !!teacherSigs[e]?.dataUrl).length
                    return (
                      <TableRow key={sub.id} hover>
                        <TableCell>{subjectName}</TableCell>
                        <TableCell>{grade !== '-' ? `${grade}학년` : '-'}</TableCell>
                        <TableCell>{semester !== '-' ? `${semester}학기` : '-'}</TableCell>
                        <TableCell>
                          {sub.checklistType === 'process'
                            ? '붙임1 과정'
                            : sub.checklistType === 'result'
                              ? '붙임2 결과'
                              : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_LABELS[sub.status] ?? sub.status ?? '-'}
                            color={STATUS_COLORS[sub.status] ?? 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {sigTotal > 0 ? `${sigDone}/${sigTotal}명` : '-'}
                        </TableCell>
                        <TableCell>
                          {sub.principalSignature?.dataUrl
                            ? <Chip label="완료" color="success" size="small" />
                            : <Chip label="미완" size="small" />}
                        </TableCell>
                        <TableCell>{fmtDate(sub.updatedAt)}</TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() => openPrint(sub)}
                            title="인쇄 / PDF 저장"
                          >
                            <PrintOutlinedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Box>
        )}

        {/* ══ 탭 3: 나이스 업로드 이력 ════════════════════════════ */}
        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            {loadingNeisHistory ? (
              <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
            ) : neisHistory.length === 0 ? (
              <Alert severity="info">
                아직 업로드한 나이스 담당과목 파일이 없습니다. "과목 관리" 탭에서 "나이스 담당과목으로 교사 매칭"으로 업로드하세요.
              </Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700 }}>파일명</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>업로드일시</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>업로더</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">조합 수</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">등록 과목 매칭</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">적용됨</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 180 }}>작업</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {neisHistory.map((h) => {
                    const rows = h.rows || []
                    const registeredCount = rows.filter((r) => r.registered).length
                    const appliedCount = (h.appliedKeys || []).length
                    return (
                      <TableRow key={h.id} hover>
                        <TableCell>{h.fileName}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {h.uploadedAt?.toDate
                            ? h.uploadedAt.toDate().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : '-'}
                        </TableCell>
                        <TableCell>{h.uploadedByName || '-'}</TableCell>
                        <TableCell align="right">{rows.length}개</TableCell>
                        <TableCell align="right">{registeredCount}개</TableCell>
                        <TableCell align="right">{appliedCount}개</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Button size="small" onClick={() => setNeisHistoryDetail(h)}>보기</Button>
                          <Button size="small" onClick={() => handleRematchAll(h)}>전체 재매칭</Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Box>
        )}
      </Paper>

      {/* ══ 과목 추가/수정 Dialog ══════════════════════════════ */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '과목 수정' : '과목 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>학년 *</InputLabel>
              <Select
                value={form.grade}
                label="학년 *"
                onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
              >
                <MenuItem value={1}>1학년</MenuItem>
                <MenuItem value={2}>2학년</MenuItem>
                <MenuItem value={3}>3학년</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>학기 *</InputLabel>
              <Select
                value={form.semester}
                label="학기 *"
                onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))}
              >
                <MenuItem value={1}>1학기</MenuItem>
                <MenuItem value={2}>2학기</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>성취도 단계 *</InputLabel>
              <Select
                value={form.achievementLevel}
                label="성취도 단계 *"
                onChange={(e) => setForm((p) => ({ ...p, achievementLevel: e.target.value }))}
              >
                <MenuItem value={5}>5단계 (A~E)</MenuItem>
                <MenuItem value={3}>3단계 (A~C)</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            과학탐구실험·체육/예술 교과(군) 등 3단계 산출 과목은 성취평가제 체크리스트 대상(1·2학년 5단계 산출 과목)이 아닙니다.
          </Typography>
          <TextField
            label="과목명 *"
            size="small"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            fullWidth
          />
          {/* 이메일 태그 입력 */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              배정 교사 이메일 (Enter 또는 쉼표로 추가)
            </Typography>
            <Box
              sx={{
                border: '1px solid #c4c4c4',
                borderRadius: 1,
                p: 1,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
                minHeight: 48,
                cursor: 'text',
                '&:focus-within': { borderColor: 'primary.main', borderWidth: 2 },
              }}
              onClick={() => document.getElementById('email-tag-input')?.focus()}
            >
              {form.teacherEmails.map((email) => (
                <Chip
                  key={email}
                  label={email}
                  size="small"
                  onDelete={() => removeEmailTag(email)}
                />
              ))}
              <input
                id="email-tag-input"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                onBlur={addEmailTag}
                placeholder={form.teacherEmails.length === 0 ? '이메일 입력 후 Enter' : ''}
                style={{
                  border: 'none',
                  outline: 'none',
                  flex: '1 0 140px',
                  fontSize: '0.875rem',
                  padding: '2px 4px',
                  minWidth: 0,
                  background: 'transparent',
                }}
              />
            </Box>
          </Box>

          {/* 등록된 교사 목록에서 선택 */}
          {teachers.length > 0 && (
            <Box>
              <Divider sx={{ my: 1.5 }}>
                <Typography variant="caption" color="text.secondary">등록된 교사 목록에서 선택</Typography>
              </Divider>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 }}>
                {teachers.map((t) => {
                  const alreadyAdded = form.teacherEmails.includes(t.email)
                  const displayName = cleanTeacherName(t.name || t.email)
                  const initials = displayName.slice(0, 1)
                  return (
                    <Box
                      key={t.uid}
                      onClick={() => {
                        if (alreadyAdded) removeEmailTag(t.email)
                        else setForm((prev) => ({ ...prev, teacherEmails: [...prev.teacherEmails, t.email] }))
                      }}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1,
                        px: 1.5, py: 1, borderRadius: 2, cursor: 'pointer',
                        border: '1.5px solid',
                        borderColor: alreadyAdded ? 'primary.main' : '#e2e8f0',
                        bgcolor: alreadyAdded ? 'primary.50' : '#fafafa',
                        transition: 'all 0.15s',
                        '&:hover': { borderColor: 'primary.light', bgcolor: '#f0f4ff' },
                      }}
                    >
                      <Box sx={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        bgcolor: alreadyAdded ? 'primary.main' : '#e2e8f0',
                        color: alreadyAdded ? '#fff' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.85rem',
                      }}>
                        {initials}
                      </Box>
                      <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {displayName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.7rem' }}>
                          {t.email}
                        </Typography>
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} disabled={saving}>취소</Button>
          <Button variant="contained" onClick={handleSaveSubject} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ 엑셀 미리보기 Dialog ══════════════════════════════ */}
      <Dialog open={xlsxDialogOpen} onClose={() => { setXlsxDialogOpen(false); setXlsxPreview([]) }} maxWidth="md" fullWidth>
        <DialogTitle>엑셀 업로드 미리보기 ({xlsxPreview.length}개 과목)</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.82rem' }}>
            아래 내용을 확인 후 "저장" 버튼을 누르면 기존 과목에 추가됩니다. 중복 과목은 자동으로 체크되지 않습니다.
          </Alert>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700 }}>학년</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>학기</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>과목명</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>단계</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>배정 교사 이메일</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {xlsxPreview.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.grade}학년</TableCell>
                  <TableCell>{row.semester}학기</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.achievementLevel}단계</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {row.teacherEmails.length === 0
                        ? <Typography variant="caption" color="text.disabled">없음</Typography>
                        : row.teacherEmails.map((e) => <Chip key={e} label={e} size="small" variant="outlined" />)}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setXlsxDialogOpen(false); setXlsxPreview([]) }} disabled={xlsxSaving}>취소</Button>
          <Button variant="contained" onClick={handleXlsxSave} disabled={xlsxSaving}>
            {xlsxSaving ? '저장 중...' : `저장 (${xlsxPreview.length}개)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ 분할점수 기준에서 가져오기 Dialog ══════════════════════ */}
      <Dialog open={importDialogOpen} onClose={handleCloseImport} maxWidth="md" fullWidth>
        <DialogTitle>분할점수 기준에서 과목 가져오기</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.82rem' }}>
            "분할점수 기준 관리"에 등록된 과목명·학년을 그대로 가져오고, 성취도 단계(5/3)는 분할점수 경계 개수로 자동 판별합니다.
            배정 교사는 가져온 뒤 각 과목을 수정해서 입력하세요.
          </Alert>
          <FormControl size="small" sx={{ minWidth: 120, mb: 2 }}>
            <InputLabel>등록할 학기</InputLabel>
            <Select
              value={importSemester}
              label="등록할 학기"
              onChange={(e) => setImportSemester(e.target.value)}
            >
              <MenuItem value={1}>1학기</MenuItem>
              <MenuItem value={2}>2학기</MenuItem>
            </Select>
          </FormControl>
          {importLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : importCutoffs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              분할점수 기준 관리에 등록된 과목이 없습니다.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell padding="checkbox" />
                  <TableCell sx={{ fontWeight: 700 }}>학년</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>과목명</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>단계</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>출처</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {importCutoffs.map((c) => {
                  const exists = isAlreadyImported(c)
                  const level = levelFromBoundaries(c.boundaries)
                  const cleanName = stripCreditSuffix(c.subjectName)
                  return (
                    <TableRow key={c.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={importSelected.has(c.id)}
                          onChange={() => toggleImportSelected(c.id)}
                          disabled={exists}
                        />
                      </TableCell>
                      <TableCell>{c.grade}학년</TableCell>
                      <TableCell>
                        {cleanName}
                        {cleanName !== c.subjectName && (
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                            원본: {c.subjectName}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`${level}단계`}
                          size="small"
                          color={level === 3 ? 'warning' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {c.source === 'estimated' ? '추정분할점수' : (getFixedCategory(c.fixedCategory)?.label || '고정분할점수')}
                      </TableCell>
                      <TableCell>
                        {exists
                          ? <Chip label={`이미 등록됨(${importSemester}학기)`} size="small" />
                          : <Typography variant="caption" color="text.secondary">신규</Typography>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseImport} disabled={importSaving}>취소</Button>
          <Button variant="contained" onClick={handleImportSave} disabled={importSaving || importLoading || importAddCount === 0}>
            {importSaving ? '추가 중...' : `선택한 과목 추가 (${importAddCount}개)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ 나이스 담당과목 → 배정 교사 자동 매칭 Dialog ══════════════ */}
      <Dialog open={neisDialogOpen} onClose={handleCloseNeis} maxWidth="lg" fullWidth>
        <DialogTitle>나이스 담당과목으로 배정 교사 매칭</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.82rem' }}>
            나이스 "교사별 담당과목 목록" 엑셀에서 학년+과목명이 일치하는, <b>이미 체크리스트에 등록된 과목</b>에만 담당 교사를 매칭합니다.
            아직 등록 안 된 과목이나 창의적 체험활동은 자동으로 제외됩니다. 기존에 배정된 교사는 유지되고 새로 찾은 교사만 추가됩니다.
            업로드 내용 전체는 "나이스 업로드 이력" 탭에 저장되어 나중에 다시 확인할 수 있습니다.
          </Alert>
          {neisRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">매칭할 과목이 없습니다.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell padding="checkbox" />
                  <TableCell sx={{ fontWeight: 700 }}>학년</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>과목명</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>현재 배정</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>나이스에서 찾은 교사</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {neisRows.map((r) => {
                  const currentEmails = new Set()
                  r.matchingDocs.forEach((d) => (d.teacherEmails || []).forEach((e) => currentEmails.add(e)))
                  return (
                    <TableRow key={r.key} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={neisSelected.has(r.key)}
                          onChange={() => toggleNeisSelected(r.key)}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.grade}학년</TableCell>
                      <TableCell>{r.subjectName}</TableCell>
                      <TableCell>
                        {[...currentEmails].length === 0 ? (
                          <Typography variant="caption" color="text.disabled">미배정</Typography>
                        ) : (
                          [...currentEmails].map((email) => {
                            const t = teachers.find((tc) => tc.email === email)
                            return (
                              <Chip
                                key={email}
                                label={t?.name ? cleanTeacherName(t.name) : email}
                                size="small"
                                variant="outlined"
                                sx={{ mr: 0.5, mb: 0.5 }}
                              />
                            )
                          })
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                          {r.resolved.map((x) => (
                            <Chip
                              key={x.name}
                              label={cleanTeacherName(teachers.find((tc) => tc.email === x.email)?.name || x.name)}
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          ))}
                          {r.unresolved.map((u) => {
                            const candidateTeachers = (u.candidateEmails || [])
                              .map((email) => teachers.find((t) => t.email === email))
                              .filter(Boolean)
                            const options = candidateTeachers.length ? candidateTeachers : teachers
                            return (
                              <FormControl key={u.name} size="small" sx={{ minWidth: 220 }}>
                                <Select
                                  displayEmpty
                                  value={neisOverrides[`${r.key}|${u.name}`] || ''}
                                  onChange={(e) => setNeisOverrides((prev) => ({
                                    ...prev, [`${r.key}|${u.name}`]: e.target.value,
                                  }))}
                                >
                                  <MenuItem value="">
                                    ⚠ {u.name} — {candidateTeachers.length > 1 ? '동명이인, 직접 선택' : '미매칭, 직접 선택'}
                                  </MenuItem>
                                  {options.map((t) => (
                                    <MenuItem key={t.email} value={t.email}>
                                      {cleanTeacherName(t.name)} ({t.email})
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            )
                          })}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseNeis} disabled={neisSaving}>취소</Button>
          <Button variant="contained" onClick={handleNeisSave} disabled={neisSaving || neisSelected.size === 0}>
            {neisSaving ? '적용 중...' : `선택한 과목에 적용 (${neisSelected.size}개)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ 나이스 업로드 이력 상세보기 Dialog (읽기 전용) ═══════════ */}
      <Dialog open={!!neisHistoryDetail} onClose={() => setNeisHistoryDetail(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          업로드 이력: {neisHistoryDetail?.fileName}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 400 }}>
            {neisHistoryDetail?.uploadedAt?.toDate
              ? neisHistoryDetail.uploadedAt.toDate().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
              : ''}
            {' · '}{neisHistoryDetail?.uploadedByName}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700 }}>학년</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>과목명</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>나이스 담당 교사</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>매칭 결과</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 90 }}>작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(neisHistoryDetail?.rows || []).map((r) => {
                const applied = (neisHistoryDetail.appliedKeys || []).includes(r.key)
                return (
                  <TableRow key={r.key} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.grade}학년</TableCell>
                    <TableCell>{r.subjectName}</TableCell>
                    <TableCell>{(r.teacherNames || []).join(', ')}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(r.resolved || []).map((x) => (
                          <Chip key={x.name} label={x.name} size="small" color="success" variant="outlined" />
                        ))}
                        {(r.unresolved || []).map((u) => (
                          <Chip key={u.name} label={`${u.name} (미매칭)`} size="small" color="warning" variant="outlined" />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {!r.registered
                        ? <Chip label="미등록 과목" size="small" />
                        : applied
                          ? <Chip label="적용됨" size="small" color="primary" />
                          : <Chip label="미적용" size="small" variant="outlined" />}
                    </TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => handleRematchOne(neisHistoryDetail, r.key)}>
                        재매칭
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNeisHistoryDetail(null)}>닫기</Button>
        </DialogActions>
      </Dialog>

      {/* ══ 에러 / 스낵바 ═══════════════════════════════════════ */}
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </Layout>
  )
}
