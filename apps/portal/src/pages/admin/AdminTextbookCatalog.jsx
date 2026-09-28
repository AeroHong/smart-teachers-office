import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Checkbox from '@mui/material/Checkbox'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { currentSchoolYear } from '@shared/lib/schema'
import { useAuth } from '@shared/contexts/AuthContext'
import { loadAdoptions, bulkCreateAdoptions, newCandidateId } from '@shared/lib/textbookAdoption'
import { parseTextbookCatalogXlsx, saveTextbookCatalog, subscribeTextbookCatalog } from '@shared/lib/textbookCatalog'

function fmtDate(ts) {
  if (!ts) return '-'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function AdminTextbookCatalog() {
  const navigate = useNavigate()
  const { user, userName, schoolId } = useAuth()
  const fileRef = useRef(null)

  const [catalog, setCatalog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState(null) // {subjects, subjectCount, candidateCount, sheetReports, fileName}
  const [saving, setSaving] = useState(false)

  const [existingKeys, setExistingKeys] = useState(new Set()) // `${subjectName}|${cycleYear}`
  const [selected, setSelected] = useState(new Set()) // 선택한 과목명
  const [activeTab, setActiveTab] = useState(0)
  const [search, setSearch] = useState('')
  const [cycleYear, setCycleYear] = useState(currentSchoolYear())
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState(null)

  useEffect(() => {
    if (!schoolId) return
    const unsub = subscribeTextbookCatalog(schoolId, (data) => {
      setCatalog(data)
      setLoading(false)
      setActiveTab(0)
    }, (e) => { setError(`목록 조회 실패: ${e.message}`); setLoading(false) })
    return unsub
  }, [schoolId])

  const refreshExistingKeys = () => {
    loadAdoptions(schoolId)
      .then((list) => setExistingKeys(new Set(list.map((a) => `${a.subjectName}|${a.cycleYear}`))))
      .catch((e) => console.error('[AdminTextbookCatalog] 기존 선정 건 조회 실패:', e))
  }

  // 이미 같은 학년도에 등록된 선정 건은 과목 목록에서 "이미 등록됨"으로 표시해 중복 생성을 막는다.
  useEffect(() => {
    if (!schoolId) return
    refreshExistingKeys()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId])

  // 시트(신간본/기간본/고시외 등)를 탭으로 훑어보며 체크박스로 여러 과목을 한 번에 고를 수
  // 있게 한다 — 과목이 수백 개라 검색해서 하나씩 추가하는 방식은 실무에서 쓰기 어렵다.
  const usedSheets = useMemo(() => (catalog?.sheetReports || []).filter((r) => r.used), [catalog])
  const activeSheet = usedSheets[activeTab] || null

  const filteredNames = useMemo(() => {
    const names = activeSheet?.subjectNames || []
    const q = search.trim()
    return q ? names.filter((n) => n.includes(q)) : names
  }, [activeSheet, search])

  const toggleOne = (name) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  // "전체 선택"은 현재 검색으로 좁혀진 목록 중, 이미 등록된 과목을 뺀 나머지만 대상으로 한다.
  const selectableFiltered = filteredNames.filter((n) => !existingKeys.has(`${n}|${cycleYear}`))
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((n) => selected.has(n))
  const someFilteredSelected = selectableFiltered.some((n) => selected.has(n))

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) selectableFiltered.forEach((n) => next.delete(n))
      else selectableFiltered.forEach((n) => next.add(n))
      return next
    })
  }

  const handlePickFile = () => fileRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setParsing(true)
    setCreateResult(null)
    try {
      const result = await parseTextbookCatalogXlsx(file)
      if (!result.subjectCount) {
        setError('과목 정보를 찾지 못했습니다. 학교급·출판사·가격 열이 있는 인정도서 목록 엑셀인지 확인해주세요.')
        return
      }
      setPreview({ ...result, fileName: file.name })
    } catch (err) {
      console.error('[AdminTextbookCatalog] 파싱 실패:', err)
      setError(`파일을 읽지 못했습니다: ${err.message}`)
    } finally {
      setParsing(false)
    }
  }

  const handleSaveCatalog = async () => {
    if (!preview) return
    setSaving(true)
    setError('')
    try {
      await saveTextbookCatalog(schoolId, {
        subjects: preview.subjects,
        subjectCount: preview.subjectCount,
        candidateCount: preview.candidateCount,
        sheetReports: preview.sheetReports,
        sourceFileName: preview.fileName,
      }, user.uid, userName)
      setPreview(null)
      setSelected(new Set())
    } catch (err) {
      console.error('[AdminTextbookCatalog] 저장 실패:', err)
      setError(`저장 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const selectedNames = [...selected]
  const duplicateSelected = selectedNames.filter((name) => existingKeys.has(`${name}|${cycleYear}`))
  const creatableCount = selectedNames.length - duplicateSelected.length
  const selectedCandidateCount = selectedNames.reduce((sum, name) => sum + (catalog?.subjects[name]?.length || 0), 0)

  const handleCreate = async () => {
    const toCreate = selectedNames.filter((name) => !existingKeys.has(`${name}|${cycleYear}`))
    if (!toCreate.length) return
    setCreating(true)
    setError('')
    try {
      const rows = toCreate.map((name) => ({
        subjectName: name,
        candidates: catalog.subjects[name].map((c) => ({ id: newCandidateId(), publisher: c.publisher, author: c.author, price: c.price })),
      }))
      const res = await bulkCreateAdoptions(schoolId, rows, { cycleYear: Number(cycleYear) }, user.uid)
      setCreateResult(res)
      setSelected(new Set())
      refreshExistingKeys()
    } catch (err) {
      console.error('[AdminTextbookCatalog] 선정 건 생성 실패:', err)
      setError(`생성 실패: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={0.5}>검·인정도서 선정 — 공식 인정도서 목록</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        시도교육청이 배포한 인정도서 목록 엑셀을 가져오면, 시트별로 과목을 훑어보며 체크박스로
        여러 과목을 한 번에 골라 후보(출판사·가격)가 채워진 선정 건을 만들 수 있습니다.
        평가위원·과목 대표교사는 만든 뒤 "선정 건 관리"에서 지정합니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>목록 가져오기</Typography>

        {loading ? (
          <CircularProgress size={20} />
        ) : catalog ? (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
            <Chip size="small" label={`과목 ${catalog.subjectCount}개`} />
            <Chip size="small" label={`후보 ${catalog.candidateCount}개`} />
            <Chip size="small" label={catalog.sourceFileName} />
            <Chip size="small" label={`가져온 날짜 ${fmtDate(catalog.importedAt)}`} />
            <Chip size="small" label={`가져온 사람 ${catalog.importedByName || '-'}`} />
          </Box>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>아직 가져온 목록이 없습니다. 엑셀 파일을 업로드해주세요.</Alert>
        )}

        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={handleFileChange} />
        <Button
          variant="outlined" startIcon={parsing ? <CircularProgress size={16} /> : <UploadFileIcon />}
          disabled={parsing} onClick={handlePickFile}
        >
          {parsing ? '분석 중...' : '엑셀 업로드'}
        </Button>

        {preview && (
          <Box sx={{ mt: 2.5 }}>
            <Divider sx={{ mb: 2 }} />
            {catalog && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                기존 목록(과목 {catalog.subjectCount}개)을 덮어씁니다. 이미 만든 선정 건에는 영향이 없습니다.
              </Alert>
            )}
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>{preview.fileName}</strong>에서 과목 <strong>{preview.subjectCount}개</strong>,
              후보 <strong>{preview.candidateCount}개</strong>를 찾았습니다.
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                  <TableCell>시트</TableCell>
                  <TableCell align="center">인식 여부</TableCell>
                  <TableCell align="center">행 수</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.sheetReports.map((r) => (
                  <TableRow key={r.sheetName}>
                    <TableCell>{r.sheetName}</TableCell>
                    <TableCell align="center">
                      {r.used
                        ? <Chip size="small" label="인식됨" sx={{ bgcolor: '#dcfce7', color: '#166534' }} />
                        : <Chip size="small" label="건너뜀" sx={{ bgcolor: '#f1f5f9', color: '#64748b' }} />}
                    </TableCell>
                    <TableCell align="center">{r.rows || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={() => setPreview(null)} disabled={saving}>취소</Button>
              <Button variant="contained" onClick={handleSaveCatalog} disabled={saving}>
                {saving ? '저장 중...' : '이 목록으로 저장'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>과목 선택 → 선정 건 만들기</Typography>

        {!catalog ? (
          <Typography variant="body2" color="text.secondary">먼저 위에서 목록을 가져와주세요.</Typography>
        ) : (
          <>
            <Tabs
              value={activeTab} onChange={(_, v) => setActiveTab(v)}
              variant="scrollable" scrollButtons="auto"
              sx={{ mb: 1.5, minHeight: 36, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 36, textTransform: 'none' } }}
            >
              {usedSheets.map((s) => (
                <Tab key={s.sheetName} label={`${s.sheetName} (${s.subjectNames.length})`} />
              ))}
            </Tabs>

            <TextField
              size="small" placeholder="과목명 검색" value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ mb: 1.5, width: 260 }}
            />

            <Box sx={{ maxHeight: 420, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 1, mb: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        indeterminate={someFilteredSelected && !allFilteredSelected}
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        disabled={!selectableFiltered.length}
                      />
                    </TableCell>
                    <TableCell>과목명</TableCell>
                    <TableCell align="center">후보 수</TableCell>
                    <TableCell align="center">상태</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredNames.length === 0 ? (
                    <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>검색 결과가 없습니다.</TableCell></TableRow>
                  ) : filteredNames.map((name) => {
                    const alreadyExists = existingKeys.has(`${name}|${cycleYear}`)
                    return (
                      <TableRow key={name} hover selected={selected.has(name)}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small" checked={selected.has(name)} disabled={alreadyExists}
                            onChange={() => toggleOne(name)}
                          />
                        </TableCell>
                        <TableCell sx={{ opacity: alreadyExists ? 0.5 : 1 }}>{name}</TableCell>
                        <TableCell align="center" sx={{ opacity: alreadyExists ? 0.5 : 1 }}>{catalog.subjects[name]?.length || 0}</TableCell>
                        <TableCell align="center">
                          {alreadyExists && <Chip size="small" label="이미 등록됨" sx={{ bgcolor: '#fef2f2', color: '#991b1b' }} />}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
              <TextField
                type="number" label="선정 연도(학년도)" size="small" sx={{ width: 160 }}
                value={cycleYear} onChange={(e) => setCycleYear(e.target.value)}
              />
              <Typography variant="body2" color="text.secondary">
                선택 {selectedNames.length}개 · 후보 합계 {selectedCandidateCount}개
                {duplicateSelected.length > 0 && ` (이미 등록됨 ${duplicateSelected.length}개 제외)`}
              </Typography>
              {selectedNames.length > 0 && (
                <Button size="small" onClick={() => setSelected(new Set())}>선택 해제</Button>
              )}
            </Box>

            {selectedNames.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
                {selectedNames.map((name) => (
                  <Chip
                    key={name} size="small" label={name}
                    onDelete={() => toggleOne(name)}
                    color={existingKeys.has(`${name}|${cycleYear}`) ? 'warning' : 'default'}
                  />
                ))}
              </Box>
            )}

            <Button variant="contained" disabled={!creatableCount || creating} onClick={handleCreate}>
              {creating ? '만드는 중...' : `선택한 ${creatableCount}개 과목으로 선정 건 만들기`}
            </Button>
          </>
        )}

        {createResult && (
          <Alert
            severity={createResult.failed.length ? 'warning' : 'success'} sx={{ mt: 2 }}
            action={<Button size="small" onClick={() => navigate('/admin/textbook-subjects')}>선정 건 관리로 이동</Button>}
          >
            {createResult.created}개 생성 완료
            {createResult.failed.length > 0 && `, ${createResult.failed.length}개 실패: ${createResult.failed.map((f) => f.subjectName).join(', ')}`}
          </Alert>
        )}
      </Paper>
    </Box>
  )
}
