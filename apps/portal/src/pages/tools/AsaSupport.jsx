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
import { parseGradeSummaryFile, computeAggregate } from './asaUtils'

function fmt(n, digits = 1) {
  return n == null ? '-' : Number(n).toFixed(digits)
}

const VS_LABEL = { above: '평균이 더 높음', below: '평균이 더 낮음', equal: '동일' }

export default function AsaSupport() {
  const { schoolId, user, userName } = useAuth()

  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState('')
  // groups: 과목+학년 단위로 모든 학급을 통합한 결과
  // [{ subjectName, grade, classLabels, teacherName, studentCount, cutoff, aggregate }]
  // cutoff: false = 등록 안 됨, object = 있음
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
    }, () => setLoadingResults(false))
    return unsub
  }, [schoolId, user])

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setGroups(null)
    setParsing(true)
    try {
      const parsedBlocks = await parseGradeSummaryFile(file)
      setFileName(file.name)

      // 과목+학년 단위로 모든 학급 블록을 하나로 통합 (총원·평균 등은 학급별이 아니라 과목 전체 기준)
      const byKey = new Map()
      parsedBlocks.forEach((blk) => {
        const key = `${blk.grade}_${blk.subjectName}`
        if (!byKey.has(key)) {
          byKey.set(key, {
            subjectName: blk.subjectName,
            grade: blk.grade,
            classLabels: [],
            teacherNames: new Set(),
            students: [],
          })
        }
        const g = byKey.get(key)
        g.classLabels.push(blk.classLabel)
        if (blk.teacherName) g.teacherNames.add(blk.teacherName)
        g.students.push(...blk.students)
      })

      const enriched = []
      for (const g of byKey.values()) {
        const ref = doc(db, 'schools', schoolId, 'asaCutoffs', `${g.grade}_${g.subjectName}`)
        const snap = await getDoc(ref)
        const cutoff = snap.exists() ? snap.data() : false
        const aggregate = cutoff ? computeAggregate(g.students, cutoff.boundaries) : null
        enriched.push({
          subjectName: g.subjectName,
          grade: g.grade,
          classLabels: g.classLabels,
          teacherName: [...g.teacherNames].join(', '),
          studentCount: g.students.length,
          cutoff,
          aggregate,
        })
      }
      setGroups(enriched)
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
          sourceFileName: fileName,
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

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
          성적 일람표 업로드
        </Typography>
        <Button variant="outlined" component="label" disabled={parsing}>
          {parsing ? '분석 중...' : '성적 일람표 xlsx 선택'}
          <input type="file" accept=".xlsx" hidden onChange={handleFileChange} />
        </Button>
        {parsing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">파싱 중...</Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {groups && groups.map((g, i) => (
          <Box key={i} sx={{ mt: 2 }}>
            {g.cutoff === false ? (
              <Alert severity="error">
                <b>{g.subjectName}</b>({g.grade}학년): 분할점수 기준이 아직 등록되지 않았습니다. 학교 관리자에게 등록을 요청해주세요.
              </Alert>
            ) : (
              <>
                <Alert severity="success" sx={{ mb: 1 }}>
                  <b>{g.subjectName}</b>({g.grade}학년) · 담당: {g.teacherName || '-'} · 학급 {g.classLabels.length}개 통합 ({g.classLabels.join(', ')})
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
