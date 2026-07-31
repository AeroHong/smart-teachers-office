import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import Fab from '@mui/material/Fab'
import AddIcon from '@mui/icons-material/Add'
import { alpha } from '@mui/material/styles'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import TaskModal from '../components/TaskModal'
import { getDisplayStatus, getStatusTone, formatDueDate, sortByDueDate, isOverdue } from '../lib/taskUtils'
import { ToneChip } from '../components/widgetUi'

const STICKY_COL_SX = {
  position: 'sticky',
  left: 0,
  bgcolor: 'background.paper',
  zIndex: 1,
  minWidth: 220,
  borderRight: '1px solid #e8eaed',
}

export default function AdminTasks() {
  const { schoolId } = useAuth()
  const [tasks, setTasks] = useState([])
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(collection(db, 'schools', schoolId, 'tasks'), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [schoolId])

  const sortedTasks = useMemo(() => sortByDueDate(tasks), [tasks])

  const teachers = useMemo(() => {
    const map = new Map()
    tasks.forEach((t) => {
      (t.assignees || []).forEach((uid, i) => {
        if (!map.has(uid)) map.set(uid, t.assigneeNames?.[i] || uid)
      })
    })
    return [...map.entries()].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  const completionRate = useMemo(() => {
    if (tasks.length === 0) return null
    const done = tasks.filter((t) => t.status === '완료').length
    return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100) }
  }, [tasks])

  return (
    <DashboardLayout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>업무 현황</Typography>
        {completionRate && (
          <Chip
            label={`전체 완료율 ${completionRate.pct}% (${completionRate.done}/${completionRate.total})`}
            sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 600 }}
          />
        )}
      </Box>

      {tasks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography fontSize="2.5rem" mb={1}>📋</Typography>
          <Typography color="text.secondary">아직 등록된 업무가 없습니다.</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...STICKY_COL_SX, zIndex: 2, fontWeight: 700 }}>업무</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                {teachers.map((t) => (
                  <TableCell key={t.uid} align="center" sx={{ fontWeight: 700, minWidth: 90 }}>
                    {t.name}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedTasks.map((task) => {
                const status = getStatusTone(task)
                const overdue = isOverdue(task)
                return (
                  <TableRow
                    key={task.id}
                    sx={overdue ? theme => ({ bgcolor: alpha(theme.palette.error.main, 0.08) }) : undefined}
                  >
                    <TableCell sx={STICKY_COL_SX}>
                      <Typography fontWeight={600} noWrap>{task.title}</Typography>
                      {task.dueDate && (
                        <Typography variant="caption" color="text.secondary">
                          {formatDueDate(task.dueDate)} 마감
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <ToneChip label={getDisplayStatus(task)} tone={status.tone} />
                    </TableCell>
                    {teachers.map((t) => {
                      const assigned = (task.assignees || []).includes(t.uid)
                      if (!assigned) return <TableCell key={t.uid} align="center">·</TableCell>
                      return (
                        <TableCell key={t.uid} align="center">
                          {task.status === '완료' ? '✅' : '⬜'}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Fab
        color="primary"
        sx={{ position: 'fixed', right: 24, bottom: 24 }}
        onClick={(e) => { e.currentTarget.blur(); setModalOpen(true) }}
      >
        <AddIcon />
      </Fab>

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}
