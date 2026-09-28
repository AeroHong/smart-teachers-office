/**
 * 강제 업데이트 관문 — 관리자가 schools/{schoolId}.minDesktopVersion을 정하면,
 * 그보다 낮은 버전의 데스크톱 앱은 화면을 못 쓰게 막는다.
 *
 * 배경(2026-09-18): 알림 화면 무한 쓰기 루프(3ec07ab)를 고친 뒤에도, 트레이 상주 앱은
 * 스스로 새로고침하지 않아 며칠씩 옛 코드로 도는 PC가 남을 수 있다는 게 드러났다.
 * useAppUpdate.js의 배너는 "누른 사람만" 고쳐지는 방식이라, 방치하면 대가가 큰 결함이
 * 나왔을 때는 강제로 막을 방법이 따로 필요했다.
 *
 * 일반 브라우저(window.smartOfficeDesktop 없음)에서는 완전히 no-op — 브라우저 탭은
 * 새로고침 한 번이면 항상 최신이라 이 관문이 필요 없다(useAppUpdate.js가 그 경로를
 * 이미 다룬다). 로그인 전에는 schoolId를 몰라 판단할 수 없으므로도 no-op — 여러 학교가
 * 쓰는 구조라 "어느 학교의 최소 버전"인지가 로그인 전에는 정해지지 않는다.
 */
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { currentDesktopVersion, isBelowMinVersion } from '@shared/lib/desktopClients'

function isDesktop() {
  return typeof window !== 'undefined' && !!window.smartOfficeDesktop?.version
}

export default function useDesktopUpdateGate() {
  const { user, schoolId } = useAuth()
  const [minVersion, setMinVersion] = useState(null)
  const [updateInfo, setUpdateInfo] = useState(null) // { version } | null — 다운로드 완료 시

  useEffect(() => {
    if (!import.meta.env.PROD || !isDesktop() || !schoolId || !user) return undefined
    return onSnapshot(
      doc(db, 'schools', schoolId),
      (snap) => setMinVersion(snap.data()?.minDesktopVersion || null),
      () => {},
    )
  }, [schoolId, user])

  const version = currentDesktopVersion()
  const blocked = isDesktop() && isBelowMinVersion(version, minVersion)

  // 막힌 순간 스스로 업데이트를 확인한다 — 사람이 뭘 누르기 전에 이미 내려받기
  // 시작해, 화면을 보자마자 "재시작" 버튼이 뜰 가능성을 높인다. 또한 백그라운드
  // 자동 다운로드(4시간 주기)가 이 화면이 뜨기 전에 이미 끝나 있었을 수도 있어
  // getPendingUpdate로 그 경우도 놓치지 않고 잡는다.
  useEffect(() => {
    if (!blocked) return undefined
    window.smartOfficeDesktop.checkForUpdates?.().catch(() => {})
    let alive = true
    window.smartOfficeDesktop.getPendingUpdate?.()
      .then((info) => { if (alive && info) setUpdateInfo(info) })
      .catch(() => {})
    const off = window.smartOfficeDesktop.onUpdateDownloaded?.((info) => setUpdateInfo(info))
    return () => { alive = false; off?.() }
  }, [blocked])

  return {
    blocked,
    version,
    minVersion,
    updateInfo,
    recheck: () => window.smartOfficeDesktop?.checkForUpdates?.().catch(() => {}),
    install: () => window.smartOfficeDesktop?.quitAndInstall?.(),
  }
}
