import { auth } from '@shared/lib/firebase'

// Python Cloud Function(functions-python: sectioning_solve). 계산이 길어(최대 5분) onCall 대신 HTTP로 부른다.
const BASE = `https://asia-northeast3-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`

async function post(body, signal) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('로그인이 필요합니다.')
  return fetch(`${BASE}/sectioning_solve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * mode: 'solve' | 'diagnose' | 'alternatives'. data: toSolverInput() 결과
 * onEvent가 있으면 진행 로그를 실시간으로 받는다({type: info|raw|solution|done|warn, text, ...}).
 * 반환: 솔버 응답 JSON
 */
export async function callSolver(mode, data, signal, onEvent = null, extra = {}) {
  const res = await post({ mode, data, stream: !!onEvent, ...extra }, signal)
  if (!res.ok) {
    let body = null
    try { body = await res.json() } catch { /* 본문 없음 */ }
    throw new Error(body?.error || `배정 서버 오류(${res.status})`)
  }
  if (!onEvent) return res.json()

  // NDJSON 스트림: 한 줄에 이벤트 하나, 마지막에 {type:'result'}
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let ev
      try { ev = JSON.parse(line) } catch { continue }
      if (ev.type === 'tick') continue
      if (ev.type === 'result') { result = ev.data; continue }
      if (ev.type === 'error') throw new Error(ev.error)
      onEvent(ev)
    }
  }
  if (!result) throw new Error('배정 서버 연결이 끊겼습니다. 다시 시도해 주세요.')
  return result
}
