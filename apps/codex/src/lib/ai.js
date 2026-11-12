/**
 * AI 답변 — Cloud Function askRegulation(functions/regulationAi.js)을 부른다.
 * 근거 찾기는 서버가 같은 색인에서 다시 한다(브라우저가 보낸 글을 근거로 믿지 않는다). 브라우저가 찾은 조문 id는 힌트로만 보낸다.
 * 함수가 아직 배포되지 않았거나 키가 없으면 안내 문구로 바꿔 던진다.
 */
import { httpsCallable } from 'firebase/functions'
import { functions } from '@shared/lib/firebase'

export async function askRegulationAi(schoolId, question, sources = []) {
  try {
    const { data } = await httpsCallable(functions, 'askRegulation', { timeout: 60_000 })({
      schoolId,
      question,
      hints: sources.slice(0, 8).map((s) => ({ r: s.r, n: s.n })),
    })
    return data // { answer, sources: [{ r, n, a, p, t, title }] }
  } catch (e) {
    const code = e?.code || ''
    if (code.includes('not-found') || code.includes('unimplemented') || code.includes('internal') && /not found/i.test(e.message)) throw new Error('AI 답변 기능이 아직 준비되지 않았습니다. 위 조문 링크로 원문을 확인해 주세요.')
    if (code.includes('resource-exhausted')) throw new Error('오늘 AI 답변 횟수를 다 썼습니다. 내일 다시 이용해 주세요.')
    if (code.includes('failed-precondition')) throw new Error(e.message || 'AI 답변이 설정되지 않았습니다.')
    throw new Error(e?.message || 'AI 답변을 받지 못했습니다.')
  }
}
