import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import Fab from '@mui/material/Fab'
import AddIcon from '@mui/icons-material/Add'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import TaskModal from '../components/TaskModal'
import { getDisplayStatus, getStatusColor, formatDueDate, sortByDueDate } from '../lib/taskUtils'

export default function MyTasks() {
  const { user, schoolId } = useAuth()
  const [tasksById, setTasksById] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!schoolId || !user) return
    const tasksRef = collection(db, 'schools', schoolId, 'tasks')

    const merge = (snap) => {
      setTasksById((prev) => {
        const next = { ...prev }
        snap.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            delete next[change.doc.id]
          } else {
            next[change.doc.id] = { id: change.doc.id, ...change.doc.data() }
          }
        })
        return next
      })
    }

    const unsubPublic = onSnapshot(query(tasksRef, where('visibility', '==', '전체공개')), merge)
    const unsubCreated = onSnapshot(query(tasksRef, where('createdBy', '==', user.uid)), merge)
    const unsubAssigned = onSnapshot(query(tasksRef, where('assignees', 'array-contains', user.uid)), merge)

    return () => {
      unsubPublic()
      unsubCreated()
      unsubAssigned()
    }
  }, [schoolId, user])

  const tasks = useMemo(() => sortByDueDate(Object.values(tasksById)), [tasksById])

  const toggleDone = async (task, e) => {
    e.stopPropagation()
    const nextStatus = task.status === '완료' ? '진행중' : '완료'
    await updateDoc(doc(db, 'schools', schoolId, 'tasks', task.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    })
  }

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 880, mx: 'auto' }}>
        {tasks.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Typography fontSize="2.5rem" mb={1}>📋</Typography>
            <Typography color="text.secondary">아직 등록된 업무가 없습니다.</Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {tasks.map((task) => {
            const color = getStatusColor(task)
            const expanded = expandedId === task.id
            return (
              <Card
                key={task.id}
                onClick={() => setExpandedId(expanded ? null : task.id)}
                sx={{ p: 2, cursor: 'pointer' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    checked={task.status === '완료'}
                    onClick={(e) => toggleDone(task, e)}
                  />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography
                      fontWeight={600}
                      sx={{ textDecoration: task.status === '완료' ? 'line-through' : 'none', color: task.status === '완료' ? 'text.secondary' : 'text.primary' }}
                      noWrap
                    >
                      {task.title}
                    </Typography>
                    {task.dueDate && (
                      <Typography variant="body2" color="text.secondary">
                        {formatDueDate(task.dueDate)} 마감
                      </Typography>
                    )}
                  </Box>
                  <Chip size="small" label={color.label} sx={{ bgcolor: color.bg, color: color.fg, fontWeight: 600 }} />
                </Box>

                <Collapse in={expanded}>
                  <Box sx={{ pl: 6, pt: 1.5 }}>
                    {task.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>
                        {task.description}
                      </Typography>
                    )}
                    {task.assigneeNames?.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        담당자: {task.assigneeNames.join(', ')}
                      </Typography>
                    )}
                    {task.priority && (
                      <Typography variant="body2" color="text.secondary">우선순위: {task.priority}</Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {task.visibility === '전체공개' ? '전체공개' : '개인 업무'} · {task.createdByName}
                    </Typography>
                  </Box>
                </Collapse>
              </Card>
            )
          })}
        </Box>
      </Box>

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
