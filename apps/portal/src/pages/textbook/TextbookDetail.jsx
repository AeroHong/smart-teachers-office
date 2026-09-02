import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Snackbar from '@mui/material/Snackbar'
import EditNoteIcon from '@mui/icons-material/EditNote'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
import { USERS } from '@shared/lib/schema'
import {
  subscribeAdoption, subscribeScores, subscribeMyScore, subscribeDeptHead,
  closeAndAggregate, reopenAdoption, saveRecommendation, saveSummarySignoff, saveExternalScore, STATUS_LABELS,
} from '@shared/lib/textbookAdoption'
import { openSummaryPrint, openRecommendationPrint, openScoreSheetPrint } from './textbookPrint'
import Layout from '../../components/Layout'
import ScoreEntryForm from './ScoreEntryForm'
import TextbookSection, { ACCENT, ACCENT_BG } from './TextbookSection'

const infoChipSx = { bgcolor: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.74rem' }

export default function TextbookDetail() {
  const { adoptionId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId, isAdmin } = useAuth()

  const [adoption, setAdoption] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scores, setScores] = useState([])
  const [myScore, setMyScore] = useState(null)
  const [closing, setClosing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [recDraft, setRecDraft] = useState(null)
  const [savingRec, setSavingRec] = useState(false)
  const [snack, setSnack] = useState('')
  const [staffByUid, setStaffByUid] = useState({})
  const [deptHead, setDeptHead] = useState(null)
  const [savingSignoff, setSavingSignoff] = useState(false)
  const [proxyTarget, setProxyTarget] = useState(null) // 대리채점 중인 externalMember
  const [proxyScore, setProxyScore] = useState(null)
  const [proxyScoreLoaded, setProxyScoreLoaded] = useState(false)
  const [proxySaving, setProxySaving] = useState(false)

  useEffect(() => {
    if (!schoolId || !adoptionId) return
    const unsub = subscribeAdoption(schoolId, adoptionId, (data) => {
      setAdoption(data)
      setLoading(false)
    }, (err) => { setError(err.message); setLoading(false) })
    return unsub
  }, [schoolId, adoptionId])

  // 위원 이름 표시용 — 아직 한 번도 저장하지 않은 위원은 scores 서브컬렉션에 문서가 없어
  // teacherName을 알 수 없다. users에서 이름을 미리 가져와 그 빈칸을 채운다.
  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId)))
      .then((snap) => setStaffByUid(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().name || d.data().email]))))
      .catch(() => {})
  }, [schoolId])

  const isCommittee = !!(user && adoption?.committeeUids?.includes(user.uid))
  const isHead = !!(user && adoption?.subjectHeadUid === user.uid)
  const isDeptHead = !!(user && deptHead && deptHead.uid === user.uid)
  const canManage = isAdmin || isHead || isDeptHead
  const externalMembers = adoption?.externalMembers || []
  const totalMemberCount = (adoption?.committeeUids?.length || 0) + externalMembers.length

  // 이 건의 교과부장 — 서식2 확인자·서식3 작성자로 실시간 표시한다(교과부장이 바뀌면 즉시 반영).
  useEffect(() => {
    if (!schoolId || !adoption?.subjectGroup) { setDeptHead(null); return }
    const unsub = subscribeDeptHead(schoolId, adoption.subjectGroup, setDeptHead, () => setDeptHead(null))
    return unsub
  }, [schoolId, adoption?.subjectGroup])

  useEffect(() => {
    if (!canManage || !schoolId || !adoptionId) { setScores([]); return }
    const unsub = subscribeScores(schoolId, adoptionId, setScores, (err) => console.error('[TextbookDetail] 제출 현황 조회 실패:', err))
    return unsub
  }, [canManage, schoolId, adoptionId])

  useEffect(() => {
    if (!isCommittee || !schoolId || !adoptionId || !user) { setMyScore(null); return }
    const unsub = subscribeMyScore(schoolId, adoptionId, user.uid, setMyScore, (err) => console.error('[TextbookDetail] 내 점수 조회 실패:', err))
    return unsub
  }, [isCommittee, schoolId, adoptionId, user])

  useEffect(() => {
    setRecDraft(adoption?.recommendation ? JSON.parse(JSON.stringify(adoption.recommendation)) : null)
  }, [adoption?.recommendation])

  useEffect(() => {
    if (!proxyTarget || !schoolId || !adoptionId) { setProxyScore(null); setProxyScoreLoaded(false); return }
    setProxyScoreLoaded(false)
    setProxyScore(null)
    const unsub = subscribeMyScore(schoolId, adoptionId, proxyTarget.id, (data) => {
      setProxyScore(data)
      setProxyScoreLoaded(true)
    }, (err) => { console.error('[TextbookDetail] 외부 위원 점수 조회 실패:', err) })
    return unsub
  }, [proxyTarget, schoolId, adoptionId])

  const candidateById = useMemo(() => {
    const map = {}
    ;(adoption?.candidates || []).forEach((c) => { map[c.id] = c })
    return map
  }, [adoption])

  const submittedCount = scores.filter((s) => s.submittedAt).length

  const handleClose = async () => {
    setClosing(true)
    try {
      await closeAndAggregate(schoolId, adoptionId, adoption.candidates || [], adoption.recommendation)
      setSnack('채점을 마감하고 집계했습니다.')
    } catch (e) {
      setError(`마감 실패: ${e.message}`)
    } finally {
      setClosing(false)
      setConfirmOpen(false)
    }
  }

  const handleReopen = async () => {
    try {
      await reopenAdoption(schoolId, adoptionId)
      setSnack('채점을 다시 열었습니다.')
    } catch (e) {
      setError(`재오픈 실패: ${e.message}`)
    }
  }

  const handleSaveRecommendation = async () => {
    setSavingRec(true)
    try {
      await saveRecommendation(schoolId, adoptionId, recDraft)
      setSnack('추천의견을 저장했습니다.')
    } catch (e) {
      setError(`저장 실패: ${e.message}`)
    } finally {
      setSavingRec(false)
    }
  }

  const handlePickPreparer = async (uid) => {
    const name = staffByUid[uid] || uid
    setSavingSignoff(true)
    try {
      await saveSummarySignoff(schoolId, adoptionId, { preparedByUid: uid, preparedByName: name })
    } catch (e) {
      setError(`저장 실패: ${e.message}`)
    } finally {
      setSavingSignoff(false)
    }
  }

  const handlePrintSummary = () => openSummaryPrint(adoption, scores, deptHead?.name)
  const handlePrintRecommendation = () => openRecommendationPrint(adoption, deptHead?.name)

  const handleSaveExternalScore = async (byCandidate, opinion, submit) => {
    setProxySaving(true)
    try {
      await saveExternalScore(schoolId, adoptionId, proxyTarget.id, proxyTarget.name, byCandidate, submit, opinion, user.uid, userName)
      setSnack(submit ? '외부 위원 채점을 제출했습니다.' : '임시저장했습니다.')
    } catch (e) {
      setError(`저장 실패: ${e.message}`)
    } finally {
      setProxySaving(false)
    }
  }

  const handlePrintExternalScore = (byCandidate, opinion) => {
    openScoreSheetPrint(adoption, { ...proxyScore, byCandidate, opinion, teacherName: proxyTarget?.name })
  }

  if (loading) {
    return <Layout><Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box></Layout>
  }
  if (error) {
    return <Layout><Alert severity="error" sx={{ borderRadius: '10px' }}>{error}</Alert></Layout>
  }
  if (!adoption) {
    return <Layout><Alert severity="warning" sx={{ borderRadius: '10px' }}>선정 건을 찾을 수 없습니다.</Alert></Layout>
  }

  const rankedIds = adoption.aggregate
    ? Object.entries(adoption.aggregate).sort((a, b) => a[1].rank - b[1].rank).map(([id]) => id)
    : []

  return (
    <Layout wide>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📚</Box>
          <Box>
            <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>{adoption.subjectName}</Typography>
            <Box sx={{ display: 'flex', gap: 0.6, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip size="small" sx={infoChipSx} label={`${adoption.cycleYear}학년도 선정`} />
              <Chip size="small" sx={infoChipSx} label={`위원 ${totalMemberCount}명${externalMembers.length ? ` (외부 ${externalMembers.length})` : ''}`} />
            </Box>
          </Box>
        </Box>
        <Chip
          size="small"
          label={STATUS_LABELS[adoption.status] || adoption.status}
          sx={adoption.status === 'closed' ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 } : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
        />
      </Box>

      {error && <Alert severity="error" sx={{ mt: 2, borderRadius: '10px' }}>{error}</Alert>}

      {/* ── 후보 교과서 ── */}
      <TextbookSection title="후보 교과서">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {(adoption.candidates || []).map((c) => (
            <Box key={c.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{c.publisher}</Typography>
              {c.author && <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>({c.author})</Typography>}
              {c.price && <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>· {c.price}원</Typography>}
            </Box>
          ))}
        </Box>
      </TextbookSection>

      {/* ── 채점 진행 상태 ── */}
      {adoption.status === 'collecting' && (
        <TextbookSection
          title="채점"
          right={isCommittee && (
            <Button
              variant="contained" size="small" startIcon={<EditNoteIcon />} onClick={() => navigate(`/textbook/${adoptionId}/evaluate`)}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#0d5f59', boxShadow: 'none' } }}
            >
              채점하기
            </Button>
          )}
        >
          {isCommittee && (
            <Typography sx={{ fontSize: '0.82rem', color: '#64748b', mb: canManage ? 2 : 0 }}>
              {myScore?.submittedAt ? '제출을 완료했습니다.' : myScore ? '임시저장된 채점이 있습니다.' : '아직 채점하지 않았습니다.'}
            </Typography>
          )}
          {canManage && (
            <>
              <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: '#1e293b', mb: 1 }}>
                제출 현황: {submittedCount} / {totalMemberCount}명
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 2 }}>
                {(adoption.committeeUids || []).map((uid) => {
                  const s = scores.find((sc) => sc.uid === uid)
                  return (
                    <Chip
                      key={uid} size="small"
                      label={s?.teacherName || staffByUid[uid] || uid}
                      sx={s?.submittedAt
                        ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }
                        : s
                          ? { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }
                          : { bgcolor: '#f1f5f9', color: '#94a3b8', fontWeight: 600 }}
                    />
                  )
                })}
                {externalMembers.map((m) => {
                  const s = scores.find((sc) => sc.uid === m.id)
                  return (
                    <Chip
                      key={m.id} size="small"
                      icon={<HowToRegIcon sx={{ fontSize: '1rem !important' }} />}
                      onClick={() => setProxyTarget(m)}
                      label={`${m.name} (외부)`}
                      sx={s?.submittedAt
                        ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700, cursor: 'pointer' }
                        : s
                          ? { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700, cursor: 'pointer' }
                          : { bgcolor: '#f1f5f9', color: '#94a3b8', fontWeight: 600, cursor: 'pointer' }}
                    />
                  )
                })}
              </Box>
              {externalMembers.length > 0 && (
                <Typography sx={{ fontSize: '0.76rem', color: '#94a3b8', mb: 2 }}>
                  외부 위원 칩을 클릭하면 오프라인으로 받은 점수를 대신 입력할 수 있습니다.
                </Typography>
              )}
              <Button
                variant="outlined" size="small" startIcon={<LockIcon />} onClick={() => setConfirmOpen(true)}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: ACCENT, color: ACCENT }}
              >
                채점 마감 및 집계
              </Button>
            </>
          )}
          {!isCommittee && !canManage && (
            <Typography sx={{ fontSize: '0.82rem', color: '#94a3b8' }}>
              위원별 개별 점수는 공정성을 위해 비공개이며, 마감 후 집계 결과만 공개됩니다.
            </Typography>
          )}
        </TextbookSection>
      )}

      {/* 마감 후에도 외부 위원 평가표(서식1)는 다시 열어 볼 수 있어야 한다 — 내부 위원은 각자
          /evaluate 페이지에서 상태와 무관하게 조회·인쇄할 수 있지만, 외부 위원은 계정이 없어
          이 화면의 대리채점 다이얼로그가 유일한 창구이기 때문. */}
      {adoption.status !== 'collecting' && canManage && externalMembers.length > 0 && (
        <TextbookSection title="외부 위원 평가표 (서식1)">
          <Typography sx={{ fontSize: '0.82rem', color: '#64748b', mb: 1.5 }}>
            외부 위원 칩을 클릭하면 제출된 평가표를 다시 열어 인쇄할 수 있습니다.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
            {externalMembers.map((m) => {
              const s = scores.find((sc) => sc.uid === m.id)
              return (
                <Chip
                  key={m.id} size="small"
                  icon={<HowToRegIcon sx={{ fontSize: '1rem !important' }} />}
                  onClick={() => setProxyTarget(m)}
                  label={`${m.name} (외부)`}
                  sx={s?.submittedAt
                    ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700, cursor: 'pointer' }
                    : { bgcolor: '#f1f5f9', color: '#94a3b8', fontWeight: 600, cursor: 'pointer' }}
                />
              )
            })}
          </Box>
        </TextbookSection>
      )}

      {/* ── 집계 결과 (서식2 — 검·인정도서 선정기준 평가 총괄표) ── */}
      {adoption.status === 'closed' && (
        <TextbookSection
          title="집계 결과 (서식2)"
          right={
            <Box sx={{ display: 'flex', gap: 1 }}>
              {canManage && (
                <Button size="small" startIcon={<PrintOutlinedIcon />} onClick={handlePrintSummary} sx={{ textTransform: 'none', fontWeight: 700, color: '#475569' }}>
                  인쇄
                </Button>
              )}
              {canManage && (
                <Button
                  size="small" startIcon={<LockOpenIcon />} onClick={handleReopen}
                  sx={{ textTransform: 'none', fontWeight: 700, color: '#94a3b8' }}
                >
                  다시 채점 열기
                </Button>
              )}
            </Box>
          }
        >
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.74rem', borderBottom: '1px solid #e2e8f0' } }}>
                <TableRow>
                  <TableCell align="center" width={60}>순위</TableCell>
                  <TableCell>출판사 / 저자</TableCell>
                  <TableCell align="center">가격</TableCell>
                  {canManage && scores.filter((s) => s.submittedAt).map((_, i) => (
                    <TableCell key={i} align="center">위원{i + 1}</TableCell>
                  ))}
                  <TableCell align="center">총점</TableCell>
                  <TableCell align="center">평균</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rankedIds.map((id) => {
                  const c = candidateById[id]
                  const agg = adoption.aggregate[id]
                  const submittedScores = scores.filter((s) => s.submittedAt)
                  return (
                    <TableRow key={id} sx={{ '& td': { borderBottom: '1px solid #f1f5f9' } }}>
                      <TableCell align="center">
                        <Chip size="small" label={agg.rank} sx={agg.rank <= 3 ? { bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 800 } : { fontWeight: 700 }} />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.86rem' }}>{c?.publisher || '(삭제된 후보)'}</Typography>
                        {c?.author && <Typography sx={{ fontSize: '0.76rem', color: '#94a3b8' }}>{c.author}</Typography>}
                      </TableCell>
                      <TableCell align="center">{c?.price || '-'}</TableCell>
                      {canManage && submittedScores.map((s) => (
                        <TableCell key={s.uid} align="center">{s.byCandidate?.[id]?.total ?? '-'}</TableCell>
                      ))}
                      <TableCell align="center">{agg.total}</TableCell>
                      <TableCell align="center">{agg.average}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>

          {canManage && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}>
              <FormControl size="small">
                <InputLabel>작성자(위원)</InputLabel>
                <Select
                  label="작성자(위원)" value={adoption.summarySignoff?.preparedByUid || ''} disabled={savingSignoff}
                  onChange={(e) => handlePickPreparer(e.target.value)}
                >
                  {(adoption.committeeUids || []).map((uid) => (
                    <MenuItem key={uid} value={uid}>{staffByUid[uid] || uid}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="확인자(교과부장)" size="small" disabled
                value={deptHead?.name || '(교과부장 미지정)'}
              />
            </Box>
          )}
        </TextbookSection>
      )}

      {/* ── 추천의견 (서식3 — 추천 검·인정도서 및 추천 의견서) ── */}
      {adoption.status === 'closed' && recDraft && (
        <TextbookSection
          title="추천 도서 및 추천의견 (서식3, 상위 3개)"
          right={
            <Button size="small" startIcon={<PrintOutlinedIcon />} onClick={handlePrintRecommendation} sx={{ textTransform: 'none', fontWeight: 700, color: '#475569' }}>
              인쇄
            </Button>
          }
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
            {recDraft.opinions.map((op, idx) => {
              const c = candidateById[op.candidateId]
              return (
                <Box key={op.candidateId} sx={{ p: 1.5, borderRadius: '10px', border: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                  <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: '#1e293b', mb: 0.75 }}>
                    {op.rank}순위 · {c?.publisher || '(삭제된 후보)'}{c?.price ? ` · ${c.price}원` : ''}
                  </Typography>
                  <TextField
                    fullWidth multiline minRows={2} size="small" placeholder="추천의견을 입력하세요"
                    disabled={!canManage}
                    value={op.text}
                    onChange={(e) => {
                      const opinions = [...recDraft.opinions]
                      opinions[idx] = { ...op, text: e.target.value }
                      setRecDraft({ ...recDraft, opinions })
                    }}
                  />
                </Box>
              )
            })}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: canManage ? 2 : 0 }}>
            <TextField
              label="작성자(교과부장)" size="small" disabled
              value={deptHead?.name || '(교과부장 미지정)'}
            />
            <TextField
              label="확인자(교감)" size="small" disabled
              value={adoption.recommendation?.confirmedAt
                ? `${adoption.recommendation.confirmedByName} · 확인완료`
                : '미확인 — 교감 계정의 "교감 확인" 화면에서 확인 대기중'}
            />
          </Box>
          {canManage && (
            <Button
              variant="contained" size="small" disabled={savingRec} onClick={handleSaveRecommendation}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#0d5f59', boxShadow: 'none' } }}
            >
              추천의견 저장
            </Button>
          )}
        </TextbookSection>
      )}

      <Button size="small" onClick={() => navigate('/textbook')} sx={{ mt: 1, textTransform: 'none', color: '#64748b' }}>
        ← 목록으로
      </Button>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>채점을 마감할까요?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.88rem', color: '#475569' }}>
            제출된 위원 점수({submittedCount} / {totalMemberCount}명)를 기준으로 집계합니다.
            마감 후에는 위원들이 채점을 수정할 수 없고, 필요하면 다시 열 수 있습니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>취소</Button>
          <Button variant="contained" disabled={closing} onClick={handleClose} sx={{ bgcolor: ACCENT, '&:hover': { bgcolor: '#0d5f59' } }}>
            마감 및 집계
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!proxyTarget} onClose={() => setProxyTarget(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          외부 위원 대리채점
          {proxyTarget && (
            <Typography variant="caption" color="text.secondary" display="block">
              {proxyTarget.name}{proxyTarget.affiliation ? ` · ${proxyTarget.affiliation}` : ''}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {proxyTarget && (
            <ScoreEntryForm
              key={proxyTarget.id}
              adoption={adoption}
              ready={proxyScoreLoaded}
              initialByCandidate={proxyScore?.byCandidate}
              initialOpinion={proxyScore?.opinion}
              canEdit={adoption.status === 'collecting'}
              saving={proxySaving}
              onSave={handleSaveExternalScore}
              onPrint={proxyScore ? handlePrintExternalScore : undefined}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProxyTarget(null)}>닫기</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={2500} onClose={() => setSnack('')} message={snack} />
    </Layout>
  )
}
