/**
 * 데스크톱(Electron) 전용 OS 알림 파이프라인
 * — 호출·새 공지·새 요청·새 쪽지·마감임박·다시 알림.
 *
 * window.smartOfficeDesktop(apps/desktop/preload.js가 노출)이 있을 때만 동작한다.
 * apps/dashboard는 일반 브라우저에서도 열리는 공용 웹앱이라, 이 마커가 없으면
 * 완전히 no-op — 일반 사용자에게는 아무 영향이 없다.
 *
 * 창이 포그라운드일 때는 띄우지 않는다 — 이미 화면에 실시간으로 보이는 정보라서
 * 중복 알림이 된다. 재사용: 신규 판정은 CallAlert.jsx의 seenRef 패턴, 마감임박
 * 판정은 workRequests.js의 dueState()를 그대로 쓴다.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { dueState } from '@shared/lib/workRequests'
import { htmlToText } from '@shared/lib/richText'

const DUE_CHECK_INTERVAL_MS = 30 * 60 * 1000

function isDesktop() {
  return typeof window !== 'undefined' && !!window.smartOfficeDesktop
}

// 알림 이력 — 같은 건을 두 번 알리지 않기 위해 문서 id를 localStorage에 남긴다.
//
// 메모리 Set으로는 부족하다. 창을 트레이로 내리면 렌더러가 조여지면서 Firestore
// 연결이 끊겼다 붙기를 반복하는데, 그때 대상이 리셋되며 기존 문서가 다시 'added'로
// 들어온다. first 플래그는 이미 false라 신규로 오인해 같은 쪽지를 30초~1분마다 계속
// 알리게 된다. 앱을 껐다 켜도 이력이 남아야 하므로 저장소에 둔다.
const NOTIFIED_STORE_KEY = 'desktopNotified'
const NOTIFIED_TTL_MS = 14 * 24 * 60 * 60 * 1000

function readNotified() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFIED_STORE_KEY))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

// 표시는 Electron 메인 프로세스에 맡긴다. 렌더러의 웹 Notification은 권한이
// 'granted'여도 Windows에서 토스트가 뜨지 않는 것을 확인했다(show/error 이벤트조차
// 오지 않음). 클릭 시 이동은 route를 넘겨 메인이 창 복원 후 되돌려주는 방식이다.
//
// 포그라운드라 안 띄운 건도 이력에 남긴다 — 화면으로 이미 봤으므로, 나중에 창을
// 숨겼을 때 그 건이 다시 떠오르면 안 된다.
/** 알림 본문에 넣을 내용 앞부분. 서식을 걷어내고 한 줄로 줄인다. */
function previewText(html, max = 80) {
  const text = htmlToText(html).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function notifyOnce(key, title, body, route, { urgent = false, detail, category, actionLabel } = {}) {
  if (!isDesktop()) return

  const store = readNotified()
  if (store[key]) return

  const now = Date.now()
  store[key] = now
  // 상주 앱이라 두면 계속 쌓인다 — 오래된 이력은 버린다.
  Object.entries(store).forEach(([k, at]) => {
    if (now - at > NOTIFIED_TTL_MS) delete store[k]
  })
  try {
    localStorage.setItem(NOTIFIED_STORE_KEY, JSON.stringify(store))
  } catch {
    // 용량 초과 등은 알림을 막을 이유가 못 된다
  }

  if (document.hasFocus()) return
  window.smartOfficeDesktop.notify({ title, body, detail, category, actionLabel, route, urgent })
}

export default function useDesktopNotifications() {
  const { user, schoolId } = useAuth()
  const navigate = useNavigate()
  const requestsRef = useRef([])

  // 알림 클릭 → 메인 프로세스가 창을 복원한 뒤 이동할 경로를 돌려준다.
  useEffect(() => {
    if (!isDesktop()) return
    return window.smartOfficeDesktop.onNavigate?.((route) => {
      if (route) navigate(route)
    })
  }, [navigate])

  // 1) 호출 — CallAlert.jsx와 동일 정책: 대기 중인 건 항상 알림(최초 구독분 포함).
  // 자리를 비운 사이 온 호출도 알려야 해서 첫 스냅샷을 건너뛰지 않는다. 대신 알림
  // 이력으로 중복을 막는다.
  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return
    return onSnapshot(
      query(
        collection(db, 'schools', schoolId, 'callRequests'),
        where('teacherUid', '==', user.uid),
        where('status', '==', 'pending'),
      ),
      (snap) => {
        snap.docs.forEach((d) => {
          const c = d.data()
          notifyOnce(
            `call:${d.id}`,
            '학생이 찾아왔습니다',
            `${c.grade}학년 ${c.classNo}반 ${c.number}번 ${c.studentName || ''} · ${c.office || ''}`,
            '/',
            // 학생이 앞에서 기다리는 상황이라 오래 띄운다. 기본 5초는 잠깐 자리를
            // 비운 사이에 지나가버린다.
            { urgent: true },
          )
        })
      },
      () => {},
    )
  }, [schoolId, user])

  // 2) 새 공지 — 최초 스냅샷은 건너뛰고 added만 (옛 글이 시작할 때마다 쏟아지는 것 방지)
  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return
    let first = true
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'notice'),
      ),
      (snap) => {
        if (first) { first = false; return }
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return
          const r = change.doc.data()
          notifyOnce(`notice:${change.doc.id}`, '새 공지', r.title || '', `/posts/${change.doc.id}`)
        })
      },
      () => {},
    )
  }, [schoolId, user])

  // 3) 새 업무 요청 — useHomeFeed.js와 동일 쿼리(진행 중인 것만)라 기존 색인을 그대로 쓴다.
  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return
    let first = true
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'request'),
        where('status', '==', 'open'),
      ),
      (snap) => {
        if (first) { first = false; return }
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return
          const r = change.doc.data()
          notifyOnce(`request:${change.doc.id}`, '새 업무 요청', r.title || '', `/posts/${change.doc.id}`)
        })
      },
      () => {},
    )
  }, [schoolId, user])

  // 4) 새 쪽지
  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return
    let first = true
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES)),
        where('recipientUid', '==', user.uid),
      ),
      (snap) => {
        if (first) { first = false; return }
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return
          const n = change.doc.data()
          // 제목·보낸 사람·내용 앞부분을 나눠 보여준다. 어떤 쪽지인지 알림만 보고
          // 판단할 수 있어야 앱을 열지 말지 정할 수 있다.
          // 버튼을 누르든 본문을 누르든 답장 작성창까지 데려간다 — Electron이 어느
          // 버튼을 눌렀는지 알려주지 않아 둘을 구분할 수 없다(click 이벤트 하나뿐).
          notifyOnce(
            `message:${change.doc.id}`,
            n.title || '새 쪽지',
            `${n.senderName || ''} 선생님`,
            `/messages/${change.doc.id}?reply=1`,
            { category: '쪽지', detail: previewText(n.content), actionLabel: '답장' },
          )
        })
      },
      () => {},
    )
  }, [schoolId, user])

  // 5) 마감임박 — 문서 추가 이벤트가 아니라 "시간이 지나며 성립하는 상태"라 타이머로 점검.
  // 열린 요청 목록은 3)과 같은 쿼리로 최신 상태를 유지만 해두고(알림은 안 띄움),
  // dueState()로 판정한다.
  const checkDueSoon = useCallback(() => {
    const todayKey = new Date().toISOString().slice(0, 10)
    requestsRef.current.forEach((r) => {
      const { state, label } = dueState(r)
      if (state !== 'today' && state !== 'soon' && state !== 'overdue') return
      // 지난 건을 '마감임박'이라 부르면 말이 안 맞는다. 상태 그대로 알린다.
      // (label은 dueState가 준다 — '오늘까지', 'D-2', '3일 지남')
      const title = state === 'overdue' ? '마감 지남' : '마감임박'
      // 날짜를 키에 넣어 같은 요청을 하루에 한 번만 알린다
      // (타이머가 반복 실행되고 스냅샷마다 다시 판정하므로 필요)
      notifyOnce(`due:${r.id}:${todayKey}`, title, `${r.title || ''} · ${label}`, `/posts/${r.id}`)
    })
  }, [])

  // 6) 다시 알림 — 담당자가 미완료자에게 다시 알리면 요청에 remindedAt이 찍힌다
  // (requestActions.js의 remindPending). 그 변경을 보고 알린다. 같은 구독을 쓴다.
  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return
    let first = true
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'request'),
        where('status', '==', 'open'),
      ),
      (snap) => {
        requestsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

        // 최초 스냅샷은 건너뛴다 — 예전에 받은 '다시 알림'이 앱을 켤 때마다 되살아나면 안 된다.
        if (!first) {
          snap.docChanges().forEach((change) => {
            if (change.type !== 'modified') return
            const r = change.doc.data()
            // 시각을 키에 넣어 새로 누른 건만 알린다. 다른 이유로 문서가 바뀐 경우엔
            // remindedAt이 그대로라 키가 같아 이력에 막힌다.
            const at = r.remindedAt?.toMillis?.()
            if (!at) return
            notifyOnce(`remind:${change.doc.id}:${at}`, '다시 알림', r.title || '', `/posts/${change.doc.id}`)
          })
        }
        first = false

        // 목록이 도착한 직후에 판정한다. 타이머에만 맡기면 앱을 켠 뒤 30분 동안은
        // 오늘 마감인 요청이 있어도 알림이 안 나간다 — 최초 점검이 구독 응답보다
        // 먼저 끝나기 때문이다. 중복은 알림 이력이 막아준다.
        checkDueSoon()
      },
      () => {},
    )
  }, [schoolId, user, checkDueSoon])

  // 날짜가 넘어가거나 마감이 다가오는 것은 문서 변경 없이 성립하므로 타이머도 함께 둔다.
  useEffect(() => {
    if (!isDesktop()) return
    const timer = setInterval(checkDueSoon, DUE_CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [checkDueSoon])
}
