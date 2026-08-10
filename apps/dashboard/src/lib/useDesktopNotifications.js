/**
 * 데스크톱(Electron) 전용 OS 알림 파이프라인 — 호출·새 공지·새 요청·새 쪽지·마감임박.
 *
 * window.smartOfficeDesktop(apps/desktop/preload.js가 노출)이 있을 때만 동작한다.
 * apps/dashboard는 일반 브라우저에서도 열리는 공용 웹앱이라, 이 마커가 없으면
 * 완전히 no-op — 일반 사용자에게는 아무 영향이 없다.
 *
 * 창이 포그라운드일 때는 띄우지 않는다 — 이미 화면에 실시간으로 보이는 정보라서
 * 중복 알림이 된다. 재사용: 신규 판정은 CallAlert.jsx의 seenRef 패턴, 마감임박
 * 판정은 workRequests.js의 dueState()를 그대로 쓴다.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { dueState } from '@shared/lib/workRequests'

const DUE_CHECK_INTERVAL_MS = 30 * 60 * 1000

function isDesktop() {
  return typeof window !== 'undefined' && !!window.smartOfficeDesktop
}

function notify(title, body, onClick) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (document.hasFocus()) return
  const n = new Notification(title, { body })
  if (onClick) n.onclick = onClick
}

export default function useDesktopNotifications() {
  const { user, schoolId } = useAuth()
  const navigate = useNavigate()
  const requestsRef = useRef([])

  const goto = (path) => () => {
    window.smartOfficeDesktop?.focusWindow?.()
    navigate(path)
  }

  // 알림 권한 요청 (데스크톱에서만) — Electron 메인 프로세스가 'notifications'만
  // 자동 허용하도록 이미 설정돼 있다 (apps/desktop/main.js).
  useEffect(() => {
    if (!isDesktop()) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // 1) 호출 — CallAlert.jsx와 동일 정책: 대기 중인 건 항상 알림(최초 구독분 포함).
  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return
    const seen = new Set()
    return onSnapshot(
      query(
        collection(db, 'schools', schoolId, 'callRequests'),
        where('teacherUid', '==', user.uid),
        where('status', '==', 'pending'),
      ),
      (snap) => {
        snap.docs.forEach((d) => {
          if (seen.has(d.id)) return
          seen.add(d.id)
          const c = d.data()
          notify(
            '학생이 찾아왔습니다',
            `${c.grade}학년 ${c.classNo}반 ${c.number}번 ${c.studentName || ''} · ${c.office || ''}`,
            goto('/'),
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
          notify('새 공지', r.title || '', goto(`/posts/${change.doc.id}`))
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
          notify('새 업무 요청', r.title || '', goto(`/posts/${change.doc.id}`))
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
          notify('새 쪽지', `${n.senderName || ''} · ${n.title || ''}`, goto('/messages'))
        })
      },
      () => {},
    )
  }, [schoolId, user])

  // 5) 마감임박 — 문서 추가 이벤트가 아니라 "시간이 지나며 성립하는 상태"라 타이머로 점검.
  // 열린 요청 목록은 3)과 같은 쿼리로 최신 상태를 유지만 해두고(알림은 안 띄움),
  // 점검 타이머에서 dueState()로 판정한다.
  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'request'),
        where('status', '==', 'open'),
      ),
      (snap) => { requestsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })) },
      () => {},
    )
  }, [schoolId, user])

  useEffect(() => {
    if (!isDesktop()) return
    const checkDueSoon = () => {
      const todayKey = new Date().toISOString().slice(0, 10)
      requestsRef.current.forEach((r) => {
        const { state, label } = dueState(r)
        if (state !== 'today' && state !== 'soon') return
        // 같은 요청을 하루에 한 번만 알림 (30분 간격 타이머가 반복 실행되므로 필요)
        const storageKey = `desktopNotifiedDue:${r.id}:${todayKey}`
        if (localStorage.getItem(storageKey)) return
        localStorage.setItem(storageKey, '1')
        notify('마감임박', `${r.title || ''} · ${label}`, goto(`/posts/${r.id}`))
      })
    }
    checkDueSoon()
    const timer = setInterval(checkDueSoon, DUE_CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])
}
