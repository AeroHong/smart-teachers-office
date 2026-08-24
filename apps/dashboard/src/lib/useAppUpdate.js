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
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isOutdated, signatureFrom, signatureFromHtml } from '@shared/lib/appVersion'

const CHECK_INTERVAL_MS = 10 * 60 * 1000

export default function useAppUpdate() {
  const [latest, setLatest] = useState(null)     // 서버에 올라와 있는 서명
  const [dismissed, setDismissed] = useState(null)
  const currentRef = useRef('')

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

  const reload = useCallback(() => { window.location.reload() }, [])

  // 이 배포에 대해서만 닫는다. 다음 배포가 올라오면 서명이 달라져 다시 뜬다 —
  // 한 번 닫았다고 영영 조용해지면 "종일 옛 코드로 돈다"는 문제가 그대로 남는다.
  const dismiss = useCallback(() => { setDismissed(latest) }, [latest])

  return { outdated: !!latest && latest !== dismissed, reload, dismiss }
}
