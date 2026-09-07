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
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { effectivePresence } from '@shared/lib/presence'

export default function usePresenceMap() {
  const { schoolId } = useAuth()
  const [map, setMap] = useState({})

  useEffect(() => {
    if (!schoolId) return undefined
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.PRESENCE)),
      (snap) => {
        const next = {}
        snap.docs.forEach((d) => { next[d.id] = effectivePresence(d.data()) })
        setMap(next)
      },
      () => {},
    )
  }, [schoolId])

  return map
}
