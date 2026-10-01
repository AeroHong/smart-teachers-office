import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SettingsIcon from '@mui/icons-material/Settings'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
import { USERS, sanitizeSubjectGroup } from '@shared/lib/schema'
import {
  subscribeMyAdoptions, subscribeMySubjectHeadAdoptions, subscribeMyDeptHeadGroups,
  subscribeUnassignedSubjectHeadAdoptions, claimSubjectHead, releaseSubjectHead, STATUS_LABELS,
} from '@shared/lib/textbookAdoption'
import { SUBJECT_GROUPS } from '@shared/lib/subjectData'
import Layout from '../../components/Layout'
import { ACCENT, ACCENT_BG } from './TextbookSection'

const infoChipSx = { bgcolor: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.74rem' }
const roleChipSx = { bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700, fontSize: '0.74rem' }

const groupLabel = (key) => SUBJECT_GROUPS.find((g) => sanitizeSubjectGroup(g) === key) || '미분류'
const groupOrder = (key) => {
  const idx = SUBJECT_GROUPS.findIndex((g) => sanitizeSubjectGroup(g) === key)
  return idx === -1 ? SUBJECT_GROUPS.length : idx
}

// 내 선정 건 카드에 과목 대표교사·위원 명단을 보여준다 — 누가 그 과목을 맡고 누가 채점하는지는
// 공개 정보다(점수만 비공개). 대표교사를 위원 명단 맨 앞에 둔다.
function PeopleLine({ label, names }) {
  return (
    <Typography sx={{ fontSize: '0.8rem', color: '#475569', mt: 0.5 }}>
      <Box component="span" sx={{ color: '#94a3b8', fontWeight: 600, mr: 0.75 }}>{label}</Box>
      {names.length ? names.join(', ') : <Box component="span" sx={{ color: '#cbd5e1' }}>미지정</Box>}
    </Typography>
  )
}

// 제출 현황 — submittedUids는 서버 트리거(functions/textbookScoreSync.js)가 점수 없이 "누가
// 제출했는지"만 적어 둔 값이라 일반 위원도 읽을 수 있다(점수 자체는 계속 비공개).
function submissionState(adoption) {
  const members = [...(adoption.committeeUids || []), ...(adoption.externalMemberIds || [])]
  const submitted = new Set(adoption.submittedUids || [])
  const done = members.filter((id) => submitted.has(id)).length
  return { total: members.length, done, all: members.length > 0 && done === members.length }
}

function AdoptionCard({ adoption, myUid, nameOf, onClick, onRelease }) {
  const sub = submissionState(adoption)
  const headUid = adoption.subjectHeadUid || ''
  const committeeNames = [
    ...(adoption.committeeUids || []).filter((uid) => uid === headUid),
    ...(adoption.committeeUids || []).filter((uid) => uid !== headUid),
  ].map(nameOf).concat((adoption.externalMembers || []).map((m) => `${m.name}(외부)`))
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap',
        p: 2, borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff', cursor: 'pointer',
        transition: 'all 0.12s',
        '&:hover': { borderColor: ACCENT, boxShadow: '0 2px 8px rgba(15,118,110,0.08)' },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
          {adoption.subjectName || '(과목명 없음)'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.6, mt: 0.75, flexWrap: 'wrap' }}>
          {adoption.isCommittee && <Chip size="small" sx={roleChipSx} label="위원" />}
          {adoption.isCommittee && adoption.status !== 'closed' && (
            (adoption.submittedUids || []).includes(myUid)
              ? <Chip size="small" label="✓ 내 채점 완료" sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: '0.74rem' }} />
              : <Chip size="small" label="채점 전" sx={{ bgcolor: '#fff7ed', color: '#c2410c', fontWeight: 700, fontSize: '0.74rem', border: '1px solid #fed7aa' }} />
          )}
          {adoption.isHead && <Chip size="small" sx={roleChipSx} label="과목 대표교사" />}
          <Chip size="small" sx={infoChipSx} label={`${adoption.cycleYear}학년도 선정`} />
          <Chip size="small" sx={infoChipSx} label={`후보 ${adoption.candidates?.length || 0}개`} />
        </Box>
        <PeopleLine label="대표교사" names={headUid ? [nameOf(headUid)] : []} />
        <PeopleLine label="위원" names={committeeNames} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {adoption.isHead && onRelease && (
          <Button
            size="small" onClick={(e) => { e.stopPropagation(); onRelease(adoption) }}
            sx={{ textTransform: 'none', fontSize: '0.72rem', color: '#94a3b8', minWidth: 0, px: 0.75 }}
          >
            담당 해제
          </Button>
        )}
        <Chip
          size="small"
          label={adoption.status === 'closed'
            ? STATUS_LABELS.closed
            : sub.all ? '채점완료 · 마감 대기' : `${STATUS_LABELS.collecting} ${sub.done}/${sub.total}`}
          sx={adoption.status === 'closed'
            ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }
            : sub.all
              ? { bgcolor: '#e0f2fe', color: '#075985', fontWeight: 700 }
              : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
        />
        <ChevronRightIcon sx={{ color: '#cbd5e1' }} />
      </Box>
    </Box>
  )
}

