import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath, officeLayoutId, currentSchoolYear } from '@shared/lib/schema'
import OfficeLayoutEditor from '../attendance/OfficeLayoutEditor'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Button from '@mui/material/Button'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'

const CALL_STATUS_STYLE = {
  pending:      { label: '대기 중', bg: '#fdecea', color: '#d32f2f' },
  acknowledged: { label: '확인함',  bg: '#e8f5e9', color: '#2e7d32' },
  done:         { label: '완료',    bg: '#f1f3f4', color: '#5f6368' },
  expired:      { label: '만료',    bg: '#f1f3f4', color: '#9aa0a6' },
}

export default function AdminSpaces() {
  const { schoolId } = useAuth()
  const [tab, setTab] = useState(0) // 0: departments, 1: layout, 2: devices
  const [loading, setLoading] = useState(true)

  const [callDepartments, setCallDepartments] = useState([])
  const [pairDepartment, setPairDepartment] = useState('')
  const [pairDeviceType, setPairDeviceType] = useState('input')
  const [issuedCode, setIssuedCode] = useState(null)
  const [issuingCode, setIssuingCode] = useState(false)
  const [recentCalls, setRecentCalls] = useState([])
  const [layoutDepartment, setLayoutDepartment] = useState('')

  useEffect(() => {
    if (!schoolId) return
    fetchCallSystem()
  }, [schoolId])

  const fetchCallSystem = async () => {
    if (!schoolId) return
    setLoading(true)
    const [assignSnap, callSnap] = await Promise.all([
      getDocs(query(
        collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)),
        where('year', '==', currentSchoolYear()),
      )),
      getDocs(query(
        collection(db, ...schoolPath(schoolId, COL.CALL_REQUESTS)),
        orderBy('createdAt', 'desc'),
        limit(30),
      )),
    ])

    // 부서 목록은 별도 컬렉션 없이 교원 배정의 department 값을 그대로 집계
    const departments = [...new Set(
      assignSnap.docs.map(d => (d.data().department || '').trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ko'))

    setCallDepartments(departments)
    setPairDepartment(prev => (prev && departments.includes(prev)) ? prev : (departments[0] || ''))
    setLayoutDepartment(prev => (prev && departments.includes(prev)) ? prev : (departments[0] || ''))
    setRecentCalls(callSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const issuePairingCode = async () => {
    if (!pairDepartment) return
    setIssuingCode(true)
    setIssuedCode(null)
    try {
      const gen = httpsCallable(functions, 'generatePairingCode')
      const { data } = await gen({ schoolId, department: pairDepartment, deviceType: pairDeviceType })
      setIssuedCode({ ...data, department: pairDepartment, deviceType: pairDeviceType })
    } catch (err) {
      alert('코드 발급 실패: ' + err.message)
    } finally {
      setIssuingCode(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={3}>
        공간 관리
      </Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tab label="부서 목록" />
        <Tab label="자리 배치" />
        <Tab label="호출 기기" />
      </Tabs>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : tab === 0 ? (
        /* ── 부서 목록 탭 ── */
        <Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            부서 목록은 교직원 관리 탭에서 교원별로 부서를 배정하면 자동으로 수집됩니다.
          </Alert>

          {callDepartments.length === 0 ? (
            <Typography color="text.secondary">
              등록된 부서가 없습니다. 교직원 관리 탭에서 교원별 부서를 먼저 입력해 주세요.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2 }}>
              {callDepartments.map(department => (
                <Card key={department} variant="outlined">
                  <CardContent>
                    <Typography variant="h6" fontWeight={600}>
                      {department}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            총 {callDepartments.length}개 부서
          </Typography>
        </Box>
      ) : tab === 1 ? (
        /* ── 자리 배치 탭 ── */
        <Box>
          {callDepartments.length === 0 ? (
            <Alert severity="warning">
              등록된 부서가 없습니다. 교직원 관리 탭에서 교원별 부서를 먼저 입력해 주세요.
            </Alert>
          ) : (
            <>
              <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>부서 선택</InputLabel>
                  <Select
                    value={layoutDepartment}
                    label="부서 선택"
                    onChange={e => setLayoutDepartment(e.target.value)}
                  >
                    {callDepartments.map(o => (
                      <MenuItem key={o} value={o}>{o}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Alert severity="info" sx={{ mb: 3 }}>
                여기서 맞춘 배치가 학생용 키오스크 화면에 그대로 표시되어, 학생이 선생님 자리를 보고 찾을 수 있습니다.
              </Alert>

              {layoutDepartment && (
                <OfficeLayoutEditor
                  /* 편집 대상 문서가 바뀌면 에디터를 다시 마운트한다 — key를 문서 ID와 맞춰 둔다 */
                  key={officeLayoutId(currentSchoolYear(), layoutDepartment)}
                  schoolId={schoolId}
                  year={currentSchoolYear()}
                  department={layoutDepartment}
                />
              )}
            </>
          )}
        </Box>
      ) : tab === 2 ? (
        /* ── 호출 기기 탭 ── */
        <Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            부서 사무실 앞 <strong>학생용 입력 기기</strong>와 사무실 내부 <strong>현황판 기기</strong>를 각각 등록합니다.
            기기에서 호출 사이트를 연 뒤 아래에서 발급한 6자리 코드를 입력하면 등록이 완료되며, 재부팅 후에도 유지됩니다.
          </Alert>

          <Typography variant="h6" fontWeight={600} mb={2}>
            기기 등록 코드 발급
          </Typography>

          {callDepartments.length === 0 ? (
            <Typography color="text.secondary">
              등록된 부서가 없습니다. 교직원 관리 탭에서 교원별 부서를 먼저 입력해 주세요.
            </Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 3 }}>
                <FormControl sx={{ minWidth: 150 }}>
                  <InputLabel>부서</InputLabel>
                  <Select
                    value={pairDepartment}
                    label="부서"
                    onChange={e => setPairDepartment(e.target.value)}
                  >
                    {callDepartments.map(o => (
                      <MenuItem key={o} value={o}>{o}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl sx={{ minWidth: 180 }}>
                  <InputLabel>기기 유형</InputLabel>
                  <Select
                    value={pairDeviceType}
                    label="기기 유형"
                    onChange={e => setPairDeviceType(e.target.value)}
                  >
                    <MenuItem value="input">학생용 입력 기기</MenuItem>
                    <MenuItem value="display">사무실 현황판</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  variant="contained"
                  onClick={issuePairingCode}
                  disabled={issuingCode}
                >
                  {issuingCode ? '발급 중...' : '코드 발급'}
                </Button>
              </Box>

              {issuedCode && (
                <Card sx={{ maxWidth: 460, bgcolor: '#eff6ff', borderColor: '#bfdbfe', mb: 3 }}>
                  <CardContent>
                    <Typography variant="body2" color="primary.dark" gutterBottom>
                      {issuedCode.department} · {issuedCode.deviceType === 'display' ? '사무실 현황판' : '학생용 입력 기기'}
                    </Typography>
                    <Typography
                      variant="h2"
                      fontWeight={800}
                      letterSpacing="0.4rem"
                      color="primary.dark"
                      sx={{ my: 1 }}
                    >
                      {issuedCode.code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      10분 내 기기에서 입력하세요 (만료: {new Date(issuedCode.expiresAt).toLocaleTimeString('ko-KR')})
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {callDepartments.length > 0 && (
            <Box sx={{ mt: 5 }}>
              <Typography variant="h6" fontWeight={600} mb={2}>
                최근 호출 내역
              </Typography>

              {recentCalls.length === 0 ? (
                <Typography color="text.secondary">호출 기록이 없습니다.</Typography>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>시각</th>
                      <th style={styles.th}>부서</th>
                      <th style={styles.th}>학생</th>
                      <th style={styles.th}>호출 대상</th>
                      <th style={styles.th}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCalls.map(c => (
                      <tr key={c.id}>
                        <td style={styles.td}>
                          {c.createdAt?.toDate?.().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—'}
                        </td>
                        <td style={styles.td}>{c.department || '—'}</td>
                        <td style={styles.td}>{c.grade}-{c.classNo}-{c.number} {c.studentName}</td>
                        <td style={styles.td}>{c.teacherName || '—'}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.roleBadge,
                            backgroundColor: CALL_STATUS_STYLE[c.status]?.bg || '#f0f0f0',
                            color: CALL_STATUS_STYLE[c.status]?.color || '#555',
                          }}>
                            {CALL_STATUS_STYLE[c.status]?.label || c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Box>
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
}
