// 업무분장 화면 끌어 놓기 형식 — 다른 화면(학사일정 등)에서 끈 것과 섞이지 않게 고유 이름
export const DUTY_DRAG = 'application/x-duty-row'     // 업무 줄(성명·담임·업무) — 값: 줄 id
export const TASK_DRAG = 'application/x-duty-task'    // 업무 내용 카드 — 값: 카드 id
export const PERSON_DRAG = 'application/x-duty-person' // 교직원 패널의 사람 — 값: { uid, name, subject } JSON
export const NAME_DRAG = 'application/x-duty-name'     // 표 성명 칸의 이름 카드 — 값: 그 줄 id

export const readPerson = (e) => { try { return JSON.parse(e.dataTransfer.getData(PERSON_DRAG)) } catch { return null } }
export const hasType = (e, type) => [...(e.dataTransfer?.types || [])].includes(type)

/**
 * 카드들 사이 어디에 놓였는지 — 줄바꿈되는 카드 묶음(flex-wrap)에서 커서 앞의 첫 카드 자리.
 * @param {HTMLElement} box 카드를 담은 칸
 * @param {string} selector 카드 선택자
 */
export function dropIndexIn(box, selector, x, y) {
  const items = [...box.querySelectorAll(selector)]
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect()
    if (y < r.top) return i
    if (y <= r.bottom && x < r.left + r.width / 2) return i
  }
  return items.length
}

// ── 이름 카드 끌기 미리보기 ─────────────────────────────────────────
// 두 쪽 보기는 표가 둘이라, 끄는 중인 이름 카드와 놓을 줄을 화면 전체가 함께 봐야 원래 줄(1쪽)과 놓을 줄(2쪽)에
// 동시에 결과를 그릴 수 있다. 작은 저장소 하나를 useSyncExternalStore로 구독한다.
let nameDrag = null // { fromId, name, targetId, targetName, copy }
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
export const nameDragStore = {
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
  get: () => nameDrag,
  start: (fromId, name) => { nameDrag = { fromId, name, targetId: null, targetName: '', copy: false }; emit() },
  over: (targetId, copy, targetName = '') => {
    if (!nameDrag || (nameDrag.targetId === targetId && nameDrag.copy === copy)) return
    nameDrag = { ...nameDrag, targetId, targetName, copy }; emit()
  },
  end: () => { if (nameDrag) { nameDrag = null; emit() } },
}

// ── 업무 내용 카드 끌기 ──────────────────────────────────────────────
// dragover 중에는 dataTransfer 값을 못 읽는다 — 몇 장을 끄는지(교환은 한 장일 때만)와 흐리게 할 카드를 여기서 본다
let taskDrag = null // { ids }
const taskListeners = new Set()
const taskEmit = () => taskListeners.forEach((l) => l())
export const taskDragStore = {
  subscribe: (l) => { taskListeners.add(l); return () => taskListeners.delete(l) },
  get: () => taskDrag,
  start: (ids) => { taskDrag = { ids }; taskEmit() },
  end: () => { if (taskDrag) { taskDrag = null; taskEmit() } },
}
