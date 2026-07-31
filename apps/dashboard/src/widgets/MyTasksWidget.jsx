import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import TaskModal from '../components/TaskModal'
import { EmptyState, ListRow, RowStack, ToneChip, WidgetAction, useWidgetBadge } from '../components/widgetUi'
import { useToast } from '../components/ToastProvider'
import { getStatusTone, formatDueDate, sortByDueDate } from '../lib/taskUtils'

export default function MyTasksWidget() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
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

  // 배지는 아직 끝내지 않은 업무 수 — 완료까지 세면 숫자가 계속 커지기만 해서 의미가 없다
  const openCount = useMemo(() => tasks.filter(t => t.status !== '완료').length, [tasks])
  useWidgetBadge(openCount)

  const toggleDone = async (task, e) => {
    e.stopPropagation()
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'tasks', task.id), {
        status: task.status === '완료' ? '진행중' : '완료',
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      toast.error('업무 상태를 바꾸지 못했습니다.', err)
    }
  }

  return (
    <Box>
      <WidgetAction icon={<AddIcon />} onClick={() => setModalOpen(true)}>
        업무 추가
      </WidgetAction>

      {tasks.length === 0 ? (
        <EmptyState
          emoji="📋"
          message="아직 등록된 업무가 없습니다."
          actionLabel="업무 추가하기"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <RowStack>
          {tasks.map(task => {
            const status = getStatusTone(task)
            const expanded = expandedId === task.id
            const done = task.status === '완료'
            return (
              <ListRow key={task.id} onClick={() => setExpandedId(expanded ? null : task.id)} muted={done}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    size="small"
                    checked={done}
                    onClick={(e) => toggleDone(task, e)}
                  />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography
                      fontWeight={600}
                      fontSize="0.95rem"
                      noWrap
                      sx={{
                        textDecoration: done ? 'line-through' : 'none',
                        color: done ? 'text.secondary' : 'text.primary',
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
                  <ToneChip label={status.label} tone={status.tone} />
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
              </ListRow>
            )
          })}
        </RowStack>
      )}

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Box>
  )
}
