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

      const changed = status !== currentStatusRef.current
      const heartbeatDue = Date.now() - lastWriteAtRef.current >= HEARTBEAT_MS
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
