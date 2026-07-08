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
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import {
  collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import { parseCutoffFile, FIXED_CATEGORIES, getFixedCategory } from './asaUtils'

function boundariesSummary(boundaries) {
  return boundaries.map((b) => `${b.label} ${b.value}`).join(' · ')
}

const BOUNDARY_COLUMNS = ['A/B', 'B/C', 'C/D', 'D/E', 'E/미도달']

function boundaryValue(boundaries, label) {
  const found = (boundaries || []).find((b) => b.label === label)
  return found ? found.value : '-'
}

function groupByGrade(cutoffs) {
  const groups = {}
  cutoffs.forEach((c) => {
    if (!groups[c.grade]) groups[c.grade] = []
    groups[c.grade].push(c)
  })
  return Object.keys(groups)
    .sort((a, b) => Number(a) - Number(b))
    .map((grade) => ({
      grade: Number(grade),
      items: groups[grade].sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko')),
    }))
}

export default function AsaSupportCutoffs() {
  const { schoolId, user } = useAuth()
  const [cutoffs, setCutoffs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [snackbar, setSnackbar] = useState('')

  const [manualSubject, setManualSubject] = useState('')
  const [manualGrade, setManualGrade] = useState(1)
  const [manualCategory, setManualCategory] = useState('')

  useEffect(() => {
    if (!schoolId) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaCutoffs'),
      orderBy('grade', 'asc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setCutoffs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [schoolId])

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const parsed = await parseCutoffFile(file)
      const batch = writeBatch(db)
      parsed.forEach(({ subjectName, grade, boundaries }) => {
        const ref = doc(db, 'schools', schoolId, 'asaCutoffs', `${grade}_${subjectName}`)
        batch.set(ref, {
          subjectName,
          grade,
          source: 'estimated',
          boundaries,
          sourceFileName: file.name,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        })
      })
      await batch.commit()
      setSnackbar(`${parsed.length}개 과목의 추정분할점수가 저장됐습니다.`)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleManualAdd = async () => {
    const category = getFixedCategory(manualCategory)
    if (!manualSubject.trim() || !category) return
    try {
      const ref = doc(db, 'schools', schoolId, 'asaCutoffs', `${manualGrade}_${manualSubject.trim()}`)
      await setDoc(ref, {
        subjectName: manualSubject.trim(),
        grade: Number(manualGrade),
        source: 'fixed',
        fixedCategory: manualCategory,
        boundaries: category.boundaries,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      })
      setSnackbar('고정분할점수 과목이 등록됐습니다.')
      setManualSubject('')
      setManualCategory('')
    } catch (err) {
      setUploadError(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('이 과목의 분할점수 기준을 삭제할까요?')) return
    await deleteDoc(doc(db, 'schools', schoolId, 'asaCutoffs', id))
    setSnackbar('삭제됐습니다.')
  }

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        분할점수 기준 관리
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        성취평가제 체크리스트 지원 도구에서 사용할 과목별 분할점수 기준을 등록합니다. 나이스 추정분할점수 파일을 업로드하거나, 추정분할점수가 없는 과목은 고정분할점수 카테고리를 지정하세요.
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
          ① 추정분할점수 파일 업로드
        </Typography>
        <Button variant="outlined" component="label" disabled={uploading}>
          {uploading ? '처리 중...' : '추정분할점수(학년) xlsx 선택'}
          <input type="file" accept=".xlsx" hidden onChange={handleUpload} />
        </Button>
        {uploading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">파싱 중...</Typography>
          </Box>
        )}
        {uploadError && <Alert severity="error" sx={{ mt: 2 }}>{uploadError}</Alert>}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
          ② 고정분할점수 과목 수동 등록
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          추정분할점수가 제공되지 않는 과목은 아래 4가지 카테고리 중 하나를 직접 지정하세요.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField
            label="과목명 (예: 스포츠과학(2))"
            size="small"
            value={manualSubject}
            onChange={(e) => setManualSubject(e.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            label="학년" select size="small" value={manualGrade}
            onChange={(e) => setManualGrade(e.target.value)}
            sx={{ minWidth: 100 }}
          >
            <MenuItem value={1}>1학년</MenuItem>
            <MenuItem value={2}>2학년</MenuItem>
          </TextField>
          <TextField
            label="고정분할점수 카테고리" select size="small" value={manualCategory}
            onChange={(e) => setManualCategory(e.target.value)}
            sx={{ minWidth: 320 }}
          >
            {FIXED_CATEGORIES.map((c) => (
              <MenuItem key={c.key} value={c.key}>{c.label} ({boundariesSummary(c.boundaries)})</MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            onClick={handleManualAdd}
            disabled={!manualSubject.trim() || !manualCategory}
            sx={{ height: 40 }}
          >
            등록
          </Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
          등록된 과목 ({cutoffs.length})
        </Typography>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : cutoffs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">등록된 과목이 없습니다.</Typography>
        ) : (
          groupByGrade(cutoffs).map(({ grade, items }) => (
            <Box key={grade} sx={{ mb: 3 }}>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1}>
                {grade}학년 ({items.length}과목)
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>과목명</TableCell>
                    <TableCell>출처</TableCell>
                    {BOUNDARY_COLUMNS.map((label) => (
                      <TableCell key={label} align="center">{label}</TableCell>
                    ))}
                    <TableCell align="right">삭제</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.subjectName}</TableCell>
                      <TableCell>
                        {c.source === 'estimated' ? (
                          <Chip size="small" label="추정분할점수" color="primary" variant="outlined" />
                        ) : (
                          <Chip size="small" label={getFixedCategory(c.fixedCategory)?.label || '고정분할점수'} variant="outlined" />
                        )}
                      </TableCell>
                      {BOUNDARY_COLUMNS.map((label) => (
                        <TableCell key={label} align="center">{boundaryValue(c.boundaries, label)}</TableCell>
                      ))}
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => handleDelete(c.id)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ))
        )}
      </Paper>

      <Divider sx={{ my: 3 }} />
      <Typography variant="caption" color="text.disabled">
        3학년은 아직 대상이 아닙니다. (2027년 추가 예정)
      </Typography>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar('')} message={snackbar} />
    </Layout>
  )
}
