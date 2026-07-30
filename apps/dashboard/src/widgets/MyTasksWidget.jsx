import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import AddIcon from '@mui/icons-material/Add'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import TaskModal from '../components/TaskModal'
import { getStatusColor, formatDueDate, sortByDueDate } from '../lib/taskUtils'

export default function MyTasksWidget() {
  const { user, schoolId } = useAuth()
  const [tasksById, setTasksById] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!schoolId || !user) return
    const tasksRef = collection(db, 'schools', schoolId, 'tasks')

    const merge = (snap) => {
      setTasksById(prev => {
        const next = { ...prev }
        snap.docChanges().forEach(change => {
          if (change.type === 'removed') delete next[change.doc.id]
          else next[change.doc.id] = { id: change.doc.id, ...change.doc.data() }
        })
        return next
      })
    }

    const unsubs = [
      onSnapshot(query(tasksRef, where('visibility', '==', '전체공개')), merge),
      onSnapshot(query(tasksRef, where('createdBy', '==', user.uid)), merge),
      onSnapshot(query(tasksRef, where('assignees', 'array-contains', user.uid)), merge),
    ]
    return () => unsubs.forEach(u => u())
  }, [schoolId, user])

  const tasks = useMemo(() => sortByDueDate(Object.values(tasksById)), [tasksById])

  const toggleDone = async (task, e) => {
    e.stopPropagation()
    await updateDoc(doc(db, 'schools', schoolId, 'tasks', task.id), {
      status: task.status === '완료' ? '진행중' : '완료',
      updatedAt: serverTimestamp(),
    })
  }

  return (
    <Box>
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => setModalOpen(true)}
        sx={{ mb: 1.5 }}
      >
        업무 추가
      </Button>

      {tasks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <Typography fontSize="2rem" mb={0.5}>📋</Typography>
          <Typography color="text.secondary" fontSize="0.9rem">아직 등록된 업무가 없습니다.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tasks.map(task => {
            const color = getStatusColor(task)
            const expanded = expandedId === task.id
            return (
              <Box
                key={task.id}
                onClick={() => setExpandedId(expanded ? null : task.id)}
                sx={{
                  p: 1.2, borderRadius: 2, cursor: 'pointer',
                  border: '1px solid #ececf1',
                  transition: 'box-shadow .15s ease, border-color .15s ease',
                  '&:hover': { boxShadow: '0 4px 14px rgba(15,23,42,.07)', borderColor: 'transparent' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    size="small"
                    checked={task.status === '완료'}
                    onClick={(e) => toggleDone(task, e)}
                  />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography
                      fontWeight={600}
                      fontSize="0.95rem"
                      noWrap
                      sx={{
                        textDecoration: task.status === '완료' ? 'line-through' : 'none',
                        color: task.status === '완료' ? 'text.secondary' : 'text.primary',
                      }}
                    >
                      {task.title}
                    </Typography>
                    {task.dueDate && (
                      <Typography variant="caption" color="text.secondary">
                        {formatDueDate(task.dueDate)} 마감
                      </Typography>
                    )}
                  </Box>
                  <Chip size="small" label={color.label} sx={{ bgcolor: color.bg, color: color.fg, fontWeight: 600 }} />
                </Box>

                <Collapse in={expanded}>
                  <Box sx={{ pl: 5.5, pt: 1 }}>
                    {task.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, whiteSpace: 'pre-wrap' }}>
                        {task.description}
                      </Typography>
                    )}
                    {task.assigneeNames?.length > 0 && (
                      <Typography variant="body2" color="text.secondary">담당자: {task.assigneeNames.join(', ')}</Typography>
                    )}
                    {task.priority && (
                      <Typography variant="body2" color="text.secondary">우선순위: {task.priority}</Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {task.visibility === '전체공개' ? '전체공개' : '개인 업무'} · {task.createdByName}
                    </Typography>
                  </Box>
                </Collapse>
              </Box>
            )
          })}
        </Box>
      )}

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Box>
  )
}
