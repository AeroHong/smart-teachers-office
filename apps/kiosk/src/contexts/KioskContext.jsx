import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged, signInAnonymously,
  setPersistence, browserLocalPersistence,
} from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@shared/lib/firebase'

/**
 * 키오스크 기기 신원 관리
 *
 * 로그인 UI가 없는 공용 기기이므로 Firebase 익명 로그인으로 기기 단위 계정을 만들고,
 * 관리자가 발급한 6자리 페어링 코드로 Custom Claims를 1회 부여받는다.
 * browserLocalPersistence 덕분에 재부팅 후에도 페어링이 유지된다.
 */

const KioskContext = createContext(null)

export function KioskProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [device, setDevice] = useState(null)  // { schoolId, office, deviceType }

  const readClaims = useCallback(async (user, forceRefresh = false) => {
    const { claims } = await user.getIdTokenResult(forceRefresh)
    if (claims.kioskSchoolId && claims.kioskOffice) {
      setDevice({
        schoolId: claims.kioskSchoolId,
        office: claims.kioskOffice,
        deviceType: claims.kioskDeviceType || 'input',
      })
    } else {
      setDevice(null)
    }
  }, [])

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {})

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          // 최초 실행 — 익명 세션 생성 (onAuthStateChanged가 다시 호출됨)
          await signInAnonymously(auth)
          return
        }
        await readClaims(user)
      } catch (e) {
        console.error('기기 인증 실패:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [readClaims])

  // 페어링 코드로 기기 등록 → 토큰 강제 갱신해 새 클레임 반영
  const claimDevice = useCallback(async (code) => {
    const claim = httpsCallable(functions, 'claimKioskDevice')
    await claim({ code })
    await readClaims(auth.currentUser, true)
  }, [readClaims])

  return (
    <KioskContext.Provider value={{ loading, error, device, claimDevice }}>
      {children}
    </KioskContext.Provider>
  )
}

export function useKiosk() {
  const ctx = useContext(KioskContext)
  if (!ctx) throw new Error('useKiosk는 KioskProvider 내부에서 사용해야 합니다.')
  return ctx
}
