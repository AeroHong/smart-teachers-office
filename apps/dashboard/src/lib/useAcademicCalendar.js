/**
 * 학사일정 — 전체를 시간순으로 가공해 반환한다.
 *
 * useHomeFeed.js에서 분리했다(2026-08-25, 홈 재구성 — useMyRequests.js 주석 참고).
 * 홈 사이드바 한 조각이 아니라 자기 레일 자리(`/calendar`)를 가지므로 독립시켰다.
 *
 * "다가오는 N건"으로 거르던 것을 이 훅에서 뺐다(2026-08-27, 구글 캘린더 동기화 +
 * 월 캘린더 그리드 도입) — 그리드는 지난 달도 넘겨볼 수 있어야 해서 미래 일정만
 * 남기면 안 된다. 필요한 화면(AcademicCalendar.jsx의 "다가오는 일정" 목록)이 알아서
 * 다시 거른다.
 *
 * FETCH_LIMIT을 200→500으로 올렸다 — 구글 캘린더 동기화가 반복 일정을 낱개로 펼쳐서
 * (singleEvents) 들여오면 200건을 금방 넘길 수 있다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

const FETCH_LIMIT = 500

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

/**
 * 두 번에 나눠 구독하는 이유 (2026-09-21).
 *
 * 예전에는 컬렉션을 통째로 한 번에 구독했다. 보안 규칙은 "대상자만 보는 항목"을 막고
 * 있다고 믿었지만, 그 조건("visibleToUids가 없으면 누구나")이 **목록 조회에서는 늘 참**이라
 * 실제로는 대상이 아닌 교직원에게도 업무 마감 항목의 제목이 내려갔다(에뮬레이터 실측:
 * 단건 조회는 거부, 목록 조회는 통과). 규칙은 질의를 걸러 주지 않는다 — 질의 자체가
 * "내가 볼 수 있는 것만 달라"고 말해야 한다.
 *
 * 그래서 문서마다 audience를 두고, 전체 공개분과 나를 대상으로 하는 것을 따로 구독해
 * 합친다. 둘 다 단일 필드 조건이라 색인을 따로 만들 필요가 없다.
 */
export default function useAcademicCalendar() {
  const { schoolId, user } = useAuth()
  const [shared, setShared] = useState([])
  const [mine, setMine] = useState([])

  useEffect(() => {
    if (!schoolId) return undefined
    const col = collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR))
    return onSnapshot(
      query(col, where('audience', '==', 'all'), limit(FETCH_LIMIT)),
      snap => setShared(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId])

  useEffect(() => {
    if (!schoolId || !user) { setMine([]); return undefined }
    const col = collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR))
    return onSnapshot(
      query(col, where('audienceUids', 'array-contains', user.uid), limit(FETCH_LIMIT)),
      snap => setMine(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId, user])

  return useMemo(() => {
    // 두 구독이 같은 문서를 줄 수 있다(전체 공개인데 나도 대상인 경우) — id로 한 번 거른다.
    const byId = new Map([...shared, ...mine].map(e => [e.id, e]))
    return [...byId.values()]
      .map(e => ({ ...e, _start: toDate(e.date), _end: toDate(e.endDate) }))
      .filter(e => e._start)
      .sort((a, b) => a._start - b._start)
  }, [shared, mine])
}

/** "다가오는 일정" 목록용 — 오늘(또는 진행 중인 종료일) 이후 `windowDays`일 이내만.
 *  AcademicCalendar.jsx의 사이드바 목록이 쓴다(예전에 이 훅 안에 있던 로직). 예전엔
 *  "최대 12건"으로만 잘랐는데, 학사일정에 항목이 쌓이면서(채널 업무 마감 자동 반영 포함)
 *  몇 달 뒤 일정까지 12건을 채워 보여주는 게 오히려 당장 급한 일을 눈에 안 띄게 만들었다
 *  — 기간(2주) 기준으로 바꾼다. */
export function upcomingEvents(events, windowDays = 14) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today.getTime() + windowDays * 86400000)
  return events.filter(e => (e._end || e._start) >= today && e._start < cutoff)
}
