import { useEffect, useState, useRef } from 'react'
import {
  collection, query, where, getDocs, getDoc, updateDoc, doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@shared/lib/firebase'
import { RowActions, EditAction, DeleteAction, TextAction } from './adminUi'
import { useAuth } from '@shared/contexts/AuthContext'
import { emailToDocId } from '@shared/lib/emailToDocId'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'

const ROLE_LABELS = {
  teacher: '교직원',
  school_admin: '학교 관리자',
  admin: '학교 관리자',
  principal: '교감',
}

const STAFF_TYPE_STYLE = {
  '교사':   { bg: '#e0f2fe', color: '#0369a1' },
  '교직원': { bg: '#f0fdf4', color: '#15803d' },
}

// TSV 파싱: "이름\t이메일\t구분" 형식
function parseTsv(text) {
  return text.trim().split(/\r?\n/)
    .map(line => {
      const cols = line.split('\t').map(c => c.trim())
      return { name: cols[0] || '', email: (cols[1] || '').toLowerCase(), staffType: cols[2] || '교사' }
    })
    .filter(r => r.email && r.email.includes('@'))
}

// CSV 파싱: "이름,이메일,구분" 형식
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/\(.*\)/, '').trim().toLowerCase())
  const nameIdx  = headers.findIndex(h => h === '이름' || h === 'name')
  const emailIdx = headers.findIndex(h => h === '이메일' || h === 'email')
  const typeIdx  = headers.findIndex(h => h === '구분' || h === 'stafftype' || h === '직종')
  if (emailIdx === -1) return null
  return lines.slice(1)
    .map(line => {
      const cols = line.split(',').map(v => v.trim())
      return {
        name: nameIdx !== -1 ? cols[nameIdx] || '' : '',
        email: (cols[emailIdx] || '').toLowerCase(),
        staffType: typeIdx !== -1 ? cols[typeIdx] || '교사' : '교사',
      }
    })
    .filter(r => r.email && r.email.includes('@'))
}

