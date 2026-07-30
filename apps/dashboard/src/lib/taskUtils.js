export function isOverdue(task) {
  if (task.status === '완료' || !task.dueDate) return false
  const due = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)
  return due.getTime() < Date.now()
}

// 화면 표시용 상태: 저장된 status와 무관하게 마감일이 지나면 지연으로 즉시 인지되게 함
export function getDisplayStatus(task) {
  if (task.status === '완료') return '완료'
  if (isOverdue(task)) return '지연'
  return task.status || '진행중'
}

export function getStatusColor(task) {
  const status = getDisplayStatus(task)
  if (status === '완료') return { bg: '#f1f3f4', fg: '#5f6368', label: '완료' }
  if (status === '지연') return { bg: '#fdecea', fg: '#d32f2f', label: '지연' }
  return { bg: '#eef2ff', fg: '#4f46e5', label: status }
}

export function formatDueDate(dueDate) {
  if (!dueDate) return ''
  const date = dueDate.toDate ? dueDate.toDate() : new Date(dueDate)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

export function sortByDueDate(tasks) {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    const aTime = a.dueDate.toDate ? a.dueDate.toDate().getTime() : new Date(a.dueDate).getTime()
    const bTime = b.dueDate.toDate ? b.dueDate.toDate().getTime() : new Date(b.dueDate).getTime()
    return aTime - bTime
  })
}
