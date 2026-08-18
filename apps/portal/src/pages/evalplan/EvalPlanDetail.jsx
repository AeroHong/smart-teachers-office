import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { fileKind, formatBytes, deleteAttachment } from '@shared/lib/requestAttachments'
import { USERS } from '@shared/lib/schema'
import Layout from '../../components/Layout'
import EvalPlanSection, { ACCENT, ACCENT_BG } from './EvalPlanSection'
import { STATUS_LABELS, STATUS_COLORS, GRADE_METHOD_FIELDS, needsMinAchievementPlan, checkExamRatio, fmtDate } from './evalPlanUtils'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

const tableHeadSx = {
  '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.78rem', borderBottom: '1px solid #e2e8f0' },
}
const tableRowSx = { '& td': { borderBottom: '1px solid #f1f5f9', color: '#334155' }, '&:last-of-type td': { borderBottom: 0 } }
const infoChipSx = { bgcolor: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: '0.76rem' }

const RATIO_ROWS = [
  { key: 'midterm', label: '중간고사', cols: ['essayType', 'objectiveType', 'total'] },
  { key: 'final', label: '기말고사', cols: ['essayType', 'objectiveType', 'total'] },
  { key: 'performance', label: '수행평가', cols: ['essayType', 'otherType', 'total'] },
]

function cellText(cell) {
  if (!cell) return '-'
  const r = cell.ratio ?? '-'
  const s = cell.maxScore ?? '-'
  return `${r}% / ${s}점`
}

// 관리자가 매칭 실패한 담당교사 이름을 실제 계정으로 수동 배정하는 행.
function TeacherMatchRow({ match, staff, onAssign }) {
  const candidateStaff = (match.candidateUids || []).map((uid) => staff.find((s) => s.uid === uid)).filter(Boolean)
  const options = candidateStaff.length ? candidateStaff : staff

  if (match.status === 'matched') {
    const matched = staff.find((s) => s.uid === match.uid)
    return <Chip size="small" color="success" label={`${match.name}${matched ? ` (${matched.email})` : ''}`} />
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Chip size="small" color="warning" variant="outlined" label={`${match.name} — ${match.status === 'ambiguous' ? '동명이인' : '미매칭'}`} />
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <Select displayEmpty value={match.uid || ''} onChange={(e) => onAssign(match.name, e.target.value)}>
          <MenuItem value="">직접 선택</MenuItem>
          {options.map((s) => <MenuItem key={s.uid} value={s.uid}>{s.name} ({s.email})</MenuItem>)}
        </Select>
      </FormControl>
    </Box>
  )
}

