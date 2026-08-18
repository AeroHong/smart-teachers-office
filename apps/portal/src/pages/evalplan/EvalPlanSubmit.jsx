import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, setDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { db, functions } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { uploadAttachment, deleteAttachment } from '@shared/lib/requestAttachments'
import { currentYearSemester, USERS } from '@shared/lib/schema'
import Layout from '../../components/Layout'
import EvalPlanForm from './EvalPlanForm'
import EvalPlanSection, { ACCENT, ACCENT_BG } from './EvalPlanSection'
import { matchTeacherNames } from './teacherMatch'
import { validateHwpxFile, buildInitialData, parseGradeNumbers, parseSemesterNumber, parseWeeklyHoursNumber, fmtDate } from './evalPlanUtils'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function EvalPlanSubmit() {
  const navigate = useNavigate()
  const { user, userName, schoolId } = useAuth()
  const fileInputRef = useRef(null)

  const [step, setStep] = useState('upload') // 'upload' | 'review'
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [planId, setPlanId] = useState(null)
  const [sourceFile, setSourceFile] = useState(null)
  const [extractedRaw, setExtractedRaw] = useState(null)
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState(null)
  const [teacherMatches, setTeacherMatches] = useState([])
  const [dragging, setDragging] = useState(false)
  const [existingMatch, setExistingMatch] = useState(null) // 같은 학년도/학기/과목의 기존 제출물(있으면 덮어씀)

  // 여러 파일을 한 번에 끌어다 놓거나 선택하면 순서대로 하나씩 처리한다. 자동 확정은 하지
  // 않는다(파서 정확도가 완벽하지 않아 사람 검토가 꼭 필요) — 파일마다 검토·저장하면
  // 곧바로 다음 파일 업로드·파싱으로 자동 진행한다.
  const [fileQueue, setFileQueue] = useState([]) // 아직 처리 안 한 나머지 파일들
  const [queueTotal, setQueueTotal] = useState(0)
  const [queuePos, setQueuePos] = useState(0) // 1-based, 현재 처리 중인 순번

  // 본인이 같은 학년도·학기·과목으로 이미 제출한 문서가 있는지 찾는다 — 파일을 고쳐서 다시
  // 올릴 때 새 문서를 쌓지 않고 기존 제출물을 덮어쓰기 위함. excludeId는 이번 업로드로 이미
  // 만든 임시 문서 ID(아직 저장 전이라 실제로는 안 걸리지만 방어적으로 제외).
  const findExistingPlan = async (year, semester, subject, excludeId) => {
    if (!subject) return null
    try {
      const snap = await getDocs(query(
        collection(db, 'schools', schoolId, 'evaluationPlans'),
        where('uploaderUid', '==', user.uid),
        where('year', '==', year),
        where('semester', '==', semester),
        where('subject', '==', subject),
      ))
      const hit = snap.docs.find((d) => d.id !== excludeId)
      return hit ? { id: hit.id, ...hit.data() } : null
    } catch (err) {
      console.error('[EvalPlanSubmit] 기존 제출물 조회 실패:', err)
      return null
    }
  }

  const handlePickFile = () => fileInputRef.current?.click()

  const startQueue = (files) => {
    const valid = []
    const invalidNames = []
    files.forEach((f) => {
      if (validateHwpxFile(f)) invalidNames.push(f.name)
      else valid.push(f)
    })
    if (!valid.length) {
      setError(invalidNames.length ? 'hwpx 파일만 업로드할 수 있습니다.' : '파일을 선택해주세요.')
      return
    }
    setError(invalidNames.length ? `hwpx 파일이 아니라 ${invalidNames.length}개는 제외했습니다: ${invalidNames.join(', ')}` : null)
    setQueueTotal(valid.length)
    setQueuePos(1)
    setFileQueue(valid.slice(1))
    processFile(valid[0])
  }

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) startQueue(files)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    if (!uploading) setDragging(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragging(false)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (uploading) return
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) startQueue(files)
  }

  const processFile = async (file) => {
    const validationError = validateHwpxFile(file)
    if (validationError) { setError(validationError); return }

    setError(null)
    setExistingMatch(null)
    setUploading(true)
    try {
      // Firestore 문서는 아직 만들지 않지만, ID는 미리 발급해 Storage 폴더 경로와
      // 확정 시 저장할 문서 ID를 동일하게 맞춘다.
      const newPlanId = doc(collection(db, 'schools', schoolId, 'evaluationPlans')).id
      const uploaded = await uploadAttachment({ schoolId, docId: newPlanId, folder: 'evaluationPlans', file })

      const parseEvaluationPlan = httpsCallable(functions, 'parseEvaluationPlan')
      const res = await parseEvaluationPlan({ schoolId, storagePath: uploaded.path, fileName: file.name })
      const extracted = res.data.extracted

      // hwpx에 적힌 담당교사 이름을 실제 계정과 매칭 시도 — 여러 명이 공동 지도할 수 있고,
      // 동명이인·미매칭은 관리자가 상세 화면에서 수동 배정한다(교직원 관리 자동 반영 대상 선정에 쓰임).
      const teacherNames = extracted.meta?.teachers || []
      let matches = teacherNames.map((name) => ({ name, uid: null, candidateUids: [], status: 'unmatched' }))
      try {
        const staffSnap = await getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
        const staff = staffSnap.docs.map((d) => ({ uid: d.id, name: d.data().name || '', email: d.data().email || '' }))
        matches = matchTeacherNames(teacherNames, staff)
      } catch (matchErr) {
        console.error('[EvalPlanSubmit] 담당교사 매칭 조회 실패:', matchErr)
      }

      const defaults = currentYearSemester()
      const initYear = defaults.year
      const initSemester = parseSemesterNumber(extracted.meta?.semester) ?? defaults.semester
      const initSubject = extracted.meta?.subject || ''

      setPlanId(newPlanId)
      setSourceFile(uploaded)
      setExtractedRaw(extracted)
      setTeacherMatches(matches)
      setMeta({
        year: initYear,
        semester: initSemester,
        grades: parseGradeNumbers(extracted.meta?.grade),
        gradeRaw: extracted.meta?.grade || '',
        subjectGroup: '',
        subject: initSubject,
        weeklyHours: parseWeeklyHoursNumber(extracted.meta?.weeklyHours),
        classes: extracted.meta?.classes || '',
        teacherNames,
      })
      setData(buildInitialData(extracted))
      setStep('review')

      // 같은 학년도·학기·과목으로 이미 제출한 내역이 있으면 미리 알려준다(확정 저장 시
      // 실제로는 그때의 최종 값으로 다시 확인해 덮어쓴다 — 여기서는 검토 화면 안내용).
      findExistingPlan(initYear, initSemester, initSubject, newPlanId).then(setExistingMatch)
    } catch (err) {
      console.error('[EvalPlanSubmit] 업로드/파싱 실패:', err)
      setError(err.message || '파일 업로드 또는 파싱 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async (status) => {
    setSaving(true)
    setError(null)
    try {
      // 확정 직전 최종 값(교사가 검토 중 수정했을 수 있음)으로 다시 한번 기존 제출물을
      // 찾는다 — 있으면 새 문서를 만들지 않고 그 문서를 덮어쓴다(파일을 고쳐 재업로드하는
      // 흐름에서 목록에 중복이 쌓이지 않도록).
      const dup = await findExistingPlan(meta.year, meta.semester, meta.subject, planId)
      const targetPlanId = dup?.id || planId

      await setDoc(doc(db, 'schools', schoolId, 'evaluationPlans', targetPlanId), {
        year: meta.year,
        semester: meta.semester,
        grades: meta.grades,
        gradeRaw: meta.gradeRaw,
        subjectGroup: meta.subjectGroup || '',
        subject: meta.subject,
        weeklyHours: meta.weeklyHours,
        classes: meta.classes,
        teacherNames: meta.teacherNames,
        teacherMatches,
        // 매칭된 uid만 뽑은 평면 배열 — Firestore rules는 배열 안 객체 필드까지 조회하지
        // 못해서 "공동 지도교사도 열람 가능"을 array-contains로 판정하려면 이 형태가 필요하다.
        matchedTeacherUids: teacherMatches.filter((m) => m.status === 'matched' && m.uid).map((m) => m.uid),
        uploaderUid: user.uid,
        uploaderName: userName || user.email || '',
        status,
        confirmedAt: status === 'confirmed' ? serverTimestamp() : null,
        sourceFile,
        extractedRaw,
        data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // 기존 문서를 덮어썼다면 그 문서에 달려 있던 예전 원본 파일은 정리한다.
      if (dup?.sourceFile) {
        await deleteAttachment(dup.sourceFile)
      }

      if (fileQueue.length > 0) {
        // 큐에 남은 파일이 있으면 목록 화면으로 나가지 않고 바로 다음 파일 업로드·파싱을 시작한다.
        const [next, ...rest] = fileQueue
        setFileQueue(rest)
        setQueuePos((p) => p + 1)
        setStep('upload')
        setSaving(false)
        processFile(next)
      } else {
        navigate(queueTotal > 1 ? '/evalplan' : `/evalplan/${targetPlanId}`)
      }
    } catch (err) {
      console.error('[EvalPlanSubmit] 저장 실패:', err)
      setError(err.message || '저장 중 오류가 발생했습니다.')
      setSaving(false)
    }
  }

  const unresolvedCount = teacherMatches.filter((m) => m.status !== 'matched').length

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
          }}>
            📐
          </Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>평가 운영 계획 제출</Typography>
        </Box>
        {queueTotal > 1 && (
          <Chip
            size="small"
            label={`${queuePos} / ${queueTotal}번째 파일${sourceFile ? ` · ${sourceFile.name}` : ''}`}
            sx={{ bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700 }}
          />
        )}
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        hwpx 형식의 교수학습 평가 운영 계획서를 업로드하면 정기시험·수행평가 비율 등 핵심 데이터를 자동으로 추출합니다.
        추출 결과가 정확하지 않을 수 있으니 확정 전에 반드시 직접 확인·수정해주세요. 여러 파일을 한꺼번에 끌어다 놓으면 순서대로 하나씩 검토·저장할 수 있습니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}

      {step === 'upload' && (
        <Box
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            p: 5, textAlign: 'center', borderRadius: '16px',
            border: '2px dashed', borderColor: dragging ? ACCENT : '#ddd6fe',
            bgcolor: dragging ? '#ede9fe' : ACCENT_BG,
            transition: 'all 0.12s',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".hwpx"
            multiple
            hidden
            onChange={handleFileInputChange}
          />
          {uploading ? (
            <Box sx={{ py: 2 }}>
              <CircularProgress size={32} sx={{ color: ACCENT }} />
              <Typography sx={{ fontSize: '0.9rem', color: '#64748b', mt: 2 }}>
                파일을 업로드하고 데이터를 추출하는 중입니다...
              </Typography>
            </Box>
          ) : (
            <Box sx={{ py: 2 }}>
              <UploadFileIcon sx={{ fontSize: 48, color: ACCENT, mb: 1 }} />
              <Typography sx={{ fontSize: '0.95rem', color: '#334155', mb: 0.5, fontWeight: 600 }}>
                hwpx 파일을 여기로 끌어다 놓거나
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', mb: 2 }}>
                아래 버튼으로 파일을 선택해주세요
              </Typography>
              <Button
                variant="contained" onClick={handlePickFile}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}
              >
                파일 선택
              </Button>
            </Box>
          )}
        </Box>
      )}

      {step === 'review' && meta && data && (
        <Box>
          <Alert severity="info" variant="outlined" sx={{ mb: 2.5, borderRadius: '10px', fontSize: '0.82rem' }}>
            자동 추출된 값입니다. 비어 있거나 잘못된 항목은 직접 입력·수정한 뒤 확정해주세요. 교과(군)은 자동 추출되지 않으니 반드시 선택해주세요.
          </Alert>

          {existingMatch && (
            <Alert severity="warning" variant="outlined" sx={{ mb: 2.5, borderRadius: '10px', fontSize: '0.82rem' }}>
              같은 학년도·학기·과목으로 이미 제출한 내역이 있습니다({fmtDate(existingMatch.createdAt)} 제출). 확정 저장하면 새로 만들지 않고 기존 제출물을 덮어씁니다.
            </Alert>
          )}

          {teacherMatches.length > 0 && (
            <EvalPlanSection title="담당교사 계정 매칭">
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {teacherMatches.map((m) => (
                  <Chip
                    key={m.name}
                    size="small"
                    label={m.status === 'matched' ? m.name : `${m.name} — ${m.status === 'ambiguous' ? '동명이인' : '미매칭'}`}
                    color={m.status === 'matched' ? 'success' : 'warning'}
                    variant={m.status === 'matched' ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
              {unresolvedCount > 0 && (
                <Typography sx={{ fontSize: '0.76rem', color: '#94a3b8', mt: 1 }}>
                  계정과 자동으로 연결되지 않은 이름이 있습니다. 제출 후 상세 화면에서 관리자가 수동으로 배정할 수 있습니다.
                </Typography>
              )}
            </EvalPlanSection>
          )}

          <EvalPlanForm meta={meta} onMetaChange={setMeta} data={data} onDataChange={setData} />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button
              variant="outlined" disabled={saving} onClick={() => handleSave('draft')}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
            >
              임시저장
            </Button>
            <Button
              variant="contained" disabled={saving} onClick={() => handleSave('confirmed')}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}
            >
              {saving ? '저장 중...' : fileQueue.length > 0 ? `확정 저장 후 다음 파일 (${fileQueue.length}개 남음)` : '확정 저장'}
            </Button>
          </Box>
        </Box>
      )}
    </Layout>
  )
}
