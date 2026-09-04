import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useAuth } from '@shared/contexts/AuthContext'
import { useTableSort } from '@shared/hooks/useTableSort'
import { currentSchoolYear } from '@shared/lib/schema'
import { subscribeChecks, saveCheck, deleteCheck, recheckCheck, buildTeacherSubjectIndex, subjectIndexKey, getDictionary } from '@shared/lib/setukCheck'
import { parseNeisSetukFile, checkText, loadDictionary } from './setukUtils'
import { parseNeisSetukRtfFile } from './setukRtfUtils'
import SetukDictionaryDialog from './SetukDictionaryDialog'
import SetukBySubject from './SetukBySubject'
import SetukTeacherAssignments from './SetukTeacherAssignments'
import { useSetukTermFilter, useSetukTermBackfill, filterChecksByTerm, SetukTermFilterControls, fmtDateTime } from './setukShared'
import Layout from '../../components/Layout'

const thSortSx = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

function tsToMillis(ts) {
  if (!ts) return null
  return ts.toMillis ? ts.toMillis() : new Date(ts).getTime()
}

// "학급별 목록" 헤더 클릭 정렬 — useTableSort(평가운영계획 제출 도구 등에서 쓰는 것과
// 같은 훅)의 getters로 원본 필드를 정렬 가능한 값으로 바꿔준다. 학년-학기는 두 값을
// 합쳐 하나의 숫자로 만들어야 "학년 먼저, 같은 학년이면 학기순"으로 정렬된다.
const LIST_SORT_GETTERS = {
  gradeSemester: (c) => (c.grade ?? 0) * 10 + (c.semester ?? 0),
  classLabel: (c) => c.classLabel,
  itemCount: (c) => c.stats?.itemCount ?? 0,
  unresolvedCount: (c) => (c.stats?.itemCount ?? 0) - (c.stats?.resolvedCount ?? 0),
  uploadedByName: (c) => c.uploadedByName,
  sourceFileCreatedAt: (c) => tsToMillis(c.sourceFileCreatedAt),
}

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
  // 한 번에 여러 파일을 올릴 수 있어(일괄 업로드), 파일마다 진행 상태를 따로 추적한다
  // — {name, status: 'pending'|'processing'|'done'|'error', message}. 한 파일이
  // 실패해도 나머지는 계속 처리한다(부분 성공 허용).
  const [fileStatuses, setFileStatuses] = useState([])
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [dictOpen, setDictOpen] = useState(false)
  const [recheckingIds, setRecheckingIds] = useState({})

  useEffect(() => {
    if (!schoolId) return
    const unsub = subscribeChecks(schoolId, (list) => { setChecks(list); setLoadingList(false) }, (err) => { setError(err.message); setLoadingList(false) })
    return unsub
  }, [schoolId])

  // "학급별 목록" 탭에 쓰는 학년도-학기 필터 — 과목별 담당 교사 화면과 같은 패턴.
  const { year, setYear, semester, setSemester } = useSetukTermFilter(checks)
  useSetukTermBackfill(schoolId, checks, isAdmin)
  const filteredChecks = useMemo(() => filterChecksByTerm(checks, year, semester), [checks, year, semester])
  const listSort = useTableSort('gradeSemester')

  // 파일 하나를 파싱→점검→저장까지 처리한다. onProgress로 그 파일의 세부 진행 문구를
  // 알려준다(일괄 업로드 화면에서 파일마다 지금 어느 단계인지 보여주는 데 쓴다).
  const processOneFile = useCallback(async (file, onProgress) => {
    onProgress?.('파일을 읽는 중...')
    // 나이스 "XLS data" 내보내기는 사용자가 입력한 줄바꿈을 저장 시점에 통째로
    // 없애 버린다(실측, 2026-09-03). "XLS"(data 아님)로 받으면 표준 엑셀 형식
    // 그대로 줄바꿈이 보존되어 parseNeisSetukFile로 충분하다. "DOC"로 받으면
    // 확장자와 달리 실제로는 RTF 문서인데, 이쪽도 줄바꿈(\par)과 페이지 나눔
    // (\page)이 명확히 구분돼 정확하게 복원된다 — 파일 확장자로 두 파서 중
    // 하나로 나눠 보낸다.
    const isDoc = /\.doc$/i.test(file.name || '')
    const { classLabel, records, sourceCreatedAt } = isDoc ? await parseNeisSetukRtfFile(file) : await parseNeisSetukFile(file)

    onProgress?.('오타·금지어·띄어쓰기 점검 중...')
    let customDict = null
    try {
      customDict = await getDictionary(schoolId)
    } catch (e) {
      console.error('[SetukUpload] 학교 추가 사전 조회 실패(기본 목록만 사용):', e)
    }
    const dictionary = loadDictionary(customDict)
    const dictionaryVersion = customDict?.version || 0
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

    onProgress?.('담당 교사 자동 매칭 중...')
    let subjectAssignments = {}
    try {
      const idx = await buildTeacherSubjectIndex(schoolId, currentSchoolYear())
      const bySubject = {}
      recordsWithCount.forEach((r) => { bySubject[r.subjectName] = r.grade })
      subjectAssignments = Object.fromEntries(
        Object.entries(bySubject).map(([subjectName, grade]) => {
          // 한 과목을 여러 교사가 나눠 맡는 경우(공동 수업 등) 후보 전원을 자동 배정한다.
          const candidates = idx[subjectIndexKey(grade, subjectName)] || []
          return [subjectName, {
            teacherUids: candidates.map((c) => c.uid),
            teacherNames: candidates.map((c) => c.name),
            source: candidates.length > 0 ? 'auto' : 'manual',
          }]
        }),
      )
    } catch (e) {
      console.error('[SetukUpload] 담당교사 자동 매칭 실패(수동 지정으로 계속):', e)
    }

    onProgress?.('저장 중...')
    const grade = recordsWithCount.find((r) => r.grade)?.grade || null
    const semester = recordsWithCount.find((r) => r.semester)?.semester || null
    const checkId = await saveCheck(
      schoolId, { classLabel, grade, year: currentSchoolYear(), semester, sourceFileCreatedAt: sourceCreatedAt },
      recordsWithCount, items, subjectAssignments, user.uid, userName, dictionaryVersion,
    )
    return { checkId, classLabel }
  }, [schoolId, user, userName])

  // 여러 파일을 골라도(드래그로 여러 개, 또는 파일 선택창에서 다중 선택) 한 번에
  // 순서대로 처리한다 — 한 학년 전체 반을 한 번에 올리는 게 목적이라 하나씩 다시
  // 파일 선택창을 여는 수고를 없앤다. 한 파일이 실패해도 나머지는 계속 처리하고
  // (부분 성공 허용), 파일별 결과를 목록으로 보여준다. 여러 학급이 섞여 있으니
  // 업로드 뒤 특정 상세 화면으로 자동 이동하지는 않고(파일 1개일 때만 예외),
  // 목록 탭에 남아 결과를 한눈에 확인하게 한다.
  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setError('')
    setProcessing(true)
    setFileStatuses(files.map((f) => ({ name: f.name, status: 'pending', message: '' })))

    let lastCheckId = null
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setFileStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'processing' } : s)))
      try {
        const { checkId } = await processOneFile(file, (message) => {
          setFileStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, message } : s)))
        })
        lastCheckId = checkId
        setFileStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'done', message: '' } : s)))
      } catch (e) {
        setFileStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'error', message: e.message } : s)))
      }
    }

    setProcessing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (files.length === 1 && lastCheckId) navigate(`/setuk/${lastCheckId}`)
  }, [processOneFile, navigate])

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
      const count = await recheckCheck(schoolId, check.id, (text, studentName) => checkText(text, dictionary, studentName), userName, customDict?.version || 0)
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
            <li>상단 저장 아이콘을 누르고 <b>「XLS」</b>를 선택해 다운로드합니다(「XLS data」가 아닙니다).</li>
          </Box>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            「XLS data」는 나이스에 줄바꿈으로 입력된 내용이 저장 과정에서 사라져 버려(실측 확인됨)
            정확한 점검이 어려우므로 더 이상 사용하지 마세요. 「XLS」로 받으면 줄바꿈이 그대로
            보존됩니다. 「DOC」(실제로는 워드 문서·RTF)로 받은 파일도 줄바꿈·페이지 구분이 보존되어
            업로드할 수 있습니다.
          </Typography>
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
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        sx={{
          p: 5, mb: 3, borderRadius: '12px', textAlign: 'center',
          borderStyle: 'dashed', borderWidth: 2, borderColor: dragOver ? 'primary.main' : 'divider',
          bgcolor: dragOver ? 'action.hover' : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        {fileStatuses.length > 0 ? (
          <Box sx={{ textAlign: 'left', maxWidth: 460, mx: 'auto' }}>
            {fileStatuses.map((s, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6 }}>
                <Box sx={{ width: 18, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                  {s.status === 'processing' && <CircularProgress size={16} />}
                  {s.status === 'done' && <CheckCircleIcon fontSize="small" color="success" />}
                  {s.status === 'error' && <ErrorOutlineIcon fontSize="small" color="error" />}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }} noWrap title={s.name}>{s.name}</Typography>
                  {s.message && (
                    <Typography sx={{ fontSize: '0.76rem', color: s.status === 'error' ? 'error.main' : 'text.secondary' }}>
                      {s.message}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
            {!processing && (
              <Button size="small" onClick={() => setFileStatuses([])} sx={{ mt: 1, textTransform: 'none', fontWeight: 700 }}>
                닫기
              </Button>
            )}
          </Box>
        ) : (
          <>
            <UploadFileIcon color="action" sx={{ fontSize: 48, mb: 1 }} />
            <Typography sx={{ fontWeight: 700, mb: 2 }}>
              나이스 세특 파일(XLS 권장, DOC도 가능)을 여기로 끌어다 놓거나 클릭해서 선택하세요 — 여러 학급 파일을 한 번에 선택할 수 있습니다.
            </Typography>
            <Button variant="contained" component="label" sx={{ textTransform: 'none', fontWeight: 700 }}>
              파일 선택
              <input ref={fileInputRef} type="file" multiple hidden accept=".xlsx,.doc" onChange={(e) => handleFiles(e.target.files)} />
            </Button>
          </>
        )}
      </Paper>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}>
        <Tab label="학급별 목록" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36 }} />
        <Tab label="과목별 보기" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36 }} />
        <Tab label="과목별 담당 교사" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36 }} />
      </Tabs>

      {tab === 0 && (
        <SetukTermFilterControls year={year} semester={semester} onYearChange={setYear} onSemesterChange={setSemester} />
      )}

      {tab === 2 ? <SetukTeacherAssignments /> : tab === 1 ? <SetukBySubject /> : loadingList ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : checks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>아직 업로드한 점검이 없습니다.</Typography>
      ) : filteredChecks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>선택한 학년도·학기에 해당하는 점검이 없습니다.</Typography>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                <TableCell sx={thSortSx} onClick={() => listSort.toggle('gradeSemester')}>학년-학기{listSort.Ind('gradeSemester')}</TableCell>
                <TableCell sx={thSortSx} onClick={() => listSort.toggle('classLabel')}>학급{listSort.Ind('classLabel')}</TableCell>
                <TableCell align="center" sx={thSortSx} onClick={() => listSort.toggle('itemCount')}>전체 항목{listSort.Ind('itemCount')}</TableCell>
                <TableCell align="center" sx={thSortSx} onClick={() => listSort.toggle('unresolvedCount')}>미처리{listSort.Ind('unresolvedCount')}</TableCell>
                <TableCell sx={thSortSx} onClick={() => listSort.toggle('uploadedByName')}>업로드{listSort.Ind('uploadedByName')}</TableCell>
                <TableCell sx={thSortSx} onClick={() => listSort.toggle('sourceFileCreatedAt')}>원본 파일 생성일{listSort.Ind('sourceFileCreatedAt')}</TableCell>
                <TableCell align="center">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {listSort.sortData(filteredChecks, LIST_SORT_GETTERS).map((c) => (
                <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/setuk/${c.id}`)}>
                  <TableCell sx={{ color: '#64748b', whiteSpace: 'nowrap' }}>{c.grade}학년-{c.semester ?? semester}학기</TableCell>
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
                  <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }} color="text.secondary">
                    {c.sourceFileCreatedAt ? fmtDateTime(c.sourceFileCreatedAt) : '-'}
                  </TableCell>
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
