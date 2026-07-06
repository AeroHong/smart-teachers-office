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
import Divider from '@mui/material/Divider'
import Layout from '../../components/Layout'
import { callToolFunction } from '../../lib/functionsApi'

export default function QrNoticeGenerator() {
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfPreview, setPdfPreview] = useState(null)
  const [pdfParsing, setPdfParsing] = useState(false)
  const [pdfError, setPdfError] = useState(null)

  const [templateFile, setTemplateFile] = useState(null)
  const [templateInfo, setTemplateInfo] = useState(null)
  const [templateParsing, setTemplateParsing] = useState(false)
  const [templateError, setTemplateError] = useState(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  const handlePdfChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setPdfFile(file)
    setPdfPreview(null)
    setPdfError(null)
    setGenerateError(null)
    setPdfParsing(true)
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      const res = await callToolFunction('qr_notice_parse', formData)
      const data = await res.json()
      setPdfPreview(data.students)
    } catch (err) {
      setPdfError(err.message)
    } finally {
      setPdfParsing(false)
    }
  }

  const handleTemplateChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setTemplateFile(file)
    setTemplateInfo(null)
    setTemplateError(null)
    setGenerateError(null)
    setTemplateParsing(true)
    try {
      const formData = new FormData()
      formData.append('template', file)
      const res = await callToolFunction('qr_notice_parse', formData)
      const data = await res.json()
      setTemplateInfo(data.template)
    } catch (err) {
      setTemplateError(err.message)
    } finally {
      setTemplateParsing(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateError(null)
    try {
      const formData = new FormData()
      formData.append('pdf', pdfFile)
      formData.append('template', templateFile)
      const res = await callToolFunction('qr_notice_generate', formData)
      const blob = await res.blob()
      const filenameHeader = res.headers.get('X-File-Name')
      const filename = filenameHeader ? decodeURIComponent(filenameHeader) : 'QR_안내문_생성결과.zip'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setGenerateError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const canGenerate = pdfFile && templateFile && !pdfParsing && !templateParsing && !generating

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        QR 안내문 생성기 🎫
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={1}>
        고교학점제 QR 그리드 PDF와 안내문 양식(docx)을 업로드하면 학생별 안내문을 자동으로 생성합니다.
      </Typography>
      <Alert severity="warning" sx={{ mb: 3, fontSize: '0.82rem' }}>
        QR코드는 학생 개인별 인증 링크입니다. 생성된 파일과 이 화면은 외부에 공유하지 마세요.
      </Alert>

      {/* ① PDF 업로드 */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
          ① QR 그리드 PDF 업로드
        </Typography>
        <Button variant="outlined" component="label">
          {pdfFile ? pdfFile.name : 'PDF 파일 선택'}
          <input type="file" accept=".pdf" hidden onChange={handlePdfChange} />
        </Button>

        {pdfParsing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">인식 중...</Typography>
          </Box>
        )}
        {pdfError && <Alert severity="error" sx={{ mt: 2 }}>{pdfError}</Alert>}

        {pdfPreview && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success" sx={{ mb: 1.5 }}>
              학생 {pdfPreview.count}명 인식 완료
            </Alert>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>학년</TableCell>
                  <TableCell>학번</TableCell>
                  <TableCell>반</TableCell>
                  <TableCell>번호</TableCell>
                  <TableCell>이름</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pdfPreview.preview.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.grade}</TableCell>
                    <TableCell>{s.id}</TableCell>
                    <TableCell>{s.cls}</TableCell>
                    <TableCell>{s.num}</TableCell>
                    <TableCell>{s.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pdfPreview.count > pdfPreview.preview.length && (
              <Typography variant="caption" color="text.secondary">
                ...외 {pdfPreview.count - pdfPreview.preview.length}명
              </Typography>
            )}

            {pdfPreview.issues.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {pdfPreview.issues.length}건은 이름을 인식하지 못해 생성 대상에서 제외됩니다.
                  원본 PDF를 확인해 이름을 채운 뒤 다시 업로드해주세요.
                </Alert>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>페이지</TableCell>
                      <TableCell>학번</TableCell>
                      <TableCell>사유</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pdfPreview.issues.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell>{it.page}</TableCell>
                        <TableCell>{it.id || '?'}</TableCell>
                        <TableCell>{it.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* ② 양식 업로드 */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            ② 안내문 양식 업로드 (.docx)
          </Typography>
          <Button size="small" component="a" href="/tools/qr-notice-example.docx" download="안내문_양식_예시.docx">
            예시 양식 다운로드
          </Button>
        </Box>
        <Button variant="outlined" component="label">
          {templateFile ? templateFile.name : '양식 파일 선택'}
          <input type="file" accept=".docx" hidden onChange={handleTemplateChange} />
        </Button>

        {templateParsing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">확인 중...</Typography>
          </Box>
        )}
        {templateError && <Alert severity="error" sx={{ mt: 2 }}>{templateError}</Alert>}

        {templateInfo && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              템플릿에서 발견된 자동 입력 필드:{' '}
              {templateInfo.fields.length > 0
                ? templateInfo.fields.map((f) => `{{${f}}}`).join(', ')
                : '없음'}
            </Typography>
            {templateInfo.unknown.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                알 수 없는 필드가 있습니다 (오타 가능성): {templateInfo.unknown.join(', ')}.
                지원 필드: 이름, 학번, 반, 번호
              </Alert>
            )}
          </Box>
        )}
      </Paper>

      {/* ③ 생성 */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Button variant="contained" size="large" disabled={!canGenerate} onClick={handleGenerate}>
          {generating ? '생성 중...' : '전체 문서 생성'}
        </Button>
        {generating && (
          <Typography variant="body2" color="text.secondary" mt={1.5}>
            학생 수에 따라 최대 1~2분 정도 걸릴 수 있습니다. 창을 닫지 말고 기다려주세요.
          </Typography>
        )}
        {generateError && <Alert severity="error" sx={{ mt: 2 }}>{generateError}</Alert>}
      </Paper>

      <Divider sx={{ my: 3 }} />
      <Typography variant="caption" color="text.disabled">
        생성된 파일은 개인별 안내문 docx와 인쇄용 통합 docx가 zip 하나에 함께 담깁니다.
      </Typography>
    </Layout>
  )
}
