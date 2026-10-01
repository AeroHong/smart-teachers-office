/**
 * 캔버스 공개 링크 — "링크가 있는 누구나 보기"(2026-10-01).
 *
 * 원본 글(requests)은 그대로 교직원 규칙 아래 두고, 공개용 사본을 최상위
 * publicCanvases/{token}에 따로 둔다. 원본 문서에는 대상자 명단(targetUids·targetNames)·
 * 완료 기록 같은 교내 정보가 함께 있어서, 원본 읽기를 바깥에 여는 대신 보여줄 것만 담은
 * 사본을 만든다. 사본은 서버 트리거(functions/publicCanvasSync.js)만 쓰고, 클라이언트는
 * 원본의 publicShare 필드만 켜고 끈다 — 그래서 끄면 사본이 지워져 링크가 즉시 막히고,
 * 글을 고치면 사본도 자동으로 따라간다.
 *
 * 토큰은 추측할 수 없는 무작위 32자. 규칙은 단건 조회(get)만 열고 목록(list)은 막아,
 * 토큰을 모르면 공개된 캔버스가 있는지조차 알 수 없다.
 */
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { COL, schoolPath } from './schema'

export const PUBLIC_CANVASES = 'publicCanvases'

// 데스크톱 앱(Electron)도 이 주소를 그대로 띄우므로 보통은 location.origin이 맞다. 혹시
// http(s)가 아닌 곳에서 열렸을 때만 대시보드 호스팅 주소로 떨어진다.
const DASHBOARD_URL = 'https://smart-school-dashboard.web.app'

function newShareToken() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function publicShareUrl(token) {
  const origin = /^https?:/.test(window.location.protocol) ? window.location.origin : DASHBOARD_URL
  return `${origin}/share/${token}`
}

/** 공개 링크를 켠다. 이미 켜져 있으면 기존 토큰(=기존 링크)을 그대로 쓴다. */
export async function enablePublicShare({ schoolId, requestId, uid, existing }) {
  if (existing?.token) return existing.token
  const token = newShareToken()
  await updateDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId), {
    publicShare: { token, enabledBy: uid, enabledAt: serverTimestamp() },
  })
  return token
}

/** 공개 링크를 끈다 — 트리거가 사본을 지워 기존 링크가 바로 막힌다. 다시 켜면 새 링크가 생긴다. */
export async function disablePublicShare({ schoolId, requestId }) {
  await updateDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId), { publicShare: null })
}

/** 로그인 없이 공개 사본을 읽는다. 없거나 꺼졌으면 null. */
export async function loadPublicCanvas(token) {
  const snap = await getDoc(doc(db, PUBLIC_CANVASES, token))
  return snap.exists() ? snap.data() : null
}
