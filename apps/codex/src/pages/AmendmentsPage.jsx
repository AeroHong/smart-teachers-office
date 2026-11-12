import { Link as RouterLink } from 'react-router-dom'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useAuth } from '@shared/contexts/AuthContext'
import AdminFrame from '../components/AdminFrame'
import { useAmendments } from '../lib/data'
import { useRegulationRole } from '../lib/useRegulationRole'
import { fmtDate } from './Home'

export const STATUS = {
  draft: { label: '작성 중', color: 'default' },
  review: { label: '검토 요청', color: 'warning' },
  applied: { label: '확정', color: 'success' },
  discarded: { label: '폐기', color: 'default' },
}

/** 개정안 목록 — 담당자·관리자·교장 */
export default function AmendmentsPage() {
  const { schoolId } = useAuth()
  const { canEdit } = useRegulationRole()
  const { list, loading } = useAmendments(schoolId, { enabled: canEdit })
  return (
    <AdminFrame title="개정안" need="edit" back="/">
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        개정안은 규정 화면의 「개정안 만들기」로 시작합니다. 작성 → 검토 요청 → 관리자 확정 순서이고, 확정하면 현행 규정이 바뀌고 연혁에 남습니다.
      </Typography>
      {loading ? <CircularProgress /> : !list.length ? <Typography>아직 개정안이 없습니다.</Typography> : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>상태</TableCell><TableCell>개정안</TableCell><TableCell>시행일</TableCell><TableCell>만든 사람</TableCell><TableCell>마지막 수정</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id} hover component={RouterLink} to={`/amendments/${a.id}`} sx={{ textDecoration: 'none' }}>
                  <TableCell><Chip size="small" label={STATUS[a.status]?.label || a.status} color={STATUS[a.status]?.color || 'default'} /></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={700}>{a.title}</Typography></TableCell>
                  <TableCell>{fmtDate(a.effectiveDate)}</TableCell>
                  <TableCell>{a.createdByName}</TableCell>
                  <TableCell>{a.updatedByName} {a.updatedAt?.toDate ? a.updatedAt.toDate().toLocaleString('ko-KR') : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </AdminFrame>
  )
}