export default function EvalPlanDetail() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [staff, setStaff] = useState([])
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!schoolId || !planId) return
    const unsub = onSnapshot(
      doc(db, 'schools', schoolId, 'evaluationPlans', planId),
      (snap) => {
        setPlan(snap.exists() ? { id: snap.id, ...snap.data() } : null)
        setLoading(false)
      },
      (err) => {
        console.error('[EvalPlanDetail] 조회 실패:', err)
        setError('제출물을 불러오지 못했습니다. 접근 권한이 없거나 삭제되었을 수 있습니다.')
        setLoading(false)
      },
    )
    return unsub
  }, [schoolId, planId])

  useEffect(() => {
    if (!schoolId || !isAdmin) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then((snap) => setStaff(snap.docs.map((d) => ({ uid: d.id, name: d.data().name || '', email: d.data().email || '' }))))
      .catch((e) => console.error('[EvalPlanDetail] 교직원 목록 조회 실패:', e))
  }, [schoolId, isAdmin])

  const handleAssignTeacher = async (name, uid) => {
    if (!uid) return
    const nextMatches = (plan.teacherMatches || []).map((m) => (
      m.name === name ? { ...m, uid, status: 'matched' } : m
    ))
    const nextMatchedUids = nextMatches.filter((m) => m.status === 'matched' && m.uid).map((m) => m.uid)
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'evaluationPlans', planId), {
        teacherMatches: nextMatches,
        matchedTeacherUids: nextMatchedUids,
      })
    } catch (e) {
      console.error('[EvalPlanDetail] 담당교사 수동 배정 실패:', e)
    }
  }

  // 본인 제출물은 본인만, 관리자는 전체 삭제·수정 가능 (firestore.rules의 delete/update 규칙과 동일 조건)
  const canEdit = isAdmin || plan?.uploaderUid === user?.uid

  const handleDelete = async () => {
    if (!window.confirm('이 제출물을 삭제하시겠습니까? 원본 파일도 함께 삭제되며 되돌릴 수 없습니다.')) return
    setDeleting(true)
    try {
      if (plan.sourceFile) await deleteAttachment(plan.sourceFile)
      await deleteDoc(doc(db, 'schools', schoolId, 'evaluationPlans', planId))
      navigate('/evalplan')
    } catch (e) {
      console.error('[EvalPlanDetail] 삭제 실패:', e)
      setDeleting(false)
    }
  }

  const data = plan?.data || {}
  const examRatio = data.examRatio || {}
  const examRatioCheck = useMemo(() => checkExamRatio(examRatio), [examRatio])
  const kind = useMemo(() => fileKind(plan?.sourceFile?.name || ''), [plan])
  const showMinAchievement = needsMinAchievementPlan(data.gradeMethod)
  const minPlan = data.minAchievementPlan

  if (loading) {
    return <Layout><Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box></Layout>
  }
  if (error || !plan) {
    return <Layout><Alert severity="error">{error || '제출물을 찾을 수 없습니다.'}</Alert></Layout>
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0,
          }}>
            📐
          </Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {plan.subject || '(과목명 없음)'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip
            size="small"
            label={STATUS_LABELS[plan.status] || plan.status}
            sx={plan.status === 'confirmed'
              ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }
              : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
          />
          {canEdit && (
            <>
              <Button
                variant="outlined" size="small" onClick={() => navigate(`/evalplan/${planId}/edit`)}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
              >
                수정
              </Button>
              <Button
                variant="outlined" size="small" color="error" disabled={deleting} onClick={handleDelete}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}
              >
                {deleting ? '삭제 중...' : '삭제'}
              </Button>
            </>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, mb: 3, flexWrap: 'wrap' }}>
        <Chip size="small" sx={infoChipSx} label={`${plan.year}학년도 ${plan.semester}학기`} />
        {(plan.grades || []).map((g) => <Chip key={g} size="small" sx={infoChipSx} label={`${g}학년`} />)}
        {plan.subjectGroup && <Chip size="small" sx={infoChipSx} label={plan.subjectGroup} />}
        {plan.weeklyHours != null && <Chip size="small" sx={infoChipSx} label={`${plan.weeklyHours}학점`} />}
        {plan.classes && <Chip size="small" sx={infoChipSx} label={plan.classes} />}
        <Chip size="small" sx={infoChipSx} label={`제출자 ${plan.uploaderName || '-'}`} />
        <Chip size="small" sx={infoChipSx} label={`제출일 ${fmtDate(plan.createdAt)}`} />
      </Box>

      <EvalPlanSection title="원본 파일">
        {plan.sourceFile ? (
          <Box
            component="a" href={plan.sourceFile.url} target="_blank" rel="noopener noreferrer"
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: '#334155',
              px: 1.5, py: 1, borderRadius: '10px', bgcolor: '#f8fafc', border: '1px solid #e2e8f0',
              '&:hover': { borderColor: ACCENT, color: ACCENT },
            }}
          >
            <DescriptionOutlinedIcon fontSize="small" />
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {kind.emoji} {plan.sourceFile.name} ({formatBytes(plan.sourceFile.size)})
            </Typography>
          </Box>
        ) : (
          <Typography sx={{ fontSize: '0.85rem', color: '#94a3b8' }}>원본 파일 정보가 없습니다.</Typography>
        )}
      </EvalPlanSection>

      {(plan.teacherMatches || []).length > 0 && (
        <EvalPlanSection title="담당교사 계정 매칭">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {plan.teacherMatches.map((m) => (
              isAdmin
                ? <TeacherMatchRow key={m.name} match={m} staff={staff} onAssign={handleAssignTeacher} />
                : (
                  <Chip
                    key={m.name} size="small"
                    color={m.status === 'matched' ? 'success' : 'default'}
                    variant={m.status === 'matched' ? 'filled' : 'outlined'}
                    label={m.status === 'matched' ? m.name : `${m.name} — 미배정`}
                    sx={{ alignSelf: 'flex-start' }}
                  />
                )
            ))}
          </Box>
          {!isAdmin && (plan.teacherMatches || []).some((m) => m.status !== 'matched') && (
            <Typography sx={{ fontSize: '0.76rem', color: '#94a3b8', mt: 1 }}>
              계정 매칭이 안 된 이름이 있습니다. 관리자에게 수동 배정을 요청해주세요.
            </Typography>
          )}
        </EvalPlanSection>
      )}

      <EvalPlanSection title="정기시험 · 수행평가 반영 비율">
        <Box sx={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
          <Table size="small">
            <TableHead sx={tableHeadSx}>
              <TableRow>
                <TableCell>구분</TableCell>
                <TableCell align="center">서·논술형</TableCell>
                <TableCell align="center">그 외 유형</TableCell>
                <TableCell align="center">소계</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {RATIO_ROWS.map(({ key, label, cols }) => (
                <TableRow key={key} sx={tableRowSx}>
                  <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>{label}</TableCell>
                  {cols.map((c) => <TableCell key={c} align="center">{cellText(examRatio[key]?.[c])}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {examRatioCheck.sum != null && (
          <Box sx={{
            mt: 1.5, p: 1.5, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: 1,
            bgcolor: examRatioCheck.sumOk ? '#f0fdf4' : '#fef2f2',
            border: '1px solid', borderColor: examRatioCheck.sumOk ? '#bbf7d0' : '#fecaca',
          }}>
            {examRatioCheck.sumOk ? (
              <>
                <CheckCircleIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                <Typography sx={{ fontSize: '0.82rem', color: '#166534', fontWeight: 700 }}>합계 100%</Typography>
              </>
            ) : (
              <>
                <WarningAmberIcon sx={{ fontSize: 18, color: '#dc2626' }} />
                <Typography sx={{ fontSize: '0.82rem', color: '#991b1b', fontWeight: 700 }}>
                  합계 {examRatioCheck.sum}% — 100%가 아닙니다
                </Typography>
              </>
            )}
          </Box>
        )}
      </EvalPlanSection>

      <EvalPlanSection title="수행평가 영역 요약">
        {(data.performanceAreas || []).length === 0 ? (
          <Typography sx={{ fontSize: '0.85rem', color: '#94a3b8' }}>등록된 영역이 없습니다.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
            <Table size="small">
              <TableHead sx={tableHeadSx}>
                <TableRow><TableCell>영역명</TableCell><TableCell align="center">비율</TableCell><TableCell align="center">만점</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {data.performanceAreas.map((a, i) => (
                  <TableRow key={i} sx={tableRowSx}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell align="center">{a.ratio ?? '-'}%</TableCell>
                    <TableCell align="center">{a.maxScore ?? '-'}점</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </EvalPlanSection>

      <EvalPlanSection title="성적산출방법">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {GRADE_METHOD_FIELDS.map(([key, label]) => {
            const enabled = data.gradeMethod?.[key]?.enabled
            return (
              <Chip
                key={key}
                size="small"
                label={label}
                sx={enabled
                  ? { bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700, border: `1px solid ${ACCENT}` }
                  : { bgcolor: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0' }}
              />
            )
          })}
        </Box>
      </EvalPlanSection>

      {showMinAchievement && minPlan && (() => {
        const isGrade1 = (plan.grades || []).includes(1)
        const overviewLabel = isGrade1 ? '최소 성취수준 보장지도 개요' : '추가학습 개요'
        return (
          <EvalPlanSection title={isGrade1 ? '최소성취수준 보장지도 운영계획' : '추가학습 운영계획'}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', mb: 0.75 }}>{overviewLabel}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              <Chip size="small" sx={infoChipSx} label={`학점수 ${minPlan.additionalStudy?.credits || '-'}`} />
              <Chip size="small" sx={infoChipSx} label={`추가학습 시수 ${minPlan.additionalStudy?.extraStudyHours || '-'}`} />
              <Chip size="small" sx={infoChipSx} label={`예방지도 인정시수 ${minPlan.additionalStudy?.preventionHoursRecognized || '-'}`} />
              <Chip size="small" sx={infoChipSx} label={`이수 인정 기준 시수 ${minPlan.additionalStudy?.creditRecognitionHours || '-'}`} />
            </Box>
          </EvalPlanSection>
        )
      })()}
    </Layout>
  )
}
