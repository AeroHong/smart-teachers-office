/**
 * StudentHub(학적·고사 관리) — 같은 Firebase 프로젝트를 쓰는 별도 앱(C:\Claude code\StudentHub).
 *
 * 호스팅 사이트가 달라 로그인 세션이 공유되지 않는다. 그래서 여기서 issueHubHandoffToken으로
 * 본인 uid의 custom token을 받아 #token=…으로 넘기고, StudentHub가 그 토큰으로 로그인한다
 * (functions/studentHub.js). 실패하면 그냥 StudentHub 로그인 화면으로 보낸다.
 */
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

export const STUDENT_HUB_URL = import.meta.env.VITE_STUDENT_HUB_URL || 'https://smart-studenthub.web.app'

/**
 * @param {string} [next] StudentHub 안에서 열 경로(예: '/enrollment')
 */
export async function openStudentHub(next = '/') {
  try {
    const { data } = await httpsCallable(functions, 'issueHubHandoffToken')()
    const hash = new URLSearchParams({ token: data.token, next }).toString()
    window.location.assign(`${STUDENT_HUB_URL}/auth/handoff#${hash}`)
  } catch (e) {
    console.error('StudentHub 자동 로그인 토큰 발급 실패:', e)
    window.location.assign(`${STUDENT_HUB_URL}/login`)
  }
}
