import { useState, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import DownloadIcon from '@mui/icons-material/Download'
import { currentSchoolYear } from '@shared/lib/schema'
import { bulkCreateAdoptions, newCandidateId } from '@shared/lib/textbookAdoption'

// "출판사(저자)" 또는 "출판사"만 있는 한 칸을 후보 하나로 분해한다.
function parseCandidateToken(raw) {
  const t = String(raw || '').trim()
  const m = t.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  if (m) return { id: newCandidateId(), publisher: m[1].trim(), author: m[2].trim() }
  return { id: newCandidateId(), publisher: t, author: '' }
}

// 붙여넣기 텍스트: 한 줄에 한 과목. "과목명, 출판사(저자), 출판사(저자), ..." (탭으로 붙여넣었으면 탭 기준).
// 위원·교과부장까지 한 줄에 넣기엔 이름 매칭이 애매해져서 후보만 받는다 — 위원 지정이
// 필요하면 엑셀 업로드(헤더로 열 구분)를 쓰거나 등록 후 개별 수정한다.
function parsePasteText(text) {
  return text.split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim())
    .map((line) => {
      const sep = line.includes('\t') ? '\t' : ','
      const [subjectName, ...rest] = line.split(sep).map((s) => s.trim())
      return {
        subjectName: subjectName || '',
        candidates: rest.filter(Boolean).map(parseCandidateToken),
        committeeNames: [],
        headName: '',
      }
    })
}

// 엑셀: 1행을 헤더로 읽어 열 역할을 이름으로 찾는다(순서·개수에 안 얽매이게).
// "과목"이 들어간 열=과목명, "위원"이 들어간 열(여러 개 가능)=평가위원, "교과부장"/"교과주임"이
// 들어간 열=교과주임, 그 외 나머지 열은 전부 후보 교과서 칸으로 본다.
async function parseExcelFile(file) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) return []

  const header = rows[0].map((h) => String(h || '').trim())
  const subjectCol = Math.max(header.findIndex((h) => h.includes('과목')), 0)
  // "교과부장"은 여기서 감지하지 않는다 — 그건 교과군 전체를 관장하는 별도 registry(관리자
  // 홈 > 교과부장 지정)로만 등록해야 규칙(rules)이 인식한다. 이 열은 선정 건 단위 운영
  // 담당자(과목 대표교사=subjectHeadUid)만 가리킨다.
  const headCol = header.findIndex((h) => h.includes('대표교사') || h.includes('교과주임'))
  const committeeCols = header.map((h, i) => (h.includes('위원') ? i : -1)).filter((i) => i >= 0)
  const candidateCols = header
    .map((_, i) => i)
    .filter((i) => i !== subjectCol && i !== headCol && !committeeCols.includes(i))

  return rows.slice(1)
    .filter((r) => String(r[subjectCol] || '').trim())
    .map((r) => ({
      subjectName: String(r[subjectCol] || '').trim(),
      candidates: candidateCols.map((i) => String(r[i] || '').trim()).filter(Boolean).map(parseCandidateToken),
      committeeNames: committeeCols
        .flatMap((i) => String(r[i] || '').split(/[,/]/))
        .map((s) => s.trim())
        .filter(Boolean),
      headName: headCol >= 0 ? String(r[headCol] || '').trim() : '',
    }))
}

