/**
 * 재실 자동 감지 — Electron 메인 프로세스가 보내는 OS 유휴시간 판정을
 * presence/{uid}에 source: 'desktop'으로 기록한다.
 *
 * window.smartOfficeDesktop(apps/desktop/preload.js)이 없으면(일반 브라우저) 완전히
 * no-op — apps/dashboard는 공용 웹앱이라 이 마커가 없는 사용자에게는 영향이 없다.
 */
import { useEffect, useRef } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

// TTL(4시간)보다 훨씬 짧게 잡아, 상태 변화 없이 오래 켜둬도 "확인 안 됨"으로 빠지지 않게 한다.
// 단 이 하트비트는 '재실'을 유지하는 동안에만 보낸다 — 아래 heartbeatDue 참고.
const HEARTBEAT_MS = 10 * 60 * 1000

function isDesktop() {
  return typeof window !== 'undefined' && !!window.smartOfficeDesktop?.onPresenceStatus
}

export default function useDesktopPresence() {
  const { user, schoolId } = useAuth()
  // Firestore에 저장된 현재 status. onSnapshot으로 최신 상태를 유지해, 교사가 직접 고른
  // '수업 중'(busy)을 자동 갱신이 덮어쓰지 않도록 판단하는 데 쓴다(자동은 재실↔자리 비움만).
  const currentStatusRef = useRef(null)
  const readyRef = useRef(false)
  const lastWriteAtRef = useRef(0)

  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return undefined
    readyRef.current = false
    return onSnapshot(
      doc(db, ...schoolPath(schoolId, COL.PRESENCE), user.uid),
      (snap) => {
        currentStatusRef.current = snap.data()?.status || null
        readyRef.current = true
      },
      () => {},
    )
  }, [schoolId, user])

  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return undefined
    const ref = doc(db, ...schoolPath(schoolId, COL.PRESENCE), user.uid)

    return window.smartOfficeDesktop.onPresenceStatus(({ status }) => {
      // 현재 상태(수업 중 여부)를 아직 모르면 섣불리 덮어쓰지 않는다.
      if (!readyRef.current) return
      if (currentStatusRef.current === 'busy') return

      // 하트비트는 '재실'일 때만 보낸다. TTL은 애초에 "퇴근했는데 재실로 남는 것"을 막으려는
      // 장치라, 이미 '자리 비움'이면 만료돼 '확인 안 됨'이 되어도 보이는 뜻이 달라지지 않는다.
      // 반면 야간에 전원이 이 하트비트를 계속 돌리면 대가가 크다 — presence 컬렉션은
      // usePresenceMap.js와 키오스크 CallInput.jsx가 통째로 구독하고 있어서, 쓰기 한 건이
      // 열려 있는 모든 화면에 읽기 한 건씩으로 배달된다(클라이언트 N대면 N²). 아무도 쓰지
      // 않는 밤에 하루 18만 읽기가 찍힌 원인이 이것이었다.
      const changed = status !== currentStatusRef.current
      const heartbeatDue = status === 'available'
        && Date.now() - lastWriteAtRef.current >= HEARTBEAT_MS
      if (!changed && !heartbeatDue) return

      lastWriteAtRef.current = Date.now()
      setDoc(
        ref,
        { uid: user.uid, status, source: 'desktop', lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true },
      ).catch(() => {}) // 자동 갱신 실패는 조용히 넘어간다 — 수동 변경으로 언제든 보정 가능
    })
  }, [schoolId, user])
}
