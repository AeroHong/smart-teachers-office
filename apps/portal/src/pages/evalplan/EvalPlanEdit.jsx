import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { db, functions } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { fileKind, formatBytes, uploadAttachment, deleteAttachment } from '@shared/lib/requestAttachments'
import { USERS } from '@shared/lib/schema'
import Layout from '../../components/Layout'
import EvalPlanForm from './EvalPlanForm'
import EvalPlanSection, { ACCENT, ACCENT_BG } from './EvalPlanSection'
import { matchTeacherNames } from './teacherMatch'
import {
  emptyExamRatio, emptyGradeMethod, emptyMinAchievementPlan,
  validateHwpxFile, buildInitialData, parseGradeNumbers, parseSemesterNumber, parseWeeklyHoursNumber,
} from './evalPlanUtils'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function EvalPlanEdit() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { schoolId } = useAuth()
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState(null)
  const [subjectGroupError, setSubjectGroupError] = useState(false)

  // 원본 파일 재업로드 — 기존 파일은 sourceFile에, 재업로드로 새로 받은 파일이 있으면
  // pendingSourceFile에 둔다. 저장 시 pendingSourceFile이 있으면 그걸로 교체하고, 성공
  // 후에야 원래 파일을 Storage에서 지운다(저장 실패 시 기존 파일이 남아 있어야 하므로).
  const [sourceFile, setSourceFile] = useState(null)
  const [pendingSourceFile, setPendingSourceFile] = useState(null)
  const [extractedRaw, setExtractedRaw] = useState(null)
  const [teacherMatches, setTeacherMatches] = useState([])
  const [reparsing, setReparsing] = useState(false)
  const [reparsed, setReparsed] = useState(false)

  useEffect(() => {
    if (!schoolId || !planId) return
    getDoc(doc(db, 'schools', schoolId, 'evaluationPlans', planId))
      .then((snap) => {
        if (!snap.exists()) { setError('제출물을 찾을 수 없습니다.'); return }
        const plan = snap.data()
        setMeta({
          year: plan.year,
          semester: plan.semester,
          grades: plan.grades || [],
          gradeRaw: plan.gradeRaw || '',
          subjectGroup: plan.subjectGroup || '',
          subject: plan.subject || '',
          weeklyHours: plan.weeklyHours ?? null,
          classes: plan.classes || '',
          teacherNames: plan.teacherNames || [],
        })
        setData({
          examRatio: plan.data?.examRatio || emptyExamRatio(),
          performanceAreas: plan.data?.performanceAreas || [],
          gradeMethod: plan.data?.gradeMethod || emptyGradeMethod(),
          minAchievementPlan: plan.data?.minAchievementPlan || emptyMinAchievementPlan(),
        })
        setSourceFile(plan.sourceFile || null)
        setExtractedRaw(plan.extractedRaw || null)
        setTeacherMatches(plan.teacherMatches || [])
      })
      .catch((err) => {
        console.error('[EvalPlanEdit] 조회 실패:', err)
        setError('제출물을 불러오지 못했습니다. 접근 권한이 없을 수 있습니다.')
      })
      .finally(() => setLoading(false))
  }, [schoolId, planId])

  const handleMetaChange = (next) => {
    setMeta(next)
    if (next.subjectGroup) setSubjectGroupError(false)
  }

  const handlePickFile = () => fileInputRef.current?.click()

  // 파일이 통째로 잘못됐을 때 다시 올려 재분석한다 — hwpx 파싱 정확도가 완벽하지 않으니
  // 재분석 결과도 반드시 사람이 검토한 뒤 저장해야 한다(EvalPlanSubmit과 같은 원칙).
  // subjectGroup은 파일에서 추출되지 않는 값이라 건드리지 않고 그대로 둔다.
  const handleReupload = async (file) => {
    const validationError = validateHwpxFile(file)
    if (validationError) { setError(validationError); return }

    setError(null)
    setReparsing(true)
    try {
      const uploaded = await uploadAttachment({ schoolId, docId: planId, folder: 'evaluationPlans', file })
      const parseEvaluationPlan = httpsCallable(functions, 'parseEvaluationPlan')
      const res = await parseEvaluationPlan({ schoolId, storagePath: uploaded.path, fileName: file.name })
      const extracted = res.data.extracted

      const teacherNames = extracted.meta?.teachers || []
      let matches = teacherNames.map((name) => ({ name, uid: null, candidateUids: [], status: 'unmatched' }))
      try {
        const staffSnap = await getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
        const staff = staffSnap.docs.map((d) => ({ uid: d.id, name: d.data().name || '', email: d.data().email || '' }))
        matches = matchTeacherNames(teacherNames, staff)
      } catch (matchErr) {
        console.error('[EvalPlanEdit] 담당교사 매칭 조회 실패:', matchErr)
      }

      setMeta((m) => ({
        ...m,
        semester: parseSemesterNumber(extracted.meta?.semester) ?? m.semester,
        grades: parseGradeNumbers(extracted.meta?.grade),
        gradeRaw: extracted.meta?.grade || '',
        subject: extracted.meta?.subject || m.subject,
        weeklyHours: parseWeeklyHoursNumber(extracted.meta?.weeklyHours),
        classes: extracted.meta?.classes || '',
        teacherNames,
      }))
      setData(buildInitialData(extracted))
      setExtractedRaw(extracted)
      setTeacherMatches(matches)
      setPendingSourceFile(uploaded)
      setReparsed(true)
    } catch (err) {
      console.error('[EvalPlanEdit] 재업로드/재분석 실패:', err)
      setError(err.message || '파일 업로드 또는 재분석 중 오류가 발생했습니다.')
    } finally {
      setReparsing(false)
    }
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleReupload(file)
  }

  const handleSave = async () => {
    if (!meta.subjectGroup) {
      setSubjectGroupError(true)
      setError('교과(군)을 선택해주세요.')
      return
    }
    setSubjectGroupError(false)
    setSaving(true)
    setError(null)
    try {
      const newSourceFile = pendingSourceFile || sourceFile
      await updateDoc(doc(db, 'schools', schoolId, 'evaluationPlans', planId), {
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
        matchedTeacherUids: teacherMatches.filter((m) => m.status === 'matched' && m.uid).map((m) => m.uid),
        sourceFile: newSourceFile,
        extractedRaw,
        data,
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      // 재업로드로 파일을 교체한 경우, 저장이 확실히 성공한 뒤에만 예전 파일을 지운다.
      if (pendingSourceFile && sourceFile) await deleteAttachment(sourceFile)
      // 상세 화면으로 새 기록을 push하면(경로가 같아도) 히스토리에 상세가 중복으로 쌓여,
      // 상세 화면의 "←"(navigate(-1))가 여기가 아니라 방금 나온 수정 화면으로 돌아가 버린다.
      // 이 화면은 항상 상세 화면에서 "수정"을 눌러 들어오므로, 뒤로 한 칸이 곧 상세 화면이다.
      navigate(-1)
    } catch (err) {
      console.error('[EvalPlanEdit] 저장 실패:', err)
      setError(err.message || '저장 중 오류가 발생했습니다.')
      setSaving(false)
    }
  }

  if (loading) {
    return <Layout><Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box></Layout>
  }
  if (error && !meta) {
    return <Layout><Alert severity="error" sx={{ borderRadius: '10px' }}>{error}</Alert></Layout>
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
        }}>
          📐
        </Box>
        <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>제출 내용 수정</Typography>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        확정된 데이터를 수정합니다. 원본 파일 자체가 잘못됐다면 아래에서 다시 올려 재분석할 수 있습니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}

      {meta && data && (
        <Box>
          <EvalPlanSection title="원본 파일">
            <input ref={fileInputRef} type="file" accept=".hwpx" hidden onChange={handleFileInputChange} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              {(pendingSourceFile || sourceFile) ? (
                <Box
                  component="a" href={(pendingSourceFile || sourceFile).url} target="_blank" rel="noopener noreferrer"
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: '#334155',
                    px: 1.5, py: 1, borderRadius: '10px', bgcolor: '#f8fafc', border: '1px solid #e2e8f0',
                    '&:hover': { borderColor: ACCENT, color: ACCENT },
                  }}
                >
                  <DescriptionOutlinedIcon fontSize="small" />
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {fileKind((pendingSourceFile || sourceFile).name).emoji} {(pendingSourceFile || sourceFile).name} ({formatBytes((pendingSourceFile || sourceFile).size)})
                  </Typography>
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.85rem', color: '#94a3b8' }}>원본 파일 정보가 없습니다.</Typography>
              )}
              <Button
                size="small" variant="outlined" startIcon={reparsing ? <CircularProgress size={14} /> : <UploadFileIcon />}
                disabled={reparsing} onClick={handlePickFile}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
              >
                {reparsing ? '재분석 중...' : '파일 재업로드'}
              </Button>
            </Box>
            {reparsed && (
              <Alert severity="info" variant="outlined" sx={{ mt: 1.5, borderRadius: '10px', fontSize: '0.82rem' }}>
                새 파일을 재분석해 아래 값을 갱신했습니다. 내용을 확인·수정한 뒤 저장해주세요. 저장하기 전까지는 기존 파일이 그대로 유지됩니다.
              </Alert>
            )}
          </EvalPlanSection>

          <EvalPlanForm meta={meta} onMetaChange={handleMetaChange} data={data} onDataChange={setData} subjectGroupError={subjectGroupError} />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button
              variant="outlined" disabled={saving} onClick={() => navigate(-1)}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
            >
              취소
            </Button>
            <Button
              variant="contained" disabled={saving || reparsing} onClick={handleSave}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}
            >
              {saving ? '저장 중...' : '저장'}
            </Button>
          </Box>
        </Box>
      )}
    </Layout>
  )
}
