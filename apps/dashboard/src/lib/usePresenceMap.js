/**
 * 학교 전체 재실 상태를 한 번에 구독한다.
 *
 * 디렉터리·구성원 화면에서 사람마다 재실 점을 보여주려는 용도(사용자 요청,
 * 2026-09-07 — "현재 접속 중이고 앱 실행 중인 경우를 알려주는 뭔가"). 카드·목록 줄마다
 * 따로 구독하면 인원수만큼 리스너가 열려 낭비이므로 컬렉션 전체를 한 번만 구독해
 * { uid: 'available'|'busy'|'away' } 맵으로 돌려준다 — 키오스크 CallInput.jsx가 선생님
 * 호출 화면에서 이미 쓰는 것과 같은 방식.
 *
 * 판정(오래된 값은 'unknown' 처리)은 presence.js의 effectivePresence가 한다.
 *
 * 보이는 동안에만 구독한다(2026-09-18). 재실 표시는 보는 사람이 있을 때만 의미가 있는데,
 * 데스크톱 앱은 트레이에 상주하고 브라우저 탭도 열어둔 채 퇴근하므로 "아무도 안 보는 구독"이
 * 대부분이었다. presence 문서 쓰기 한 건은 구독 중인 화면 수만큼 읽기로 청구되므로,
 * 안 보는 화면을 끊는 것만으로 전체 읽기가 구독자 수에 비례해 줄어든다.
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { effectivePresence } from '@shared/lib/presence'

// 잠깐 다른 창을 봤다가 돌아오는 흔한 경우까지 끊었다 붙이면 그때마다 교직원 전원을 다시
// 읽는다(재구독의 첫 스냅샷은 결과셋 전량이 과금된다). 이만큼 안 볼 때만 끊는다.
const HIDE_GRACE_MS = 60 * 1000

export default function usePresenceMap() {
  const { schoolId } = useAuth()
  const [map, setMap] = useState({})

  useEffect(() => {
    if (!schoolId) return undefined
    let unsub = null
    let hideTimer = null

    const start = () => {
      if (unsub) return
      unsub = onSnapshot(
        collection(db, ...schoolPath(schoolId, COL.PRESENCE)),
        (snap) => {
          const next = {}
          snap.docs.forEach((d) => { next[d.id] = effectivePresence(d.data()) })
          setMap(next)
        },
        () => {},
      )
    }

    const stop = () => {
      if (!unsub) return
      unsub()
      unsub = null
    }

    const onVisibility = () => {
      clearTimeout(hideTimer)
      if (document.visibilityState === 'visible') start()
      else hideTimer = setTimeout(stop, HIDE_GRACE_MS)
    }

    // 끊겨 있는 동안의 변화는 못 받지만, 다시 보일 때 받는 첫 스냅샷이 현재 상태 전부라
    // 화면에 보이는 값은 항상 최신이다.
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(hideTimer)
      stop()
    }
  }, [schoolId])

  return map
}
