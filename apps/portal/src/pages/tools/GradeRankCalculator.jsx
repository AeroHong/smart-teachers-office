import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Chip from '@mui/material/Chip'
import Layout from '../../components/Layout'
import { parseGradeSummaryFile, groupBlocksBySubject, computeGradeCutoffs, scaleForSchoolGrade } from './asaUtils'
import GradeSummaryUploadGuide from './GradeSummaryUploadGuide'

function fmt(n, digits = 2) {
  return n == null ? '-' : Number(n).toFixed(digits)
}

export default function GradeRankCalculator() {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  // groups: 과목+학년 단위로 통합한 결과
  // [{ subjectName, grade, classLabels, teacherName, sourceFileNames, duplicates, scale, totalCount, cutoffs }]
  const [groups, setGroups] = useState(null)

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    e.target.value = ''
    if (!files.length) return
    setError(null)
    setGroups(null)
    setParsing(true)
    try {
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

      const enriched = groupBlocksBySubject(allBlocks).map((g) => {
        if (g.duplicates.length > 0) {
          return { ...g, scale: null, totalCount: 0, cutoffs: null }
        }
        const scale = scaleForSchoolGrade(g.grade)
        const cutoffs = computeGradeCutoffs(g.students, scale)
        const totalCount = cutoffs.reduce((sum, c) => sum + c.count, 0)
        return { ...g, scale, totalCount, cutoffs }
      })
      setGroups(enriched)
      if (parseErrors.length) setError(parseErrors.join('\n'))
    } catch (err) {
      setError(err.message)
    } finally {
      setParsing(false)
    }
  }

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        내신등급 계산기
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={1}>
        나이스 성적 일람표(환산점수)를 업로드하면 상대평가 내신등급의 등급별 경계 점수를 계산합니다. 1·2학년은 5등급제, 3학년은 9등급제가 자동으로 적용됩니다.
      </Typography>
      <Alert severity="warning" sx={{ mb: 3, fontSize: '0.82rem' }}>
        결과는 나이스 확정 성적을 대체하지 않는 참고용 계산 결과입니다. 등급 인원은 재적인원 × 누적비율을 반올림해 정하며, 경계 점수에 동점자가 있으면 상위(더 좋은) 등급에 포함되도록 처리합니다. 업로드한 파일과 학생 개인정보는 저장되지 않습니다.
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
          동일 과목을 나누어 담당하는 선생님들의 파일을 모았다면, 여러 파일을 한 번에 선택하면 학급이 자동으로 통합되어 과목 전체 인원 기준으로 계산됩니다.
        </Typography>
        {parsing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">파싱 중...</Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2, whiteSpace: 'pre-line' }}>{error}</Alert>}

        {groups && groups.map((g, i) => (
          <Box key={i} sx={{ mt: 2 }}>
            {g.duplicates.length > 0 ? (
              <Alert severity="error">
                <b>{g.subjectName}</b>({g.grade}학년): 학급이 중복 포함되어 있습니다 ({g.duplicates.join(', ')}). 같은 학급이 서로 다른 파일에 겹쳐 들어간 것 같습니다. 파일을 확인한 뒤 다시 업로드해주세요.
              </Alert>
            ) : g.totalCount === 0 ? (
              <Alert severity="warning">
                <b>{g.subjectName}</b>({g.grade}학년): 유효한 성적을 가진 학생이 없어 등급을 계산할 수 없습니다.
              </Alert>
            ) : (
              <>
                <Alert severity="success" sx={{ mb: 1 }}>
                  <b>{g.subjectName}</b>({g.grade}학년) · {g.scale}등급제 · 담당: {g.teacherName || '-'} · 학급 {g.classLabels.length}개 통합 ({g.classLabels.join(', ')}) · 평가 대상 {g.totalCount}명
                  {g.sourceFileNames.length > 1 && ` · 파일 ${g.sourceFileNames.length}개 통합`}
                </Alert>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>등급</TableCell>
                      <TableCell align="right">인원</TableCell>
                      <TableCell align="right">비율</TableCell>
                      <TableCell align="right">상위 경계(최고점)</TableCell>
                      <TableCell align="right">하위 경계(최저점)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {g.cutoffs.map((c) => (
                      <TableRow key={c.grade}>
                        <TableCell><Chip size="small" label={`${c.grade}등급`} /></TableCell>
                        <TableCell align="right">{c.count}명</TableCell>
                        <TableCell align="right">{c.count > 0 ? `${fmt(c.ratio * 100, 1)}%` : '-'}</TableCell>
                        <TableCell align="right">{fmt(c.topScore)}</TableCell>
                        <TableCell align="right">{fmt(c.bottomScore)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Box>
        ))}
      </Paper>
    </Layout>
  )
}
