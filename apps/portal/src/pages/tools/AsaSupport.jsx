import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import Divider from '@mui/material/Divider'
import {
  collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import { parseGradeSummaryFile, computeAggregate, groupBlocksBySubject } from './asaUtils'
import GradeSummaryUploadGuide from './GradeSummaryUploadGuide'

function fmt(n, digits = 1) {
  return n == null ? '-' : Number(n).toFixed(digits)
}

const VS_LABEL = { above: '평균이 더 높음', below: '평균이 더 낮음', equal: '동일' }

export default function AsaSupport() {
  const { schoolId, user, userName } = useAuth()

  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  // groups: 과목+학년 단위로 모든 학급(여러 파일에서 온 것 포함)을 통합한 결과
  // [{ subjectName, grade, classLabels, teacherName, sourceFileNames, studentCount, cutoff, duplicates, aggregate }]
  // cutoff: false = 등록 안 됨, object = 있음 / duplicates: 중복 포함된 학급명(있으면 aggregate는 null)
  const [groups, setGroups] = useState(null)
  const [saving, setSaving] = useState(false)
  const [snackbar, setSnackbar] = useState('')

  const [results, setResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(true)

  useEffect(() => {
    if (!schoolId || !user) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaResults'),
      where('createdBy', '==', user.uid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoadingResults(false)
    }, (err) => {
      setError(`저장된 결과 목록을 불러오지 못했습니다: ${err.message}`)
      setLoadingResults(false)
    })
    return unsub
  }, [schoolId, user])

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    e.target.value = ''
    if (!files.length) return
    setError(null)
    setGroups(null)
    setParsing(true)
    try {
      // 파일별로 파싱하되 하나가 실패해도 나머지는 계속 처리 (형식이 다른 파일 하나 때문에 전체를 막지 않음)
      const parseErrors = []
      const allBlocks = []
      for (const file of files) {
        try {
          const blocks = await parseGradeSummaryFile(file)
          blocks.forEach((blk) => allBlocks.push({ ...blk, sourceFileName: file.name }))
        } catch (err) {
          parseErrors.push(`${file.name}: ${err.message}`)
        }
      }
      if (!allBlocks.length) {
        throw new Error(parseErrors.join('\n') || '인식된 학급 데이터가 없습니다.')
      }

      // 과목+학년 단위로 모든 학급 블록을 하나로 통합 (여러 파일에서 온 블록도 동일하게 병합 —
      // 동일 과목을 나누어 담당하는 선생님들의 파일을 한 번에 선택하면 자동으로 과목 전체 통계가 됨)
      const enriched = []
      for (const g of groupBlocksBySubject(allBlocks)) {
        const ref = doc(db, 'schools', schoolId, 'asaCutoffs', `${g.grade}_${g.subjectName}`)
        const snap = await getDoc(ref)
        const cutoff = snap.exists() ? snap.data() : false
        const aggregate = (cutoff && g.duplicates.length === 0) ? computeAggregate(g.students, cutoff.boundaries) : null
        enriched.push({
          subjectName: g.subjectName,
          grade: g.grade,
          classLabels: g.classLabels,
          teacherName: g.teacherName,
          sourceFileNames: g.sourceFileNames,
          studentCount: g.students.length,
          cutoff,
          duplicates: g.duplicates,
          aggregate,
        })
      }
      setGroups(enriched)
      if (parseErrors.length) setError(parseErrors.join('\n'))
    } catch (err) {
      setError(err.message)
    } finally {
      setParsing(false)
    }
  }

  const validGroups = groups ? groups.filter((g) => g.aggregate) : []

  const handleSaveAll = async () => {
    if (!validGroups.length) return
    setSaving(true)
    try {
      await Promise.all(validGroups.map((g) => {
        const id = encodeURIComponent(`${user.uid}_${g.grade}_${g.subjectName}`)
        const ref = doc(db, 'schools', schoolId, 'asaResults', id)
        return setDoc(ref, {
          subjectName: g.subjectName,
          grade: g.grade,
          classLabels: g.classLabels,
          teacherName: g.teacherName,
          createdBy: user.uid,
          createdByName: userName,
          totalCount: g.aggregate.totalCount,
          withdrawnCount: g.aggregate.withdrawnCount,
          gradeACount: g.aggregate.gradeACount,
          gradeARatio: g.aggregate.gradeARatio,
          subjectAverage: g.aggregate.subjectAverage,
          abCutoff: g.aggregate.abCutoff,
          averageVsAB: g.aggregate.averageVsAB,
          belowLowest: g.grade === 1 ? g.aggregate.belowLowest : null,
          lowestBoundary: g.grade === 1 ? g.aggregate.lowestBoundary : null,
          sourceFileNames: g.sourceFileNames,
          createdAt: serverTimestamp(),
        })
      }))
      setSnackbar(`${validGroups.length}개 과목 결과가 저장됐습니다.`)
      setGroups(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('이 결과를 삭제할까요?')) return
    await deleteDoc(doc(db, 'schools', schoolId, 'asaResults', id))
    setSnackbar('삭제됐습니다.')
  }

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        성취평가제 체크리스트 지원
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={1}>
        나이스 성적 일람표(환산점수) 파일을 업로드하면 성취평가제 체크리스트에 필요한 항목을 자동으로 계산합니다.
      </Typography>
      <Alert severity="warning" sx={{ mb: 3, fontSize: '0.82rem' }}>
        결과는 나이스 확정 성적을 대체하지 않는 참고용 체크리스트 보조 정보입니다. 업로드한 환산점수 원본은 저장되지 않으며, 계산 결과만 저장됩니다.
      </Alert>

      <GradeSummaryUploadGuide />

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
          성적 일람표 업로드
        </Typography>
        <Button variant="outlined" component="label" disabled={parsing}>
          {parsing ? '분석 중...' : '성적 일람표 xlsx 선택 (여러 개 선택 가능)'}
          <input type="file" accept=".xlsx" hidden multiple onChange={handleFileChange} />
        </Button>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
          동일 과목을 나누어 담당하는 선생님들의 파일을 모았다면, 여러 파일을 한 번에 선택하면 학급이 자동으로 통합됩니다.
        </Typography>
        {parsing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">파싱 중...</Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {groups && groups.map((g, i) => (
          <Box key={i} sx={{ mt: 2 }}>
            {g.duplicates.length > 0 ? (
              <Alert severity="error">
                <b>{g.subjectName}</b>({g.grade}학년): 학급이 중복 포함되어 있습니다 ({g.duplicates.join(', ')}). 같은 학급이 서로 다른 파일에 겹쳐 들어간 것 같습니다. 파일을 확인한 뒤 다시 업로드해주세요.
              </Alert>
            ) : g.cutoff === false ? (
              <Alert severity="error">
                <b>{g.subjectName}</b>({g.grade}학년): 분할점수 기준이 아직 등록되지 않았습니다. 학교 관리자에게 등록을 요청해주세요.
              </Alert>
            ) : (
              <>
                <Alert severity="success" sx={{ mb: 1 }}>
                  <b>{g.subjectName}</b>({g.grade}학년) · 담당: {g.teacherName || '-'} · 학급 {g.classLabels.length}개 통합 ({g.classLabels.join(', ')})
                  {g.sourceFileNames.length > 1 && ` · 파일 ${g.sourceFileNames.length}개 통합`}
                  {g.aggregate.withdrawnCount > 0 && ` · 자퇴 등 제외 ${g.aggregate.withdrawnCount}명`}
                </Alert>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>총 평가 대상 인원 (전체 학급 통합)</TableCell>
                      <TableCell align="right">{g.aggregate.totalCount}명</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>성취도 A 대상 인원</TableCell>
                      <TableCell align="right">{g.aggregate.gradeACount}명 ({fmt(g.aggregate.gradeARatio * 100)}%)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>학기말 성적 교과평균</TableCell>
                      <TableCell align="right">{fmt(g.aggregate.subjectAverage, 2)}점</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>교과평균 vs A-B 기준점수 ({g.aggregate.abCutoff}점)</TableCell>
                      <TableCell align="right">{VS_LABEL[g.aggregate.averageVsAB]}</TableCell>
                    </TableRow>
                    {g.grade === 1 && (
                      <TableRow>
                        <TableCell>
                          성취도 E 이하 대상 학생
                          {g.aggregate.lowestBoundary && ` (${g.aggregate.lowestBoundary.label} ${g.aggregate.lowestBoundary.value}점 미만)`}
                        </TableCell>
                        <TableCell align="right">
                          {g.aggregate.belowLowest.length === 0
                            ? '없음'
                            : g.aggregate.belowLowest.map((s) => `${s.classNumber} ${s.name}`).join(', ')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </Box>
        ))}

        {groups && (
          <Button variant="contained" sx={{ mt: 2 }} onClick={handleSaveAll} disabled={saving || !validGroups.length}>
            {saving ? '저장 중...' : `결과 저장 (${validGroups.length}개 과목)`}
          </Button>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
          내가 업로드한 결과 ({results.length})
        </Typography>
        {loadingResults ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : results.length === 0 ? (
          <Typography variant="body2" color="text.secondary">아직 저장한 결과가 없습니다.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>과목</TableCell>
                <TableCell>포함 학급</TableCell>
                <TableCell align="right">인원</TableCell>
                <TableCell align="right">A 비율</TableCell>
                <TableCell align="right">교과평균</TableCell>
                <TableCell>평균 vs A-B</TableCell>
                <TableCell align="right">삭제</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.subjectName} <Chip size="small" label={`${r.grade}학년`} sx={{ ml: 0.5 }} /></TableCell>
                  <TableCell>{(r.classLabels || []).join(', ')}</TableCell>
                  <TableCell align="right">{r.totalCount}명</TableCell>
                  <TableCell align="right">{fmt(r.gradeARatio * 100)}%</TableCell>
                  <TableCell align="right">{fmt(r.subjectAverage, 2)}</TableCell>
                  <TableCell>{VS_LABEL[r.averageVsAB]}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleDelete(r.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Divider sx={{ my: 3 }} />
      <Typography variant="caption" color="text.disabled">
        분할점수 기준은 관리자가 등록합니다. 과목이 목록에 없다면 관리자에게 문의하세요.
      </Typography>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar('')} message={snackbar} />
    </Layout>
  )
}
