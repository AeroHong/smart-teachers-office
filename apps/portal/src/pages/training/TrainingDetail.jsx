import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { QRCodeCanvas } from 'qrcode.react'
import {
  doc, getDoc, collection, onSnapshot, setDoc, serverTimestamp,
  updateDoc, deleteDoc, getDocs, query, orderBy,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import { SCHOOL_ID, loadMembers, filterBySearch } from './trainingUtils'

export default function TrainingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, role } = useAuth()

  const [training, setTraining] = useState(null)
  const [signatures, setSignatures] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [qrPrintOpen, setQrPrintOpen] = useState(false)

  const isAdmin = role === 'admin' || role === 'school_admin'
  const isOwner = training?.createdBy === user?.uid

  useEffect(() => {
    getDoc(doc(db, 'schools', SCHOOL_ID, 'trainings', id)).then(d => {
      if (d.exists()) setTraining({ id: d.id, ...d.data() })
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'schools', SCHOOL_ID, 'trainings', id, 'signatures'),
      (snap) => {
        const map = {}
        snap.forEach(d => { map[d.id] = d.data() })
        setSignatures(map)
      }
    )
    return unsub
  }, [id])

  if (loading) return <Layout><Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box></Layout>
  if (!training) return <Layout><Typography>연수를 찾을 수 없습니다.</Typography></Layout>

  // 서명 현황·명단 편집은 연수 만든 사람만
  const canViewDetails = isOwner
  const canManage = isAdmin || isOwner  // 수정·마감·삭제·QR 버튼

  // 탭 구성: 만든 사람 → [서명 현황, 내 서명, 명단 편집], 그 외 → [내 서명]
  const tabs = [
    ...(canViewDetails ? ['서명 현황'] : []),
    '내 서명',
    ...(canViewDetails ? ['명단 편집'] : []),
  ]
  const sigStatusIdx  = canViewDetails ? 0 : -1
  const mySignIdx     = canViewDetails ? 1 : 0
  const memberEditIdx = canViewDetails ? 2 : -1

  const timeStr = training.startTime && training.endTime
    ? `${training.startTime}–${training.endTime}`
    : training.startTime || ''
  const metaStr = [training.date, timeStr, training.location].filter(Boolean).join(' · ')

  const handleToggleStatus = async () => {
    const newStatus = training.status === 'closed' ? 'open' : 'closed'
    await updateDoc(doc(db, 'schools', SCHOOL_ID, 'trainings', id), { status: newStatus })
    setTraining(p => ({ ...p, status: newStatus }))
  }

  const handleDelete = async () => {
    if (!window.confirm(`"${training.title}" 연수를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return
    await deleteDoc(doc(db, 'schools', SCHOOL_ID, 'trainings', id))
    navigate('/training')
  }

  return (
    <Layout>
      {/* ── 헤더 ── */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="h5" fontWeight={700}>{training.title}</Typography>
              <Chip
                label={training.status === 'closed' ? '마감' : '서명 중'}
                size="small"
                color={training.status === 'closed' ? 'default' : 'primary'}
                variant="outlined"
              />
            </Box>
            {metaStr && (
              <Typography fontSize="0.88rem" color="text.secondary">{metaStr}</Typography>
            )}
            {training.description && (
              <Typography fontSize="0.84rem" color="text.secondary" mt={0.25}>
                {training.description}
              </Typography>
            )}
          </Box>

          {canManage && (
            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, pt: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button size="small" variant="outlined" onClick={() => setQrPrintOpen(true)}>QR 인쇄</Button>
              {isOwner && <Button size="small" variant="outlined" onClick={() => setEditOpen(true)}>수정</Button>}
              {isOwner && (
                <Button
                  size="small" variant="outlined"
                  color={training.status === 'closed' ? 'primary' : 'inherit'}
                  onClick={handleToggleStatus}
                >
                  {training.status === 'closed' ? '재개' : '마감'}
                </Button>
              )}
              <Button size="small" variant="outlined" color="error" onClick={handleDelete}>삭제</Button>
            </Box>
          )}
        </Box>
      </Box>

      {editOpen && (
        <EditDialog
          training={training}
          id={id}
          onSave={(updated) => { setTraining(p => ({ ...p, ...updated })); setEditOpen(false) }}
          onClose={() => setEditOpen(false)}
        />
      )}

      {qrPrintOpen && (
        <QrPrintModal
          training={training}
          id={id}
          onClose={() => setQrPrintOpen(false)}
        />
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        {tabs.map((label, i) => <Tab key={i} label={label} />)}
      </Tabs>

      {tab === sigStatusIdx && sigStatusIdx >= 0 && (
        <SignatureStatus training={training} signatures={signatures} id={id} canManage={canManage} />
      )}
      {tab === mySignIdx && (
        <MySignature id={id} user={user} training={training} signatures={signatures} />
      )}
      {tab === memberEditIdx && memberEditIdx >= 0 && (
        <MemberEditor id={id} training={training} setTraining={setTraining} />
      )}
    </Layout>
  )
}

// ── 연수 정보 수정 다이얼로그 ─────────────────────────────────────────────────

function EditDialog({ training, id, onSave, onClose }) {
  const [form, setForm] = useState({
    title: training.title || '',
    date: training.date || '',
    startTime: training.startTime || '',
    endTime: training.endTime || '',
    location: training.location || '',
    description: training.description || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }))

  const handleSave = async () => {
    if (!form.title.trim()) { alert('연수명을 입력하세요.'); return }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'schools', SCHOOL_ID, 'trainings', id), { ...form })
      onSave(form)
    } catch {
      alert('저장 중 오류가 발생했습니다.')
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>연수 정보 수정</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="연수명" value={form.title} onChange={set('title')} required fullWidth />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="날짜" type="date" value={form.date} onChange={set('date')}
              InputLabelProps={{ shrink: true }} required sx={{ flex: 1 }} />
            <TextField label="시작" type="time" value={form.startTime} onChange={set('startTime')}
              InputLabelProps={{ shrink: true }} inputProps={{ step: 600 }} sx={{ width: 120 }} />
            <TextField label="종료" type="time" value={form.endTime} onChange={set('endTime')}
              InputLabelProps={{ shrink: true }} inputProps={{ step: 600 }} sx={{ width: 120 }} />
          </Box>
          <TextField label="장소" value={form.location} onChange={set('location')} fullWidth />
          <TextField label="비고" value={form.description} onChange={set('description')} fullWidth multiline rows={2} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : '저장'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── QR 인쇄 모달 ──────────────────────────────────────────────────────────────

function QrPrintModal({ training, id, onClose }) {
  const qrUrl = `${window.location.origin}/training/${id}/sign`
  const canvasWrapRef = useRef(null)

  const handlePrint = () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas')
    if (!canvas) return
    const qrDataUrl = canvas.toDataURL('image/png')
    const win = window.open('', '_blank', 'width=600,height=800')
    win.document.write(`<!DOCTYPE html><html>
      <head><title>${training.title}</title>
      <style>
        body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;padding:40px;box-sizing:border-box;}
        h1{font-size:1.5rem;text-align:center;margin-bottom:2rem;word-break:keep-all;line-height:1.4;}
        img{width:260px;height:260px;display:block;margin-bottom:2rem;}
        p{font-size:1.1rem;color:#555;}
      </style></head>
      <body>
        <h1>${training.title}</h1>
        <img src="${qrDataUrl}" alt="QR" />
        <p>서명 부탁드립니다.</p>
        <script>window.onload=function(){window.print();}<\/script>
      </body></html>`)
    win.document.close()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>QR 코드 인쇄</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2, gap: 2 }}>
          <Typography fontSize="1rem" fontWeight={700} textAlign="center">
            {training.title}
          </Typography>
          <Box ref={canvasWrapRef}>
            <QRCodeCanvas value={qrUrl} size={220} />
          </Box>
          <Typography fontSize="0.88rem" color="text.secondary">서명 부탁드립니다.</Typography>
          <Typography fontSize="0.74rem" color="text.disabled" sx={{ wordBreak: 'break-all' }}>
            {qrUrl}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
        <Button variant="contained" onClick={handlePrint}>인쇄</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── 서명 현황 탭 ──────────────────────────────────────────────────────────────

function SignatureStatus({ training, signatures, id, canManage }) {
  const members = training.members ?? []
  const signedCount = Object.keys(signatures).length
  const [exporting, setExporting] = useState('')  // '' | 'excel' | 'pdf'
  const [notes, setNotes] = useState(training.notes ?? {})
  const [editingNote, setEditingNote] = useState(null)
  const [noteText, setNoteText] = useState('')

  const startEditNote = (uid, cur) => { setEditingNote(uid); setNoteText(cur || '') }
  const saveNote = async (uid) => {
    const trimmed = noteText.trim()
    const newNotes = { ...notes }
    if (trimmed) newNotes[uid] = trimmed
    else delete newNotes[uid]
    try {
      await updateDoc(doc(db, 'schools', SCHOOL_ID, 'trainings', id), { notes: newNotes })
      setNotes(newNotes)
    } catch { alert('비고 저장 중 오류가 발생했습니다.') }
    setEditingNote(null)
  }

  const handleExportExcel = async () => {
    setExporting('excel')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = '선유고 스마트교무실'
      const ws = wb.addWorksheet('서명부')

      ws.columns = [
        { header: '순번',    key: 'no',       width: 7  },
        { header: '이름',    key: 'name',     width: 14 },
        { header: '구분',    key: 'staffType', width: 10 },
        { header: '서명 시각', key: 'signedAt', width: 22 },
        { header: '서명',    key: 'sig',      width: 32 },
        { header: '비고',    key: 'note',     width: 20 },
      ]

      const hdr = ws.getRow(1)
      hdr.height = 20
      hdr.font = { bold: true, size: 10 }
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
      hdr.alignment = { vertical: 'middle', horizontal: 'center' }
      hdr.eachCell(cell => {
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
      })

      const ROW_H = 58

      for (let i = 0; i < members.length; i++) {
        const m = members[i]
        const sig = signatures[m.uid]
        const rowIdx = i + 2

        const row = ws.addRow({
          no: i + 1,
          name: m.name,
          staffType: m.staffType || '',
          signedAt: sig?.signedAt?.toDate().toLocaleString('ko-KR') ?? '(미서명)',
          sig: '',
          note: notes[m.uid] || '',
        })
        row.height = ROW_H
        row.alignment = { vertical: 'middle' }

        if (!sig) {
          ['no', 'name', 'staffType', 'signedAt', 'sig'].forEach(key => {
            row.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
          })
        }

        if (m.staffType === '교사') {
          row.getCell('staffType').font = { color: { argb: 'FF0369A1' }, bold: true }
        } else if (m.staffType === '교직원') {
          row.getCell('staffType').font = { color: { argb: 'FF15803D' }, bold: true }
        }

        if (sig?.signatureData) {
          const base64 = sig.signatureData.split(',')[1]
          const binary = atob(base64)
          const bytes = new Uint8Array(binary.length)
          for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j)
          const imgId = wb.addImage({ buffer: bytes.buffer, extension: 'png' })
          ws.addImage(imgId, {
            tl: { col: 4, row: rowIdx - 1 },
            br: { col: 5, row: rowIdx },
            editAs: 'oneCell',
          })
        }
      }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${training.title}_서명부.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Excel 내보내기 중 오류가 발생했습니다.')
    } finally {
      setExporting('')
    }
  }

  const handleExportPdf = async () => {
    setExporting('pdf')
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const el = document.getElementById('sig-print-area')
      if (!el) return
      const canvas = await html2canvas(el, { scale: 2, useCORS: true })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW - 20
      const imgH = (canvas.height * imgW) / canvas.width

      if (imgH <= pageH - 20) {
        pdf.addImage(imgData, 'PNG', 10, 10, imgW, imgH)
      } else {
        let yOffset = 0
        while (yOffset < imgH) {
          if (yOffset > 0) pdf.addPage()
          pdf.addImage(imgData, 'PNG', 10, 10 - yOffset, imgW, imgH)
          yOffset += pageH - 20
        }
      }
      pdf.save(`${training.title}_서명부.pdf`)
    } catch (e) {
      console.error(e)
      alert('PDF 내보내기 중 오류가 발생했습니다.')
    } finally {
      setExporting('')
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Typography fontSize="0.9rem" color="text.secondary">
          서명 완료&nbsp;
          <strong style={{ color: signedCount === members.length && members.length > 0 ? '#15803d' : '#1e293b' }}>
            {signedCount}
          </strong>
          &nbsp;/ {members.length}명
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button
            size="small" variant="outlined"
            onClick={handleExportExcel}
            disabled={!!exporting}
            startIcon={exporting === 'excel' ? <CircularProgress size={14} /> : null}
          >
            Excel 다운로드
          </Button>
          <Button
            size="small" variant="outlined"
            onClick={handleExportPdf}
            disabled={!!exporting}
            startIcon={exporting === 'pdf' ? <CircularProgress size={14} /> : null}
          >
            PDF 출력
          </Button>
        </Box>
      </Box>

      <Box id="sig-print-area" sx={{
        border: '1px solid #e2e8f0', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#fff',
      }}>
        <Box sx={{ px: 2.5, py: 1.75, borderBottom: '2px solid #e2e8f0', bgcolor: '#f8fafc' }}>
          <Typography fontWeight={700} fontSize="1rem">{training.title}</Typography>
          <Typography fontSize="0.8rem" color="text.secondary" mt={0.25}>
            {[training.date,
              training.startTime && training.endTime ? `${training.startTime}–${training.endTime}` : '',
              training.location,
            ].filter(Boolean).join(' · ')}
          </Typography>
        </Box>

        <Box sx={{
          display: 'grid', gridTemplateColumns: '44px 120px 72px 1fr 160px 140px',
          px: 1.5, py: 0.75,
          bgcolor: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
          fontSize: '0.78rem', fontWeight: 700, color: '#64748b',
        }}>
          <span>순번</span><span>이름</span><span>구분</span><span>서명 시각</span><span>서명</span><span>비고</span>
        </Box>

        {members.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary', fontSize: '0.88rem' }}>
            명단이 비어 있습니다. 명단 편집 탭에서 추가하세요.
          </Box>
        ) : members.map((m, i) => {
          const sig = signatures[m.uid]
          const note = notes[m.uid] || ''
          return (
            <Box key={i} sx={{
              display: 'grid', gridTemplateColumns: '44px 120px 72px 1fr 160px 140px',
              px: 1.5, py: 0.75,
              borderBottom: i < members.length - 1 ? '1px solid #f1f5f9' : 'none',
              bgcolor: sig ? '#fff' : note ? '#f0fdf4' : '#fffbeb',
              alignItems: 'center',
              minHeight: 52,
            }}>
              <Typography fontSize="0.8rem" color="text.disabled">{i + 1}</Typography>
              <Typography fontSize="0.88rem" fontWeight={sig ? 600 : 400}>{m.name}</Typography>
              <Typography fontSize="0.78rem" sx={{
                color: m.staffType === '교사' ? '#0369a1'
                  : m.staffType === '교직원' ? '#15803d' : 'text.disabled',
                fontWeight: m.staffType ? 600 : 400,
              }}>
                {m.staffType || '—'}
              </Typography>
              <Typography fontSize="0.78rem" color={sig ? 'text.secondary' : 'warning.main'}>
                {sig ? sig.signedAt?.toDate().toLocaleString('ko-KR') : '미서명'}
              </Typography>
              <Box sx={{ height: 44, display: 'flex', alignItems: 'center' }}>
                {sig?.signatureData && (
                  <img src={sig.signatureData} alt="서명"
                    style={{ maxHeight: 40, maxWidth: 150, objectFit: 'contain' }} />
                )}
              </Box>
              {/* 비고 */}
              <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
                {canManage && editingNote === m.uid ? (
                  <TextField
                    size="small" autoFocus
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onBlur={() => saveNote(m.uid)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveNote(m.uid)
                      if (e.key === 'Escape') setEditingNote(null)
                    }}
                    sx={{ width: 120 }}
                    inputProps={{ style: { fontSize: '0.76rem', padding: '4px 8px' } }}
                  />
                ) : (
                  <Typography
                    fontSize="0.78rem"
                    color={note ? '#15803d' : 'text.disabled'}
                    fontWeight={note ? 600 : 400}
                    onClick={() => canManage && startEditNote(m.uid, note)}
                    sx={{ cursor: canManage ? 'pointer' : 'default', '&:hover': canManage ? { textDecoration: 'underline' } : {} }}
                  >
                    {note || (canManage ? '— 클릭하여 입력' : '—')}
                  </Typography>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// ── 내 서명 탭 ────────────────────────────────────────────────────────────────

function MySignature({ id, user, training, signatures }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [SignaturePad, setSignaturePad] = useState(null)
  const [padLoading, setPadLoading] = useState(true)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showPad, setShowPad] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const update = () => {
      if (containerRef.current) setCanvasWidth(Math.min(containerRef.current.offsetWidth, 520))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [showPad])

  const myUid = user?.uid
  const existing = signatures[myUid]
  const isMember = training.members?.some(m => m.uid === myUid)
  const myMemberName = training.members?.find(m => m.uid === myUid)?.name || user?.displayName || ''

  useEffect(() => {
    import('react-signature-canvas')
      .then(m => { setSignaturePad(() => m.default); setPadLoading(false) })
      .catch(() => setPadLoading(false))
  }, [])

  const handleSave = async () => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) {
      alert('서명을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const dataUrl = canvasRef.current.getTrimmedCanvas().toDataURL('image/png')
      await setDoc(
        doc(db, 'schools', SCHOOL_ID, 'trainings', id, 'signatures', myUid),
        {
          uid: myUid,
          name: myMemberName,
          email: user.email,
          signedAt: serverTimestamp(),
          signatureData: dataUrl,
        }
      )
      const sigSnap = await getDocs(
        collection(db, 'schools', SCHOOL_ID, 'trainings', id, 'signatures')
      )
      await updateDoc(
        doc(db, 'schools', SCHOOL_ID, 'trainings', id),
        { signedCount: sigSnap.size }
      )
      setShowPad(false)
    } catch {
      alert('서명 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (!isMember) {
    return (
      <Box py={6} textAlign="center" color="text.secondary">
        <Typography fontSize="2rem" mb={1}>🔒</Typography>
        <Typography fontWeight={600} mb={0.5}>서명 대상자가 아닙니다</Typography>
        <Typography fontSize="0.84rem">명단에 포함되어 있지 않습니다. 주관자에게 문의하세요.</Typography>
      </Box>
    )
  }

  if (existing && !showPad) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <Box sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75,
            bgcolor: '#f0fdf4', color: '#15803d',
            px: 1.5, py: 0.5, borderRadius: 2, fontSize: '0.88rem', fontWeight: 700,
          }}>
            ✓ 서명 완료
          </Box>
          {existing.signedAt && (
            <Typography fontSize="0.82rem" color="text.secondary">
              {existing.signedAt.toDate().toLocaleString('ko-KR')}
            </Typography>
          )}
        </Box>

        <Box sx={{
          border: '1px solid #e2e8f0', borderRadius: 2, display: 'inline-block',
          p: 2, bgcolor: '#fafafa', mb: 2.5,
        }}>
          <img src={existing.signatureData} alt="내 서명"
            style={{ display: 'block', maxWidth: 400, maxHeight: 140 }} />
        </Box>

        <Box>
          <Button variant="outlined" color="warning" size="small" onClick={() => setShowPad(true)}>
            재서명
          </Button>
        </Box>
      </Box>
    )
  }

  return (
    <Box>
      <Typography fontWeight={600} mb={0.5}>
        {existing ? '재서명' : '서명 입력'}
      </Typography>
      <Typography fontSize="0.84rem" color="text.secondary" mb={2.5}>
        아래 영역에 손가락 또는 펜으로 서명하세요.
      </Typography>

      <Box ref={containerRef} sx={{ width: '100%', mb: 2 }}>
        {padLoading ? (
          <Box display="flex" alignItems="center" gap={1.5}>
            <CircularProgress size={18} />
            <Typography fontSize="0.88rem" color="text.secondary">서명 패드 로드 중...</Typography>
          </Box>
        ) : SignaturePad && canvasWidth > 0 ? (
          <Box sx={{
            border: '2px solid #4f46e5', borderRadius: 2,
            boxShadow: '0 2px 16px rgba(79,70,229,0.14)',
            overflow: 'hidden', touchAction: 'none',
          }}>
            <SignaturePad
              ref={canvasRef}
              canvasProps={{
                width: canvasWidth,
                height: Math.max(140, Math.round(canvasWidth * 0.38)),
                style: { display: 'block', touchAction: 'none' },
              }}
              backgroundColor="white"
              penColor="#1e293b"
              dotSize={2.5}
              minWidth={1.5}
              maxWidth={3.5}
            />
          </Box>
        ) : !padLoading ? (
          <Typography color="error" fontSize="0.88rem">
            서명 패드를 불러올 수 없습니다. 페이지를 새로고침해 주세요.
          </Typography>
        ) : null}
      </Box>

      {!padLoading && SignaturePad && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : '서명 저장'}
          </Button>
          <Button variant="outlined" onClick={() => canvasRef.current?.clear()} disabled={saving}>
            다시 그리기
          </Button>
          {existing && (
            <Button variant="text" color="inherit" onClick={() => setShowPad(false)} disabled={saving}>
              취소
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}

// ── 명단 편집 탭 ──────────────────────────────────────────────────────────────

function MemberEditor({ id, training, setTraining }) {
  const [members, setMembers] = useState(training.members ?? [])
  const [allUsers, setAllUsers] = useState([])
  const [presets, setPresets] = useState([])
  const [teacherSearch, setTeacherSearch] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [snackbar, setSnackbar] = useState('')

  useEffect(() => {
    loadMembers('전체').then(setAllUsers)
    getDocs(query(collection(db, 'schools', SCHOOL_ID, 'trainingPresets'), orderBy('name')))
      .then(snap => setPresets(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const loadPreset = (presetId) => {
    const preset = presets.find(p => p.id === presetId)
    if (!preset) return
    setMembers(prev => {
      const existing = new Set(prev.map(m => m.email || m.name))
      const toAdd = (preset.members || []).filter(m => !existing.has(m.email || m.name))
      return [...prev, ...toAdd]
    })
    setSnackbar(`"${preset.name}" 명단 불러왔습니다.`)
  }

  const addUser = (u) => {
    if (members.some(m => m.uid === u.uid)) return
    setMembers(p => [...p, { uid: u.uid, name: u.name, email: u.email, staffType: u.staffType }])
    setTeacherSearch('')
  }

  const addManual = () => {
    if (!manualName.trim()) return
    setMembers(p => [...p, { uid: null, name: manualName.trim(), email: manualEmail.trim(), staffType: '' }])
    setManualName('')
    setManualEmail('')
  }

  const removeMember = (idx) => setMembers(p => p.filter((_, i) => i !== idx))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'schools', SCHOOL_ID, 'trainings', id), { members })
      setTraining(p => ({ ...p, members }))
      setSnackbar('명단이 저장되었습니다.')
    } catch {
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const filteredSearch = filterBySearch(allUsers, teacherSearch, members)

  return (
    <Box>
      {presets.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <TextField select label="연수 명단 불러오기" size="small" sx={{ minWidth: 220 }}
            value="" onChange={(e) => loadPreset(e.target.value)}>
            {presets.map(p => (
              <MenuItem key={p.id} value={p.id}>{p.name} ({p.members?.length ?? 0}명)</MenuItem>
            ))}
          </TextField>
        </Box>
      )}

      <Box sx={{ mb: 1.5, position: 'relative', maxWidth: 320 }}>
        <TextField label="이름 또는 이메일 검색" size="small" fullWidth
          value={teacherSearch}
          onChange={e => setTeacherSearch(e.target.value)}
          onBlur={() => setTimeout(() => setTeacherSearch(''), 150)}
          autoComplete="off"
        />
        {filteredSearch.length > 0 && (
          <Box sx={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1,
            zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}>
            {filteredSearch.map(u => (
              <Box key={u.uid} onMouseDown={() => addUser(u)}
                sx={{ px: 2, py: 1, fontSize: '0.88rem', cursor: 'pointer',
                  '&:hover': { bgcolor: '#f0f4ff' },
                  display: 'flex', gap: 1, alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{u.name}</span>
                {u.staffType && (
                  <span style={{
                    fontSize: '0.72rem', padding: '1px 6px', borderRadius: 8,
                    backgroundColor: u.staffType === '교사' ? '#e0f2fe' : '#f0fdf4',
                    color: u.staffType === '교사' ? '#0369a1' : '#15803d', fontWeight: 600,
                  }}>{u.staffType}</span>
                )}
                <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{u.email}</span>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField label="이름" size="small" value={manualName}
          onChange={e => setManualName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addManual()} sx={{ width: 160 }} />
        <TextField label="이메일 (선택)" size="small" value={manualEmail}
          onChange={e => setManualEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addManual()} sx={{ width: 220 }} />
        <Button variant="outlined" size="small" onClick={addManual} sx={{ height: 40 }}>추가</Button>
      </Box>

      <Typography fontSize="0.82rem" color="text.secondary" mb={1}>총 {members.length}명</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 3 }}>
        {members.map((m, i) => (
          <Chip key={i}
            label={m.staffType ? `${m.name} (${m.staffType})` : m.name}
            size="small"
            onDelete={() => removeMember(i)}
            sx={{
              bgcolor: m.staffType === '교사' ? '#e0f2fe'
                : m.staffType === '교직원' ? '#f0fdf4' : undefined,
            }}
          />
        ))}
      </Box>

      <Button variant="contained" onClick={handleSave} disabled={saving}>
        {saving ? <CircularProgress size={20} /> : '명단 저장'}
      </Button>

      <Snackbar
        open={!!snackbar} autoHideDuration={3000}
        onClose={() => setSnackbar('')} message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}
