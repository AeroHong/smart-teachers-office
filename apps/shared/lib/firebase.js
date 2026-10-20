import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

// 교내 무선망이 *.firebaseapp.com을 DNS에서 막아(127.0.0.1로 응답) 구글 로그인
// 팝업이 인증 핸들러를 못 열고 auth/cancelled-popup-request로 실패했다
// (2026-10-20, 사용자 신고). 우리 호스팅 사이트(*.web.app)는 모두 같은 프로젝트라
// /__/auth/handler를 스스로 제공하므로, 접속한 사이트 자신을 authDomain으로 쓴다.
// 로컬 개발(localhost) 등 그 밖의 환경은 기존 env 값을 그대로 쓴다.
const authDomain = typeof window !== 'undefined' && window.location.hostname.endsWith('.web.app')
  ? window.location.hostname
  : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, 'asia-northeast3')
