/**
 * 데스크톱 설치 현황 (관리자)
 *
 * 전 교직원 배포를 앞두고 "누가 무엇을 깔았는가"를 볼 곳이 없었다. 특히 0.1.7 미만은
 * 자동 업데이트를 확인하러 가지 않아 영원히 옛 버전에 머문다 — 그 명단을 뽑아 수동
 * 재설치를 안내하는 것이 이 화면의 첫 쓰임새다.
 *
 * 구성원 명단(useSchoolMembers)과 맞대어 '미설치'까지 같이 보여준다. 설치한 사람만
 * 나열하면 정작 알아야 할 안 깐 사람이 화면에 없다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import {
  MIN_AUTO_UPDATE_VERSION,
  compareVersions,
  isStale,
  needsManualReinstall,
} from '@shared/lib/desktopClients'
import WorkspaceLayout from '../components/WorkspaceLayout'
import { useToast } from '../components/ToastProvider'
import { formatDateTime, formatRelative } from '../lib/formatTime'
import useSchoolMembers from '../lib/useSchoolMembers'

function SummaryCard({ label, value, tone = 'default', note }) {
  const color = { warn: 'warning.main', bad: 'error.main', good: 'success.main', default: 'text.primary' }[tone]
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 132, flex: '1 1 132px' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2, color }}>{value}</Typography>
      {note && <Typography variant="caption" color="text.secondary">{note}</Typography>}
    </Paper>
  )
}

export default function AdminDesktop() {
  const { schoolId, userName } = useAuth()
  const { members, loading: membersLoading } = useSchoolMembers()
  const toast = useToast()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // '*' = 전체 방송, 그 외에는 지금 요청 중인 uid — 버튼 하나만 로딩 상태가 되게
  // 구분한다(전체·개별을 같은 상태로 두면 하나가 도는 동안 나머지 버튼도 다 잠긴다).
  const [pushingKey, setPushingKey] = useState(null)

  // 배포 직후 10분(웹)·4시간(데스크톱 설치 파일) 자동 확인을 못 기다릴 때 쓴다 —
  // useAppUpdate.js가 schools/{schoolId}.forceUpdateCheckAt 변화를 보고 즉시 재확인한다.
  // targetUid를 주면 그 사람 세션만 반응한다(개별 푸시, 사용자 요청 2026-09-07 —
  // "개별 사용자에 대해 버전이 다른 경우"). 안 주면 항상 null로 명시해 지운다 — 이전에
  // 개별 푸시를 보낸 적이 있으면 그 값이 남아 있어, 다음 "전체" 요청이 그 사람에게만
  // 가는 걸로 잘못 좁혀지기 때문이다. 확인만 강제할 뿐 설치(재시작)는 그대로 각자
  // 눌러야 한다 — 열어둔 문서 작업이 갑자기 끊기면 안 되기 때문(사용자 결정).
  const handleForceUpdateCheck = async (targetUid, targetName) => {
    setPushingKey(targetUid || '*')
    try {
      await updateDoc(doc(db, 'schools', schoolId), {
        forceUpdateCheckAt: serverTimestamp(),
        forceUpdateCheckBy: userName || '',
        forceUpdateCheckTargetUid: targetUid || null,
      })
      toast.success(
        targetUid
          ? `${targetName}님 앱에 업데이트 확인을 요청했습니다.`
          : '접속 중인 모든 앱에 업데이트 확인을 요청했습니다.',
      )
    } catch (e) {
      toast.error('업데이트 확인 요청을 보내지 못했습니다.', e)
    } finally {
      setPushingKey(null)
    }
  }

  // 설치 현황은 실시간으로 볼 이유가 없다(보고 주기가 6시간이다). 화면을 열 때 한 번 읽는다.
  useEffect(() => {
    if (!schoolId) return undefined
    let alive = true
    setLoading(true)
    getDocs(collection(db, ...schoolPath(schoolId, COL.DESKTOP_CLIENTS)))
      .then(snap => {
        if (!alive) return
        setClients(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
        setError(null)
      })
      .catch(e => { if (alive) setError(e) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [schoolId])

  const rows = useMemo(() => {
    const byUid = new Map(clients.map(c => [c.uid, c]))
    const now = Date.now()
    return members
      .map(m => {
        const client = byUid.get(m.uid)
        return {
          uid: m.uid,
          name: m.name || m.uid,
          office: m.office || '',
          client,
          stale: client ? isStale(client, now) : false,
          outdated: client ? needsManualReinstall(client.version) : false,
        }
      })
      // 손을 써야 하는 사람이 위로: 구버전 → 미설치 → 조용함 → 최신, 그 안에서는 이름순
      .sort((a, b) => {
        const rank = r => (r.outdated ? 0 : !r.client ? 1 : r.stale ? 2 : 3)
        return rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko')
      })
  }, [members, clients])

  // 구성원에 없는 uid로 보고된 문서(퇴직·전출 등)도 놓치지 않고 센다.
  const orphanCount = useMemo(() => {
    const known = new Set(members.map(m => m.uid))
    return clients.filter(c => !known.has(c.uid)).length
  }, [members, clients])

  const versionCounts = useMemo(() => {
    const counts = new Map()
    clients.forEach(c => {
      const v = c.version || 'unknown'
      counts.set(v, (counts.get(v) || 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => compareVersions(b[0], a[0]))
  }, [clients])

  const installed = rows.filter(r => r.client).length
  const outdated = rows.filter(r => r.outdated).length
  const missing = rows.filter(r => !r.client).length
  const busy = loading || membersLoading

  return (
    <WorkspaceLayout>
      <Box sx={{ p: 3, maxWidth: 1000 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>데스크톱 설치 현황</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              실행 중인 데스크톱 앱이 스스로 보고한 버전입니다. 앱을 한 번도 실행하지 않았거나
              로그인하지 않은 사람은 &lsquo;미설치&rsquo;로 보입니다.
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Button variant="outlined" size="small" disabled={!!pushingKey} onClick={() => handleForceUpdateCheck(null)}>
              {pushingKey === '*' ? '요청 중…' : '전체에 업데이트 확인 강제'}
            </Button>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, maxWidth: 240 }}>
              접속 중인 앱에 즉시 확인시킵니다. 자동 설치는 안 되고, 아래 표에서 한
              사람에게만 보낼 수도 있습니다.
            </Typography>
          </Box>
        </Box>

        {error && (
          <Typography variant="body2" color="error.main" sx={{ mt: 2 }}>
            설치 현황을 불러오지 못했습니다. 관리자 권한으로 로그인했는지 확인해 주세요.
          </Typography>
        )}

        {busy ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2.5 }}>
              <SummaryCard label="설치됨" value={installed} note={`구성원 ${rows.length}명 중`} />
              <SummaryCard
                label="수동 재설치 필요"
                value={outdated}
                tone={outdated ? 'bad' : 'good'}
                note={`${MIN_AUTO_UPDATE_VERSION} 미만`}
              />
              <SummaryCard label="미설치" value={missing} tone={missing ? 'warn' : 'good'} />
              {orphanCount > 0 && (
                <SummaryCard label="명단 밖 보고" value={orphanCount} note="퇴직·전출 추정" />
              )}
            </Box>

            {outdated > 0 && (
              <Typography variant="body2" sx={{ mt: 2, color: 'error.main' }}>
                {MIN_AUTO_UPDATE_VERSION} 미만은 자동 업데이트를 확인하지 않습니다.
                해당 {outdated}명에게는 최신 설치 파일을 한 번 직접 안내해야 합니다.
              </Typography>
            )}

            {versionCounts.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 2 }}>
                {versionCounts.map(([version, count]) => (
                  <Chip
                    key={version}
                    size="small"
                    label={`${version} · ${count}명`}
                    color={needsManualReinstall(version) ? 'error' : 'default'}
                    variant={needsManualReinstall(version) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2.5 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>이름</TableCell>
                    <TableCell>사무실</TableCell>
                    <TableCell>버전</TableCell>
                    <TableCell>상태</TableCell>
                    <TableCell>마지막 실행</TableCell>
                    <TableCell>처음 설치</TableCell>
                    <TableCell align="center">동작</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.uid} hover>
                      <TableCell>{row.name}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{row.office}</TableCell>
                      <TableCell>{row.client?.version || '—'}</TableCell>
                      <TableCell>
                        {!row.client ? (
                          <Chip size="small" label="미설치" variant="outlined" />
                        ) : row.outdated ? (
                          <Chip size="small" label="수동 재설치 필요" color="error" />
                        ) : row.stale ? (
                          <Chip size="small" label="한동안 실행 안 함" color="warning" variant="outlined" />
                        ) : (
                          <Chip size="small" label="최신" color="success" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {row.client ? formatRelative(row.client.lastSeenAt) : '—'}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {row.client ? formatDateTime(row.client.firstSeenAt) : '—'}
                      </TableCell>
                      <TableCell align="center">
                        {/* 설치 파일 자체가 옛날이라 자동 업데이트를 확인 안 하는
                            사람(row.outdated)은 이 요청을 보내도 반응하지 않는다 —
                            그래도 버튼을 숨기지는 않는다(눌러서 확인해보는 것도 방법). */}
                        {row.client && (
                          <Tooltip title={`${row.name}님 앱에만 지금 확인 요청`}>
                            <span>
                              <IconButton
                                size="small"
                                color={row.outdated || row.stale ? 'warning' : 'default'}
                                disabled={!!pushingKey}
                                onClick={() => handleForceUpdateCheck(row.uid, row.name)}
                              >
                                {pushingKey === row.uid
                                  ? <CircularProgress size={16} />
                                  : <NotificationsActiveOutlinedIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    </WorkspaceLayout>
  )
}
