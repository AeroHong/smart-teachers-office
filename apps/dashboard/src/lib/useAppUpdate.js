/**
 * 새 배포가 올라왔는지 지켜본다.
 *
 * 트레이 상주가 전제인 데스크톱 앱은 아침에 켜고 종일 둔다. 원격 URL을 로드하는 구조라
 * 새로고침 한 번이면 최신이 되는데, 그걸 알릴 방법이 없어 그날 배포한 수정이 다음 날까지
 * 반영되지 않았다(PLAN_dashboardElectron.md "업데이트를 어떻게 전달할 것인가" 참고).
 *
 * 판정은 appVersion.js가 한다 — 여기서는 언제 확인할지와 무엇을 보여줄지만 정한다.
 *
 * ── 언제 확인하나 ────────────────────────────────────────────
 *
 * 10분 간격 + 창이 다시 앞으로 나올 때. 뒤의 것이 실은 더 중요하다. 종일 켜두는 앱에서
 * 사람이 실제로 화면을 보는 순간이 그때이고, 마침 그때가 새로고침을 눌러도 괜찮은
 * 순간이기도 하다(다른 일을 하다 돌아온 참이라 쓰던 글을 잃을 걱정이 적다).
 *
 * index.html은 600바이트 남짓이고 no-cache라 이 정도 주기는 부담이 없다.
 *
 * ── 관리자 강제 확인 (2026-09-07) ──────────────────────────────
 *
 * 급한 수정을 배포했는데 10분(또는 데스크톱 앱은 4시간)을 못 기다리는 경우를 위해,
 * 관리자가 AdminDesktop.jsx에서 누르면 schools/{schoolId}.forceUpdateCheckAt이
 * 갱신된다. 그 값이 바뀌는 걸 보면 여기서도 즉시 재확인하고(웹 배너), 데스크톱 앱이면
 * electron-updater 설치 파일 확인(window.smartOfficeDesktop.checkForUpdates)도 같이
 * 강제한다 — 다만 다운로드된 뒤 설치(재시작)는 기존과 똑같이 사용자가 눌러야 한다
 * (자리 비운 사이 강제 재시작되면 쓰던 문서를 잃을 수 있다, 사용자 결정).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { isOutdated, signatureFrom, signatureFromHtml } from '@shared/lib/appVersion'

const CHECK_INTERVAL_MS = 10 * 60 * 1000

export default function useAppUpdate() {
  const { schoolId, user } = useAuth()
  const [latest, setLatest] = useState(null)     // 서버에 올라와 있는 서명
  const [dismissed, setDismissed] = useState(null)
  const currentRef = useRef('')
  const checkRef = useRef(async () => {})

  useEffect(() => {
    // 개발 서버에는 해시 번들이 없어 판정 자체가 성립하지 않는다. 매번 요청만 나간다.
    if (!import.meta.env.PROD) return undefined

    const current = signatureFrom(
      [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')),
    )
    // 서명을 못 읽으면 아무것도 하지 않는다. 기준이 없으면 무엇과 견주든 헛띄움이다.
    if (!current) return undefined
    currentRef.current = current

    let alive = true
    const check = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        // 쿼리를 붙이는 이유: no-cache 헤더를 두었지만 학교 망의 중간 프록시까지
        // 믿을 수는 없다. 빌드 도구 다운로드가 가로채진 전례가 있다.
        const res = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok || !alive) return
        const next = signatureFromHtml(await res.text())
        if (alive && isOutdated(currentRef.current, next)) setLatest(next)
      } catch {
        // 오프라인·차단 — 다음 차례에 다시 본다. 실패를 알리지 않는다.
      }
    }
    checkRef.current = check

    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    // 창이 다시 앞으로 나올 때가 사람이 실제로 화면을 보는 순간이다.
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)

    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  // 관리자 강제 확인 신호 구독 — 마운트 이후의 "변화"에만 반응한다(처음 값을 그대로
  // 트리거로 보면 화면을 막 열었을 뿐인데도 매번 강제 확인이 도는 꼴이 된다).
  // forceUpdateCheckTargetUid가 있으면(개별 푸시, AdminDesktop.jsx) 그 사람 세션만
  // 반응하고 나머지는 조용히 무시한다 — 없으면(전체 방송) 누구나 반응한다.
  useEffect(() => {
    if (!import.meta.env.PROD || !schoolId) return undefined
    let first = true
    return onSnapshot(doc(db, 'schools', schoolId), (snap) => {
      if (first) { first = false; return }
      const data = snap.data()
      if (!data?.forceUpdateCheckAt) return
      if (data.forceUpdateCheckTargetUid && data.forceUpdateCheckTargetUid !== user?.uid) return
      checkRef.current()
      window.smartOfficeDesktop?.checkForUpdates?.().catch(() => {})
    }, () => {})
  }, [schoolId, user?.uid])

  /**
   * 설치 파일 업데이트가 내려받아져 설치를 기다리는가 (데스크톱 앱 전용, 2026-09-21).
   *
   * 여기까지는 알릴 방법이 윈도우 토스트 하나뿐이었다. 실제로 0.2.3을 밀어 넣은 날
   * 다운로드는 끝났는데(로그 확인) 사람은 알아채지 못했다 — 마침 자리를 비운 참이라
   * 토스트가 알림 센터로 들어가 버렸다(사용자 지적 — "업데이트 알림이 앱 알림창에
   * 나오면 좋겠는데, 안나오네?"). 화면 안에 띠로 띄우면 자리에 돌아왔을 때 보인다.
   *
   * 메인 프로세스가 값을 들고 있다가 물으면 답한다(get-pending-update) — 이 화면이
   * 뜨기 전에 다운로드가 끝났을 수 있어 이벤트만 기다리면 놓친다. 0.2.2 이하의 앱에는
   * 이 통로가 없어 항상 null이다(그 버전은 토스트로만 알린다).
   */
  const [desktopUpdate, setDesktopUpdate] = useState(null)   // { version } | null
  useEffect(() => {
    const desktop = typeof window !== 'undefined' ? window.smartOfficeDesktop : null
    if (!desktop?.getPendingUpdate) return undefined
    let alive = true
    desktop.getPendingUpdate().then((info) => { if (alive && info) setDesktopUpdate(info) }).catch(() => {})
    const off = desktop.onUpdateDownloaded?.((info) => setDesktopUpdate(info))
    return () => { alive = false; off?.() }
  }, [])

  const reload = useCallback(() => { window.location.reload() }, [])
  // 설치는 앱을 다시 시작해야 한다. 실패하면(설치본이 아닌 경우 등) 조용히 넘어가지 않고
  // 띠에 남겨 사용자가 수동 설치로 갈 수 있게 한다(UpdateBanner).
  const installDesktopUpdate = useCallback(
    () => window.smartOfficeDesktop?.quitAndInstall?.() ?? Promise.resolve({ ok: false }),
    [],
  )

  // 이 배포에 대해서만 닫는다. 다음 배포가 올라오면 서명이 달라져 다시 뜬다 —
  // 한 번 닫았다고 영영 조용해지면 "종일 옛 코드로 돈다"는 문제가 그대로 남는다.
  const dismiss = useCallback(() => { setDismissed(latest) }, [latest])

  return {
    outdated: !!latest && latest !== dismissed,
    reload,
    dismiss,
    desktopUpdate,
    installDesktopUpdate,
  }
}
