/**
 * 데스크톱 설치 현황 보고 — 실행 중인 Electron 클라이언트가 자기 버전을
 * desktopClients/{uid}에 기록한다.
 *
 * 자동 업데이트(electron-updater)는 0.1.7부터 들어갔다. 그 이전 버전은 업데이트를
 * 확인하러 가지도 않으므로 영원히 옛 버전에 머문다 — 누가 아직 구버전인지 알아야
 * 수동 재설치를 안내할 수 있고, 그 명단을 만드는 것이 이 훅의 목적이다.
 *
 * 감지 조건이 useDesktopPresence.js와 다르다. 저쪽은 onPresenceStatus(0.1.6 신설)를 보지만
 * 여기서는 version만 본다 — onPresenceStatus로 판정하면 정작 찾아야 할 0.1.5 이하가
 * 통째로 안 잡힌다. version은 0.1.0부터 노출돼 있다.
 *
 * 일반 브라우저(window.smartOfficeDesktop 없음)에서는 완전히 no-op.
 */
import { useEffect, useRef } from 'react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

// 렌더러는 트레이 상주로 며칠씩 살아 있어 마운트 때 한 번만 쓰면 '마지막 목격'이
// 실제와 벌어진다. 그렇다고 자주 쓸 것도 아니라 6시간으로 둔다.
const HEARTBEAT_MS = 6 * 60 * 60 * 1000

function desktopVersion() {
  if (typeof window === 'undefined') return null
  const v = window.smartOfficeDesktop?.version
  return typeof v === 'string' && v ? v : null
}

export default function useDesktopClientReport() {
  const { user, schoolId } = useAuth()
  // 같은 세션에서 firstSeenAt을 매번 다시 읽지 않도록 첫 쓰기 여부를 기억한다.
  const seededRef = useRef(false)

  useEffect(() => {
    const version = desktopVersion()
    if (!version || !schoolId || !user) return undefined

    const ref = doc(db, ...schoolPath(schoolId, COL.DESKTOP_CLIENTS), user.uid)
    let alive = true

    const report = async () => {
      try {
        // firstSeenAt은 처음 만들 때만 넣는다(merge 쓰기가 매번 덮으면 '언제부터 쓰는지'가 사라진다).
        let first = false
        if (!seededRef.current) {
          first = !(await getDoc(ref)).exists()
          if (!alive) return
          seededRef.current = true
        }
        await setDoc(
          ref,
          {
            uid: user.uid,
            version,
            platform: window.navigator?.platform || 'unknown',
            ...(first ? { firstSeenAt: serverTimestamp() } : {}),
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      } catch {
        // 보고 실패는 조용히 넘어간다 — 설치 현황은 참고용이고, 여기서 뜬 오류가
        // 교사 화면을 방해할 이유가 없다. 다음 주기에 다시 시도한다.
      }
    }

    report()
    const timer = setInterval(report, HEARTBEAT_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [schoolId, user])
}
