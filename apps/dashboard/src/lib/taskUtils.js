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

// 색 대신 의미(tone)를 돌려준다. 실제 색은 widgetUi의 ToneChip이 테마에서 읽는다.
export function getStatusTone(task) {
  const status = getDisplayStatus(task)
  if (status === '완료') return { tone: 'neutral', label: '완료' }
  if (status === '지연') return { tone: 'danger', label: '지연' }
  return { tone: 'info', label: status }
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