async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([
    ['과목명', '후보1', '후보2', '후보3', '평가위원1', '평가위원2', '평가위원3', '과목대표교사'],
    ['영어Ⅱ', '동아출판(박용예)', '천재교과서(강상구)', '미래엔(김성연)', '김민준', '이서연', '박지훈', '김민준'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '선정건목록')
  XLSX.writeFile(wb, '검인정도서_선정건_일괄등록_양식.xlsx')
}

// 위원·교과부장 이름을 실제 교직원 계정과 매칭한다. 동명이인은 다루지 않고(마지막 매칭
// 우선) 이름이 안 맞으면 그 자리만 비워두고 warning으로 남긴다 — 후보 등록 자체는
// 막지 않고, 위원 지정만 나중에 개별 수정으로 채우면 된다.
function resolveRows(rows, staff) {
  const byName = new Map()
  staff.forEach((s) => { if (s.name) byName.set(s.name.trim(), s) })

  return rows.map((r) => {
    const committee = []
    const unresolvedCommittee = []
    r.committeeNames.forEach((n) => {
      const s = byName.get(n)
      if (s) committee.push(s)
      else unresolvedCommittee.push(n)
    })
    let head = null
    let unresolvedHead = ''
    if (r.headName) {
      const s = byName.get(r.headName)
      if (s) head = s
      else unresolvedHead = r.headName
    }
    return {
      ...r,
      committee,
      head,
      valid: !!r.subjectName.trim() && r.candidates.length > 0,
      warning: [
        unresolvedCommittee.length ? `위원 매칭 실패: ${unresolvedCommittee.join(', ')}` : '',
        unresolvedHead ? `과목 대표교사 매칭 실패: ${unresolvedHead}` : '',
      ].filter(Boolean).join(' · '),
    }
  })
}

export default function AdminTextbookBulkImport({ schoolId, uid, staff, onClose, onDone }) {
  const fileRef = useRef(null)
  const [mode, setMode] = useState('excel')
  const [file, setFile] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [cycleYear, setCycleYear] = useState(currentSchoolYear())
  const [step, setStep] = useState('input') // input | preview | saving | done
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  const handleAnalyze = async () => {
    setErr('')
    try {
      const parsed = mode === 'excel'
        ? (file ? await parseExcelFile(file) : [])
        : parsePasteText(pasteText)
      if (!parsed.length) {
        setErr('분석할 내용이 없습니다.')
        return
      }
      setRows(resolveRows(parsed, staff))
      setStep('preview')
    } catch (e) {
      setErr(`분석 실패: ${e.message}`)
    }
  }

  const validRows = rows.filter((r) => r.valid)

  const handleSave = async () => {
    setStep('saving')
    try {
      const res = await bulkCreateAdoptions(schoolId, validRows.map((r) => ({
        subjectName: r.subjectName,
        candidates: r.candidates,
        committeeUids: r.committee.map((s) => s.uid),
        subjectHeadUid: r.head?.uid || '',
      })), { cycleYear: Number(cycleYear) }, uid)
      setResult(res)
      setStep('done')
    } catch (e) {
      setErr(`저장 실패: ${e.message}`)
      setStep('preview')
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>선정 건 일괄 등록</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

        {step === 'input' && (
          <>
            <ToggleButtonGroup
              size="small" exclusive value={mode}
              onChange={(_, v) => v && setMode(v)}
              sx={{ mb: 2 }}
            >
              <ToggleButton value="excel" sx={{ textTransform: 'none' }}>엑셀 업로드</ToggleButton>
              <ToggleButton value="paste" sx={{ textTransform: 'none' }}>표에 붙여넣기</ToggleButton>
            </ToggleButtonGroup>

            {mode === 'excel' ? (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  1행은 제목 줄입니다. 열 이름으로 역할을 찾으므로 순서는 상관없습니다 — "과목"이
                  들어간 열은 과목명, "위원"이 들어간 열(여러 개 가능)은 평가위원, "대표교사"가
                  들어간 열은 그 선정 건의 과목 대표교사(채점 마감·집계 담당), 나머지 열은 모두
                  후보 교과서로 처리합니다(칸마다 "출판사(저자)" 형식, 저자는 생략 가능).
                  위원·대표교사 칸에는 등록된 교직원 이름을 정확히 입력해야 매칭됩니다. 교과군
                  전체를 관장하는 교과부장은 여기서 지정할 수 없고, 관리자 홈 &gt; 교과부장
                  지정에서 별도로 지정합니다.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                  <Button variant="outlined" onClick={() => fileRef.current?.click()}>파일 선택</Button>
                  <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                    onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <Typography variant="body2" color={file ? 'text.primary' : 'text.secondary'}>
                    {file ? file.name : 'xlsx 파일을 선택하세요'}
                  </Typography>
                </Box>
                <Button size="small" startIcon={<DownloadIcon />} onClick={downloadTemplate}>샘플 양식 다운로드</Button>
              </Box>
            ) : (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  한 줄에 한 과목씩 입력합니다: <code>과목명, 출판사(저자), 출판사(저자), ...</code> (엑셀에서 여러 칸을 복사해 붙여넣어도 됩니다)
                  평가위원·과목 대표교사는 여기서는 지정할 수 없습니다 — 등록 후 개별 수정하거나 엑셀 업로드를 이용하세요.
                </Typography>
                <TextField
                  multiline minRows={8} fullWidth
                  placeholder={'영어Ⅱ, 동아출판(박용예), 천재교과서(강상구)\n물리학, 미래엔(권경필), 비상교육(손정우)'}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
              </Box>
            )}

            <TextField
              type="number" label="선정 연도(학년도)" size="small" value={cycleYear}
              onChange={(e) => setCycleYear(e.target.value)}
            />
          </>
        )}

        {step === 'preview' && (
          <>
            <Typography sx={{ mb: 1 }}>
              총 {rows.length}개 중 <strong>{validRows.length}개</strong> 등록 가능
              {rows.length - validRows.length > 0 && `, ${rows.length - validRows.length}개는 과목명 또는 후보가 없어 제외됩니다`}
            </Typography>
            <Box sx={{ maxHeight: 360, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 1, mb: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>과목명</TableCell>
                    <TableCell>후보</TableCell>
                    <TableCell>위원 / 과목 대표교사</TableCell>
                    <TableCell align="center">상태</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} sx={{ opacity: r.valid ? 1 : 0.5 }}>
                      <TableCell>{r.subjectName || '(없음)'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {r.candidates.map((c) => (
                            <Chip key={c.id} size="small" label={c.author ? `${c.publisher}(${c.author})` : c.publisher} />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: r.warning ? 0.5 : 0 }}>
                          {r.committee.map((s) => <Chip key={s.uid} size="small" label={s.name} />)}
                          {r.head && <Chip size="small" label={`${r.head.name} (과목 대표교사)`} sx={{ bgcolor: '#f0fdfa', color: '#0f766e' }} />}
                        </Box>
                        {r.warning && (
                          <Typography variant="caption" color="warning.main">{r.warning}</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {r.valid
                          ? <Chip size="small" label="정상" sx={{ bgcolor: '#dcfce7', color: '#166534' }} />
                          : <Chip size="small" label="제외" sx={{ bgcolor: '#fef2f2', color: '#991b1b' }} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}

        {step === 'saving' && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>등록 중...</Typography>
          </Box>
        )}

        {step === 'done' && result && (
          <Alert severity={result.failed.length ? 'warning' : 'success'}>
            {result.created}개 등록 완료
            {result.failed.length > 0 && (
              <>
                , {result.failed.length}개 실패: {result.failed.map((f) => f.subjectName).join(', ')}
              </>
            )}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {step === 'input' && (
          <>
            <Button onClick={onClose}>취소</Button>
            <Button variant="contained" onClick={handleAnalyze}>분석하기</Button>
          </>
        )}
        {step === 'preview' && (
          <>
            <Button onClick={() => setStep('input')}>다시 입력</Button>
            <Button variant="contained" disabled={!validRows.length} onClick={handleSave}>
              {validRows.length}개 등록
            </Button>
          </>
        )}
        {step === 'saving' && <Button disabled>닫기</Button>}
        {step === 'done' && <Button variant="contained" onClick={onDone}>완료</Button>}
      </DialogActions>
    </Dialog>
  )
}
