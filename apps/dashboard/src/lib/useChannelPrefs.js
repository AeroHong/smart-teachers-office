/**
 * 채널 개인화 설정 읽기·쓰기 — 즐겨찾기·섹션·접힘 상태.
 *
 * users/{uid}.channelPrefs 하나에 담는다. 학교 데이터가 아니라 내 취향이라 schools/ 아래에
 * 두지 않았고, 본인 문서는 규칙에서 이미 자기가 고칠 수 있어 firestore.rules를 건드리지
 * 않는다(role·schoolId만 안 바뀌면 통과한다).
 *
 * 구독으로 읽는 이유: 같은 사람이 사무실 PC와 데스크톱 앱을 함께 켜두는 일이 흔하다.
 * 한쪽에서 즐겨찾기를 바꿨는데 다른 쪽이 옛 목록을 들고 있으면, 다음에 그쪽에서 뭔가를
 * 바꾸는 순간 먼저 한 변경이 통째로 덮인다.
 *
 * 낙관적 갱신을 따로 하지 않는다. Firestore가 쓰기를 로컬 스냅샷에 먼저 반영하므로
 * (latency compensation) onSnapshot이 서버 왕복 전에 이미 새 값을 준다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { USERS } from '@shared/lib/schema'
import { normalizePrefs } from '@shared/lib/channelPrefs'

export default function useChannelPrefs() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState(() => normalizePrefs(null))
  const [loaded, setLoaded] = useState(false)

  // 연달아 두 번 누를 때(즐겨찾기 → 바로 섹션 이동) 두 번째가 첫 번째 이전 값에서
  // 출발하면 첫 변경이 사라진다. 화면 상태와 별개로 최신 값을 여기에 붙잡아 둔다.
  const latest = useRef(prefs)

  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(
      doc(db, USERS, user.uid),
      (snap) => {
        const next = normalizePrefs(snap.data()?.channelPrefs)
        latest.current = next
        setPrefs(next)
        setLoaded(true)
      },
      // 실패해도 화면은 기본값(설정 없음)으로 그대로 쓸 수 있다. 사이드바가 통째로
      // 비어 보이는 것보다 낫다.
      () => setLoaded(true),
    )
  }, [user])

  /**
   * 순수 변환 함수를 적용해 저장한다.
   * @param {(prefs: object) => object} fn channelPrefs.js의 조작 함수
   */
  const update = useCallback(async (fn) => {
    if (!user) return
    const next = normalizePrefs(fn(latest.current))
    latest.current = next
    setPrefs(next)
    // merge를 쓰는 이유: users 문서에는 dashboardLayout·lastSeen_* 등 다른 개인 설정이
    // 함께 산다. 통째로 쓰면 그것들이 지워진다.
    await setDoc(doc(db, USERS, user.uid), { channelPrefs: next }, { merge: true })
  }, [user])

  return { prefs, loaded, update }
}