function downloadCsvTemplate() {
  const rows = ['이름,이메일,구분(교사/교직원)', '홍길동,hong@school.hs.kr,교사', '김철수,kim@school.hs.kr,교직원'].join('\n')
  const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '사전등록_양식.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminAccounts() {
  const { schoolId } = useAuth()
  const [tab, setTab] = useState(0) // 0: pending, 1: members, 2: preregister, 3: workspace
  const [loading, setLoading] = useState(true)

  // 승인 대기 탭
  const [pendingList, setPendingList] = useState([])

  // 구성원 목록 탭
  const [teacherList, setTeacherList] = useState([])

  // 사전 등록 탭
  const [pasteText, setPasteText] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const csvInputRef = useRef(null)
  const [preApproved, setPreApproved] = useState([])

  // Workspace 동기화 탭
  const [wsEnabled, setWsEnabled] = useState(false)
  const [wsAdminEmail, setWsAdminEmail] = useState('')
  const [wsStaffOu, setWsStaffOu] = useState('')
  const [wsStudentOu, setWsStudentOu] = useState('')
  const [savingWs, setSavingWs] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    if (!schoolId) return
    if (tab === 0) fetchPending()
    else if (tab === 1) fetchTeachers()
    else if (tab === 2) fetchPreApproved()
    else if (tab === 3) fetchWorkspaceSettings()
  }, [tab, schoolId])

  const fetchWorkspaceSettings = async () => {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'schools', schoolId))
      const data = snap.data() || {}
      const ws = data.workspaceSync || {}
      setWsEnabled(!!ws.enabled)
      setWsAdminEmail(ws.adminEmail || '')
      setWsStaffOu(ws.staffOuPath || '')
      setWsStudentOu(ws.studentOuPath || '')
    } catch (err) {
      console.error('설정 불러오기 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── 데이터 불러오기 ────────────────────────────────────────
  const fetchPending = async () => {
    if (!schoolId) return
    setLoading(true)
    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', schoolId),
      where('role', '==', 'pending'),
    )
    const snap = await getDocs(q)
    setPendingList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const fetchTeachers = async () => {
    if (!schoolId) return
    setLoading(true)
    const [usersSnap, preSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId))),
      getDocs(collection(db, 'schools', schoolId, 'preApproved')),
    ])

    const realUsers = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => ['teacher', 'school_admin', 'admin', 'principal'].includes(u.role))

    const realEmails = new Set(realUsers.map(u => u.email?.toLowerCase()))

    // 아직 로그인하지 않은 사전 등록 항목
    const preOnly = preSnap.docs
      .map(d => ({ id: d.id, ...d.data(), _preOnly: true }))
      .filter(p => !realEmails.has(p.email?.toLowerCase()))

    setTeacherList(
      [...realUsers, ...preOnly]
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    )
    setLoading(false)
  }

  const fetchPreApproved = async () => {
    if (!schoolId) return
    setLoading(true)
    const snap = await getDocs(collection(db, 'schools', schoolId, 'preApproved'))
    setPreApproved(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    )
    setLoading(false)
  }

  // ── 승인 대기 탭 액션 ──────────────────────────────────────
  const approve = async (uid, asRole = 'teacher', staffType = '교사') => {
    await updateDoc(doc(db, 'users', uid), { role: asRole, schoolId, staffType })
    setPendingList(prev => prev.filter(u => u.id !== uid))
  }

  const reject = async (uid) => {
    await updateDoc(doc(db, 'users', uid), { role: 'rejected' })
    setPendingList(prev => prev.filter(u => u.id !== uid))
  }

  // ── 구성원 목록 탭 액션 ────────────────────────────────────
  const changeRole = async (uid, newRole) => {
    await updateDoc(doc(db, 'users', uid), { role: newRole })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, role: newRole } : u))
  }

  const changeStaffType = async (uid, newType) => {
    await updateDoc(doc(db, 'users', uid), { staffType: newType })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, staffType: newType } : u))
  }

  const removeMember = async (u) => {
    const label = u.name || u.email
    if (u._preOnly) {
      // 사전 등록 미접속 계정: preApproved에서 제거
      if (!window.confirm(`${label}님을 사전 등록 명단에서 제거하시겠습니까?`)) return
      const docId = emailToDocId(u.email)
      await deleteDoc(doc(db, 'schools', schoolId, 'preApproved', docId))
    } else {
      // 실제 계정: 역할을 rejected로 변경 → 시스템 접근 차단
      if (!window.confirm(`${label}님을 구성원에서 제거하시겠습니까?\n\n제거된 계정은 시스템에 접근할 수 없습니다.`)) return
      await updateDoc(doc(db, 'users', u.id), { role: 'rejected' })
    }
    setTeacherList(prev => prev.filter(t => t.id !== u.id))
  }

  const editName = async (uid, currentName) => {
    const newName = window.prompt('이름을 수정하세요:', currentName || '')
    if (newName === null) return
    const trimmed = newName.trim()
    if (!trimmed || trimmed === currentName) return
    await updateDoc(doc(db, 'users', uid), { name: trimmed })
    setTeacherList(prev => prev.map(u => u.id === uid ? { ...u, name: trimmed } : u))
  }

  // ── 사전 등록 탭 액션 ──────────────────────────────────────
  const handleParse = () => {
    const rows = parseTsv(pasteText)
    if (rows.length === 0) {
      alert('유효한 데이터가 없습니다.\n형식: 이름 TAB 이메일 TAB 구분(교사/교직원)')
      return
    }
    setParsedRows(rows)
  }

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows === null) { setSaveMsg('CSV 헤더에 "이메일" 또는 "email" 열이 필요합니다.'); return }
      if (rows.length === 0) { setSaveMsg('유효한 데이터가 없습니다.'); return }
      setParsedRows(rows)
      setPasteText('')
      setSaveMsg('')
    } catch (e) {
      setSaveMsg('파일 읽기 실패: ' + e.message)
    }
  }

  const handleSavePreApproved = async () => {
    if (parsedRows.length === 0 || !schoolId) return
    setSaving(true)
    setSaveMsg('')
    try {
      await Promise.all(parsedRows.map(r => {
        const docId = emailToDocId(r.email)
        return setDoc(doc(db, 'schools', schoolId, 'preApproved', docId), {
          name: r.name,
          email: r.email,
          staffType: r.staffType === '교직원' ? '교직원' : '교사',
          role: 'teacher',
          createdAt: serverTimestamp(),
        }, { merge: true })
      }))
      setSaveMsg(`✅ ${parsedRows.length}명 사전 등록 완료`)
      setParsedRows([])
      setPasteText('')
      await fetchPreApproved()
    } catch (e) {
      setSaveMsg('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePreApproved = async (docId, name) => {
    if (!window.confirm(`${name}님을 사전 등록 명단에서 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db, 'schools', schoolId, 'preApproved', docId))
    setPreApproved(prev => prev.filter(p => p.id !== docId))
  }

  // ── Workspace 동기화 탭 액션 ───────────────────────────────
  const handleSaveWorkspaceSync = async () => {
    setSavingWs(true)
    setSyncMsg('')
    try {
      await updateDoc(doc(db, 'schools', schoolId), {
        workspaceSync: {
          enabled: wsEnabled,
          adminEmail: wsAdminEmail.trim(),
          staffOuPath: wsStaffOu.trim(),
          studentOuPath: wsStudentOu.trim(),
        },
      })
      setSyncMsg('✅ 설정 저장 완료')
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSavingWs(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncingNow(true)
    setSyncMsg('')
    try {
      const run = httpsCallable(functions, 'runWorkspaceSyncNow')
      const { data } = await run({ schoolId })
      const { staff, students } = data.result || {}
      const parts = []
      if (staff) parts.push(`교직원 사전등록 신규 ${staff.created}·갱신 ${staff.updated}·정리 ${staff.removed} (전체 ${staff.total}명)`)
      if (students) parts.push(`학생 신규 ${students.created}·갱신 ${students.updated} (전체 ${students.total}명, 형식 불일치 ${students.skipped}건)`)
      setSyncMsg('✅ 동기화 완료 — ' + parts.join(' / '))
    } catch (err) {
      setSyncMsg('❌ 동기화 실패: ' + err.message)
    } finally {
      setSyncingNow(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={3}>
        계정 관리
      </Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tab label={`승인 대기 ${pendingList.length > 0 ? `(${pendingList.length})` : ''}`} />
        <Tab label="구성원 목록" />
        <Tab label="사전 등록" />
        <Tab label="Workspace 동기화" />
      </Tabs>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : tab === 0 ? (
        /* ── 승인 대기 탭 ── */
        pendingList.length === 0 ? (
          <Typography color="text.secondary">승인 대기 중인 계정이 없습니다.</Typography>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>이름</th>
                <th style={styles.th}>이메일</th>
                <th style={styles.th}>신청일</th>
                <th style={styles.th}>승인</th>
              </tr>
            </thead>
            <tbody>
              {pendingList.map(u => (
                <tr key={u.id}>
                  <td style={styles.td}>{u.name || '—'}</td>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>{u.createdAt?.toDate().toLocaleDateString('ko-KR') || '—'}</td>
                  <td style={styles.td}>
                    <RowActions>
                      <TextAction onClick={() => approve(u.id, 'teacher', '교사')}>교사 승인</TextAction>
                      <TextAction onClick={() => approve(u.id, 'teacher', '교직원')}>교직원 승인</TextAction>
                      <TextAction onClick={() => approve(u.id, 'school_admin', '교사')}>관리자 승인</TextAction>
                      <TextAction onClick={() => reject(u.id)} danger>거절</TextAction>
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : tab === 1 ? (
        /* ── 구성원 목록 탭 ── */
        teacherList.length === 0 ? (
          <Typography color="text.secondary">등록된 구성원이 없습니다.</Typography>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>이름</th>
                <th style={styles.th}>이메일</th>
                <th style={styles.th}>구분</th>
                <th style={styles.th}>시스템 역할</th>
                <th style={styles.th}>역할 변경</th>
                <th style={styles.th}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {teacherList.map(u => {
                const typeStyle = STAFF_TYPE_STYLE[u.staffType]
                const isPreOnly = !!u._preOnly
                return (
                  <tr key={u.id} style={isPreOnly ? { opacity: 0.7, backgroundColor: '#fafafa' } : {}}>
                    <td style={styles.td}>
                      {u.name || '—'}
                      {!isPreOnly && (
                        <EditAction onClick={() => editName(u.id, u.name || '')} title="이름 수정" />
                      )}
                    </td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>
                      {isPreOnly ? (
                        <span style={{
                          ...styles.roleBadge,
                          backgroundColor: typeStyle?.bg || '#e0f2fe',
                          color: typeStyle?.color || '#0369a1',
                        }}>
                          {u.staffType || '교사'}
                        </span>
                      ) : (
                        <select
                          value={u.staffType || ''}
                          onChange={e => e.target.value && changeStaffType(u.id, e.target.value)}
                          style={{
                            ...styles.select,
                            ...(typeStyle ? { backgroundColor: typeStyle.bg, color: typeStyle.color, fontWeight: 600 } : {}),
                          }}
                        >
                          <option value="">미설정</option>
                          <option value="교사">교사</option>
                          <option value="교직원">교직원</option>
                        </select>
                      )}
                    </td>
                    <td style={styles.td}>
                      {isPreOnly ? (
                        <span style={{ ...styles.roleBadge, backgroundColor: '#fef9c3', color: '#92400e' }}>
                          미접속
                        </span>
                      ) : (
                        <span style={{
                          ...styles.roleBadge,
                          backgroundColor: (u.role === 'school_admin' || u.role === 'admin') ? '#f3e5f5' : '#f0f0f0',
                          color: (u.role === 'school_admin' || u.role === 'admin') ? '#7b1fa2' : '#555',
                        }}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {isPreOnly ? (
                        <span style={styles.muted}>로그인 후 활성화</span>
                      ) : (
                        <RowActions>
                          {u.role !== 'teacher' && (
                            <TextAction onClick={() => changeRole(u.id, 'teacher')}>교사로</TextAction>
                          )}
                          {u.role !== 'principal' && (
                            <TextAction onClick={() => changeRole(u.id, 'principal')}>교감으로</TextAction>
                          )}
                          {u.role !== 'school_admin' && (
                            <TextAction onClick={() => changeRole(u.id, 'school_admin')}>관리자로</TextAction>
                          )}
                        </RowActions>
                      )}
                    </td>
                    <td style={styles.td}>
                      <DeleteAction onClick={() => removeMember(u)} title="구성원 제거" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      ) : tab === 2 ? (
        /* ── 사전 등록 탭 ── */
        <Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            교직원 구글 계정을 사전에 등록해두면, 나중에 해당 이메일로 로그인할 때 승인 대기 없이 자동으로 승인됩니다.
          </Alert>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <Button variant="outlined" onClick={downloadCsvTemplate}>
              CSV 양식 다운로드
            </Button>
            <Button variant="outlined" component="label">
              CSV 파일 업로드
              <input ref={csvInputRef} type="file" accept=".csv" hidden onChange={handleCsvUpload} />
            </Button>
          </Box>

          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="이름 TAB 이메일 TAB 구분(교사/교직원) 형식으로 붙여넣기"
            style={styles.textarea}
            rows={8}
          />

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <Button variant="outlined" onClick={handleParse} disabled={!pasteText.trim()}>
              데이터 확인
            </Button>
            <Button
              variant="contained"
              onClick={handleSavePreApproved}
              disabled={parsedRows.length === 0 || saving}
            >
              {saving ? '저장 중...' : `${parsedRows.length}명 사전 등록`}
            </Button>
          </Box>

          {saveMsg && (
            <Alert severity={saveMsg.includes('✅') ? 'success' : 'error'} sx={{ mb: 3 }}>
              {saveMsg}
            </Alert>
          )}

          {parsedRows.length > 0 && (
            <Box sx={{ mb: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={600} mb={1}>
                확인된 데이터 ({parsedRows.length}명)
              </Typography>
              {parsedRows.map((r, i) => (
                <Typography key={i} variant="body2" color="text.secondary">
                  {r.name} ({r.email}) - {r.staffType}
                </Typography>
              ))}
            </Box>
          )}

          <Typography variant="h6" fontWeight={600} mt={4} mb={2}>
            사전 등록 명단 ({preApproved.length}명)
          </Typography>

          {preApproved.length === 0 ? (
            <Typography color="text.secondary">사전 등록된 계정이 없습니다.</Typography>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>이름</th>
                  <th style={styles.th}>이메일</th>
                  <th style={styles.th}>구분</th>
                  <th style={styles.th}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {preApproved.map(p => (
                  <tr key={p.id}>
                    <td style={styles.td}>{p.name}</td>
                    <td style={styles.td}>{p.email}</td>
                    <td style={styles.td}>{p.staffType}</td>
                    <td style={styles.td}>
                      <DeleteAction onClick={() => handleDeletePreApproved(p.id, p.name)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Box>
      ) : tab === 3 ? (
        /* ── Workspace 동기화 탭 ── */
        <Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            Google Workspace API를 사용하여 교직원 및 학생 계정을 자동으로 동기화할 수 있습니다.
            <br />
            설정 후 매일 자동으로 실행되며, 필요 시 수동 실행도 가능합니다.
          </Alert>

          <Box sx={{ mb: 3 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={wsEnabled}
                onChange={e => setWsEnabled(e.target.checked)}
              />
              자동 동기화 활성화
            </label>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            <label style={styles.modalLabel}>
              Workspace 관리자 이메일
              <input
                type="email"
                value={wsAdminEmail}
                onChange={e => setWsAdminEmail(e.target.value)}
                placeholder="admin@school.hs.kr"
                style={styles.input}
              />
            </label>

            <label style={styles.modalLabel}>
              교직원 OU 경로
              <input
                type="text"
                value={wsStaffOu}
                onChange={e => setWsStaffOu(e.target.value)}
                placeholder="/교직원"
                style={styles.input}
              />
            </label>

            <label style={styles.modalLabel}>
              학생 OU 경로
              <input
                type="text"
                value={wsStudentOu}
                onChange={e => setWsStudentOu(e.target.value)}
                placeholder="/학생/2027"
                style={styles.input}
              />
            </label>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <Button variant="contained" onClick={handleSaveWorkspaceSync} disabled={savingWs}>
              {savingWs ? '저장 중...' : '설정 저장'}
            </Button>
            <Button variant="outlined" onClick={handleSyncNow} disabled={syncingNow || !wsEnabled}>
              {syncingNow ? '동기화 중...' : '지금 동기화 실행'}
            </Button>
          </Box>

          {syncMsg && (
            <Alert severity={syncMsg.includes('✅') ? 'success' : 'error'} sx={{ mb: 3 }}>
              {syncMsg}
            </Alert>
          )}
        </Box>
      ) : null}
    </Box>
  )
}

const styles = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '0.6rem 0.8rem', backgroundColor: '#f0f0f0', fontSize: '0.85rem', fontWeight: 600 },
  td: { padding: '0.6rem 0.8rem', borderBottom: '1px solid #eee', fontSize: '0.9rem', verticalAlign: 'middle' },
  roleBadge: { display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 },
  select: { padding: '0.25rem 0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.84rem', cursor: 'pointer', outline: 'none' },
  muted: { color: '#aaa', fontSize: '0.82rem' },
  textarea: { width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  input: { padding: '0.4rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  modalLabel: { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: '#475569', fontWeight: 600 },
}
