/**
 * 같은 Firebase 프로젝트를 쓰는 별도 앱으로 재로그인 없이 넘어가기.
 *  · StudentHub(학적 관리) — C:\Claude code\StudentHub
 *  · ExamCore(고사 업무) — C:\Claude code\ExamCore (2026-10, StudentHub의 고사 기능을 옮겼다)
 *
 * 호스팅 사이트가 달라 로그인 세션이 공유되지 않는다. 그래서 여기서 issueHubHandoffToken으로
 * 본인 uid의 custom token을 받아 #token=…으로 넘기고, 받는 앱이 그 토큰으로 로그인한다
 * (functions/studentHub.js). 실패하면 그 앱의 로그인 화면으로 보낸다.
 */
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

export const STUDENT_HUB_URL = import.meta.env.VITE_STUDENT_HUB_URL || 'https://smart-studenthub.web.app'
export const EXAM_CORE_URL = import.meta.env.VITE_EXAM_CORE_URL || 'https://smart-examcore.web.app'

/**
 * @param {string} appUrl 받는 앱 주소
 * @param {string} [next] 그 앱 안에서 열 경로(예: '/enrollment')
 */
export async function openApp(appUrl, next = '/') {
  try {
    const { data } = await httpsCallable(functions, 'issueHubHandoffToken')()
    const hash = new URLSearchParams({ token: data.token, next }).toString()
    window.location.assign(`${appUrl}/auth/handoff#${hash}`)
  } catch (e) {
    console.error('자동 로그인 토큰 발급 실패:', e)
    window.location.assign(`${appUrl}/login`)
  }
}

export const openStudentHub = (next = '/') => openApp(STUDENT_HUB_URL, next)
export const openExamCore = (next = '/') => openApp(EXAM_CORE_URL, next)
