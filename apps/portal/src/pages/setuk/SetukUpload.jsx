import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import RefreshIcon from '@mui/icons-material/Refresh'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useAuth } from '@shared/contexts/AuthContext'
import { currentSchoolYear } from '@shared/lib/schema'
import { subscribeChecks, saveCheck, deleteCheck, recheckCheck, buildTeacherSubjectIndex, subjectIndexKey, getDictionary } from '@shared/lib/setukCheck'
import { parseNeisSetukFile, checkText, loadDictionary } from './setukUtils'
import SetukDictionaryDialog from './SetukDictionaryDialog'
import SetukBySubject from './SetukBySubject'
import SetukTeacherAssignments from './SetukTeacherAssignments'
import Layout from '../../components/Layout'

export default function SetukUpload() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, userName, schoolId, isAdmin } = useAuth()
  const fileInputRef = useRef(null)

  // 과목별 보기 상세(SetukSubjectDetail)에서 "← 과목별 보기로"를 누르면 학급별 목록이
  // 아니라 과목별 보기 탭으로 돌아오게 한다.
  const [tab, setTab] = useState(location.state?.tab ?? 0)
  const [checks, setChecks] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [dictOpen, setDictOpen] = useState(false)
  const [recheckingIds, setRecheckingIds] = useState({})

  useEffect(() => {
    if (!schoolId) return
    const unsub = subscribeChecks(schoolId, (list) => { setChecks(list); setLoadingList(false) }, (err) => { setError(err.message); setLoadingList(false) })
    return unsub
  }, [schoolId])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError('')
    setProcessing(true)
    try {
      setProgressMsg('파일을 읽는 중...')
      const { classLabel, records } = await parseNeisSetukFile(file)

      setProgressMsg('오타·금지어·띄어쓰기 점검 중...')
      let customDict = null
      try {
        customDict = await getDictionary(schoolId)
      } catch (e) {
        console.error('[SetukUpload] 학교 추가 사전 조회 실패(기본 목록만 사용):', e)
      }
      const dictionary = loadDictionary(customDict)
      const items = []
      const recordsWithCount = records.map((r, recordIndex) => {
        const flags = checkText(r.text, dictionary, r.studentName)
        flags.forEach((f) => {
          items.push({
            recordIndex,
            studentNumber: r.studentNumber,
            studentName: r.studentName,
            subjectName: r.subjectName,
            ruleId: f.ruleId,
            category: f.category,
            authority: f.authority,
            severity: f.severity,
            matched: f.matched,
            index: f.index,
            length: f.length,
            message: f.message,
            before: f.before,
            after: f.after,
            resolved: false,
            resolution: null,
            resolvedByUid: null,
            resolvedByName: null,
            resolvedAt: null,
            note: '',
          })
        })
        return { ...r, flagCount: flags.length }
      })

      setProgressMsg('담당 교사 자동 매칭 중...')
      let subjectAssignments = {}
      try {
        const idx = await buildTeacherSubjectIndex(schoolId, currentSchoolYear())
        const bySubject = {}
        recordsWithCount.forEach((r) => { bySubject[r.subjectName] = r.grade })
        subjectAssignments = Object.fromEntries(
          Object.entries(bySubject).map(([subjectName, grade]) => {
            const candidates = idx[subjectIndexKey(grade, subjectName)] || []
            if (candidates.length === 1) {
              return [subjectName, { teacherUid: candidates[0].uid, teacherName: candidates[0].name, source: 'auto' }]
            }
            return [subjectName, { teacherUid: '', teacherName: '', source: 'manual' }]
          }),
        )
      } catch (e) {
        console.error('[SetukUpload] 담당교사 자동 매칭 실패(수동 지정으로 계속):', e)
      }

      setProgressMsg('저장 중...')
      const grade = recordsWithCount.find((r) => r.grade)?.grade || null
      const checkId = await saveCheck(schoolId, { classLabel, grade }, recordsWithCount, items, subjectAssignments, user.uid, userName)

      navigate(`/setuk/${checkId}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
      setProgressMsg('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [schoolId, user, userName, navigate])

  const handleDelete = async (check) => {
    if (!window.confirm(`"${check.classLabel}" 점검 결과를 삭제할까요? 되돌릴 수 없습니다.`)) return
    try {
      await deleteCheck(schoolId, check.id)
    } catch (e) {
      setError(`삭제 실패: ${e.message}`)
    }
  }

  // 재점검도 삭제와 같은 권한(업로더 본인 또는 관리자)만 — 재점검이 기존 items를
  // 지우고 다시 쓰는 동작이라 firestore.rules의 items 삭제 권한과 맞춰야 한다.
  const handleRecheck = async (check) => {
    if (!window.confirm(`"${check.classLabel}"을(를) 최신 점검 기준으로 다시 훑습니다. 더 이상 걸리지 않는 항목은 삭제되고, 처리완료·메모는 유지됩니다. 계속할까요?`)) return
    setRecheckingIds((prev) => ({ ...prev, [check.id]: true }))
    setError('')
    try {
      let customDict = null
      try {
        customDict = await getDictionary(schoolId)
      } catch (e) {
        console.error('[SetukUpload] 학교 추가 사전 조회 실패(기본 목록만 사용):', e)
      }
      const dictionary = loadDictionary(customDict)
      const count = await recheckCheck(schoolId, check.id, (text, studentName) => checkText(text, dictionary, studentName), userName)
      window.alert(`"${check.classLabel}" 재점검 완료 — 전체 ${count}건`)
    } catch (e) {
      setError(`재점검 실패: ${e.message}`)
    } finally {
      setRecheckingIds((prev) => ({ ...prev, [check.id]: false }))
    }
  }

  const canDelete = (check) => isAdmin || check.uploadedByUid === user?.uid

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" fontWeight={700} mb={0.5}>
          생기부 세특 점검
        </Typography>
        <Button size="small" onClick={() => setDictOpen(true)} sx={{ textTransform: 'none', fontWeight: 700 }}>
          점검 기준 보기
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2}>
        나이스에서 내려받은 학급 세특 엑셀을 업로드하면 오타·띄어쓰기·금지어·유의어를 자동으로 점검합니다.
        나이스와 직접 연동되지 않으며, 결과는 확인·기록용입니다.
      </Typography>

      <SetukDictionaryDialog
        open={dictOpen} onClose={() => setDictOpen(false)}
        schoolId={schoolId} isAdmin={isAdmin} uid={user?.uid} userName={userName}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Accordion defaultExpanded variant="outlined" sx={{ mb: 3, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={700}>
            📥 나이스에서 세특 파일 내려받는 방법
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: '0.85rem', color: 'text.secondary' }}>
            <li>나이스 <b>학교생활기록부</b> 메뉴 → <b>학생부 조회 및 출력 → 학생부 항목별 조회</b>로 이동합니다.</li>
            <li>좌측 메뉴에서 <b>교과학습발달상황 → 세부능력및특기사항(현재학년1학기)(과목별)</b>을 선택합니다.</li>
            <li>학년도·학년·반을 선택하고 <b>조회</b>를 누릅니다.</li>
            <li>상단 저장 아이콘을 누르고 <b>「XLS data」</b>를 선택해 다운로드합니다(「XLS」가 아닙니다).</li>
          </Box>
          <Box
            component="a"
            href="/setuk/download-guide.png"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'block', mt: 2 }}
          >
            <Box
              component="img"
              src="/setuk/download-guide.png"
              alt="나이스 세특 파일 다운로드 방법 안내 스크린샷"
              sx={{ width: '100%', maxWidth: 900, borderRadius: '10px', border: '1px solid', borderColor: 'divider', display: 'block' }}
            />
          </Box>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            이미지를 클릭하면 원본 크기로 볼 수 있습니다.
          </Typography>
        </AccordionDetails>
      </Accordion>

      <Paper
        variant="outlined"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
        sx={{
          p: 5, mb: 3, borderRadius: '12px', textAlign: 'center',
          borderStyle: 'dashed', borderWidth: 2, borderColor: dragOver ? 'primary.main' : 'divider',
          bgcolor: dragOver ? 'action.hover' : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        {processing ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 2 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" fontWeight={600}>{progressMsg}</Typography>
          </Box>
        ) : (
          <>
            <UploadFileIcon color="action" sx={{ fontSize: 48, mb: 1 }} />
            <Typography sx={{ fontWeight: 700, mb: 2 }}>
              나이스 세특 엑셀 파일을 여기로 끌어다 놓거나 클릭해서 선택하세요
            </Typography>
            <Button variant="contained" component="label" sx={{ textTransform: 'none', fontWeight: 700 }}>
              파일 선택
              <input ref={fileInputRef} type="file" hidden accept=".xlsx" onChange={(e) => handleFile(e.target.files?.[0])} />
            </Button>
          </>
        )}
      </Paper>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}>
        <Tab label="학급별 목록" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36 }} />
        <Tab label="과목별 보기" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36 }} />
        <Tab label="과목별 담당 교사" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36 }} />
      </Tabs>

      {tab === 2 ? <SetukTeacherAssignments /> : tab === 1 ? <SetukBySubject /> : loadingList ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : checks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>아직 업로드한 점검이 없습니다.</Typography>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                <TableCell>학급</TableCell>
                <TableCell align="center">전체 항목</TableCell>
                <TableCell align="center">미처리</TableCell>
                <TableCell>업로드</TableCell>
                <TableCell align="center">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {checks.map((c) => (
                <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/setuk/${c.id}`)}>
                  <TableCell sx={{ fontWeight: 600 }}>{c.classLabel}</TableCell>
                  <TableCell align="center">{c.stats?.itemCount ?? '-'}</TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={(c.stats?.itemCount ?? 0) - (c.stats?.resolvedCount ?? 0)}
                      color={(c.stats?.itemCount ?? 0) - (c.stats?.resolvedCount ?? 0) > 0 ? 'warning' : 'success'}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }} color="text.secondary">{c.uploadedByName}</TableCell>
                  <TableCell align="center">
                    {canDelete(c) && (
                      <Tooltip title="최신 점검 기준으로 재점검">
                        <span>
                          <IconButton
                            size="small" disabled={!!recheckingIds[c.id]}
                            onClick={(e) => { e.stopPropagation(); handleRecheck(c) }}
                          >
                            {recheckingIds[c.id] ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    {canDelete(c) && (
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDelete(c) }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Layout>
  )
}