function UnassignedRow({ adoption, onClaim, claiming }) {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap',
        p: 1.5, borderRadius: '12px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>
          {adoption.subjectName || '(과목명 없음)'}
        </Typography>
        <Chip size="small" sx={infoChipSx} label={groupLabel(adoption.subjectGroup)} />
        <Chip size="small" sx={infoChipSx} label={`${adoption.cycleYear}학년도 선정`} />
      </Box>
      <Button
        size="small" variant="contained" disabled={claiming} onClick={() => onClaim(adoption)}
        sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#0d5f59', boxShadow: 'none' } }}
      >
        {claiming ? '처리 중...' : '내가 맡을게요'}
      </Button>
    </Box>
  )
}

export default function TextbookHome() {
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [committeeAdoptions, setCommitteeAdoptions] = useState([])
  const [headAdoptions, setHeadAdoptions] = useState([])
  const [committeeLoaded, setCommitteeLoaded] = useState(false)
  const [headLoaded, setHeadLoaded] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!schoolId || !user) return
    const unsub = subscribeMyAdoptions(schoolId, user.uid, (list) => {
      setCommitteeAdoptions(list)
      setCommitteeLoaded(true)
    }, (err) => {
      console.error('[TextbookHome] 위원 목록 조회 실패:', err)
      setError(err.message)
      setCommitteeLoaded(true)
    })
    return unsub
  }, [schoolId, user])

  // 과목 대표교사는 채점 없이 진행상황만 관리하는 사람일 수도 있어 위원(committeeUids)
  // 목록에 없을 수 있다 — 그래서 별도 쿼리로 가져와 합친다.
  useEffect(() => {
    if (!schoolId || !user) return
    const unsub = subscribeMySubjectHeadAdoptions(schoolId, user.uid, (list) => {
      setHeadAdoptions(list)
      setHeadLoaded(true)
    }, (err) => {
      console.error('[TextbookHome] 과목 대표교사 목록 조회 실패:', err)
      setHeadLoaded(true)
    })
    return unsub
  }, [schoolId, user])

  // 카드에 대표교사·위원 이름을 보여주기 위한 같은 학교 구성원 이름표(TextbookDetail과 같은 조회).
  const [staffByUid, setStaffByUid] = useState({})
  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId)))
      .then((snap) => setStaffByUid(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().name || d.data().email]))))
      .catch((e) => console.error('[TextbookHome] 구성원 이름 조회 실패:', e))
  }, [schoolId])
  const nameOf = (uid) => staffByUid[uid] || '(알 수 없음)'

  // 교과부장이면 "전체 현황"에서 자기 교과군을 모아볼 수 있어야 하므로 지정 여부만 확인.
  const [myDeptGroups, setMyDeptGroups] = useState([])
  useEffect(() => {
    if (!schoolId || !user) return
    const unsub = subscribeMyDeptHeadGroups(schoolId, user.uid, setMyDeptGroups, () => {})
    return unsub
  }, [schoolId, user])

  // 대표교사가 비어 있는 과목을 둘러보고 자원(self-claim)할 수 있게 별도로 구독한다.
  const [unassigned, setUnassigned] = useState([])
  const [claimingId, setClaimingId] = useState(null)
  useEffect(() => {
    if (!schoolId) return
    const unsub = subscribeUnassignedSubjectHeadAdoptions(schoolId, setUnassigned, () => {})
    return unsub
  }, [schoolId])

  const unassignedSorted = useMemo(() => (
    unassigned
      .filter((a) => a.status !== 'closed')
      .sort((a, b) => (
        groupOrder(a.subjectGroup) - groupOrder(b.subjectGroup)
      ) || (a.subjectName || '').localeCompare(b.subjectName || '', 'ko'))
  ), [unassigned])

  const handleClaim = async (adoption) => {
    if (!window.confirm(`'${adoption.subjectName}' 과목의 대표교사를 맡으시겠습니까?\n채점 마감·집계, 서식 작성 등을 담당하게 됩니다.`)) return
    setClaimingId(adoption.id)
    try {
      await claimSubjectHead(schoolId, adoption.id, user.uid)
    } catch (e) {
      alert('이미 다른 선생님이 맡으셨거나 처리 중 오류가 발생했습니다.\n' + e.message)
    } finally {
      setClaimingId(null)
    }
  }

  const handleRelease = async (adoption) => {
    if (adoption.status === 'closed') {
      alert('마감된 과목은 해제할 수 없습니다.\n상세 화면에서 "다시 채점 열기" 후 해제하세요.')
      return
    }
    const memberCount = (adoption.committeeUids || []).length + (adoption.externalMembers || []).length
    if (!window.confirm(
      `'${adoption.subjectName}' 과목 대표교사 담당을 해제하시겠습니까?\n\n`
      + `위원 ${memberCount}명(본인 포함)도 모두 해제되고, 위원들이 입력한 점수도 함께 삭제됩니다.\n`
      + '이 과목은 담당자 미지정 목록으로 돌아갑니다.',
    )) return
    try {
      await releaseSubjectHead(schoolId, adoption.id)
    } catch (e) {
      alert('처리 중 오류가 발생했습니다.\n' + e.message)
    }
  }

  const loading = !committeeLoaded || !headLoaded

  const adoptions = useMemo(() => {
    const byId = new Map()
    committeeAdoptions.forEach((a) => byId.set(a.id, { ...a, isCommittee: true }))
    headAdoptions.forEach((a) => {
      const existing = byId.get(a.id)
      byId.set(a.id, existing ? { ...existing, isHead: true } : { ...a, isHead: true })
    })
    // 이미 대표교사로 지정(자원 포함)된 과목을 위원으로만 참여하는 과목보다 위로 올린다 —
    // 대표교사 역할이 채점 마감·집계 등 더 챙길 게 많아 눈에 먼저 띄어야 한다.
    return [...byId.values()].sort((a, b) => (
      (b.isHead ? 1 : 0) - (a.isHead ? 1 : 0)
    ) || (b.cycleYear - a.cycleYear) || a.subjectName.localeCompare(b.subjectName, 'ko'))
  }, [committeeAdoptions, headAdoptions])

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
          }}>
            📚
          </Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            검·인정도서 선정
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {(isAdmin || myDeptGroups.length > 0) && (
            <Button
              variant="outlined" size="small" onClick={() => navigate('/textbook/all')}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
            >
              전체 현황
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="contained" size="small" startIcon={<SettingsIcon />} onClick={() => navigate('/admin/textbook-subjects')}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#0d5f59', boxShadow: 'none' } }}
            >
              선정 건 관리
            </Button>
          )}
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        평가위원 또는 과목 대표교사로 지정된 과목을 관리합니다. 개별 위원의 점수는 마감 전까지 다른 위원에게 공개되지 않습니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {(() => {
        const unassignedSection = unassignedSorted.length > 0 && (
          <Box key="unassigned" sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', mb: 0.25 }}>
              담당자 미지정 과목 ({unassignedSorted.length})
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', color: '#64748b', mb: 1.25 }}>
              아직 과목 대표교사가 지정되지 않은 과목입니다. 본인이 담당할 과목이 있으면 직접 맡아주세요.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {unassignedSorted.map((a) => (
                <UnassignedRow key={a.id} adoption={a} onClaim={handleClaim} claiming={claimingId === a.id} />
              ))}
            </Box>
          </Box>
        )

        const mySection = (
          <Box key="mine" sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', mb: 1.25 }}>
              내 선정 건
            </Typography>
            {loading ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress size={28} sx={{ color: ACCENT }} />
              </Box>
            ) : adoptions.length === 0 ? (
              <Box sx={{
                textAlign: 'center', py: 6, borderRadius: '14px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc',
              }}>
                <Typography sx={{ fontSize: '2rem', mb: 1 }}>📭</Typography>
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                  평가위원 또는 과목 대표교사로 지정된 선정 건이 없습니다. 위에서 담당할 과목을 맡거나, 관리자에게 문의하세요.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {adoptions.map((a) => (
                  <AdoptionCard key={a.id} adoption={a} myUid={user?.uid} nameOf={nameOf} onClick={() => navigate(`/textbook/${a.id}`)} onRelease={handleRelease} />
                ))}
              </Box>
            )}
          </Box>
        )

        // 이미 담당하는 선정 건이 있으면 그 목록을 위로 올리고, 없으면 자원할 수 있는
        // 미지정 목록을 먼저 보여준다(빈 상태 안내 문구의 "위에서 맡으세요"가 맞도록).
        return adoptions.length > 0 ? [mySection, unassignedSection] : [unassignedSection, mySection]
      })()}
    </Layout>
  )
}
