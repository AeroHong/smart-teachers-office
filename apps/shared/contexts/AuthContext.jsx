import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '@shared/lib/firebase'
import { emailToDocId } from '@shared/lib/emailToDocId'
import { stripTitlePrefix } from '@shared/lib/personName'

const SUPER_ADMIN_EMAIL = 'hckgood@gmail.com'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

function parseStudentEmail(email) {
  const local = email.split('@')[0]
  if (/^\d{9}$/.test(local)) {
    return { isStudent: true, year: local.slice(0, 4), studentId: local.slice(4) }
  }
  return { isStudent: false }
}

// schools를 단일 소스로 학교 데이터 조회
async function fetchSchoolData(schoolId) {
  try {
    const snap = await getDoc(doc(db, 'schools', schoolId))
    if (snap.exists()) return snap.data()
  } catch (e) {
    console.error('학교 데이터 조회 실패:', e)
  }
  return {}
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userName, setUserName] = useState('')
  const [schoolId, setSchoolId] = useState(null)
  const [schoolName, setSchoolName] = useState('')
  const [coverApiUrl, setCoverApiUrl] = useState(null)
  const [role, setRole] = useState(null)
  const [studentId, setStudentId] = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [needsSchoolSetup, setNeedsSchoolSetup] = useState(false)

  const processUser = useCallback(async (firebaseUser) => {
    const email = firebaseUser.email || ''

    // 구글 워크스페이스 표시이름은 "교사강혜련"처럼 직책이 앞에 붙어 있다. 아래에서
    // 로그인마다 users.name에 동기화하므로, 여기서 떼지 않으면 명단을 한 번 정리해도
    // 선생님들이 접속하는 대로 하나씩 되돌아간다. (personName.js 참고)
    const displayName = stripTitlePrefix(firebaseUser.displayName || '')

    // ── 슈퍼 어드민 ────────────────────────────────────────────
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      setUser(firebaseUser)
      setUserName(displayName || '')
      setRole('super_admin')
      setIsSuperAdmin(true)
      setSchoolId(null)
      setSchoolName('')
      setStudentId(null)
      setNeedsSchoolSetup(false)
      return
    }

    // ── users 컬렉션에서 기존 설정 확인 ─────────────────────────
    const userRef = doc(db, 'users', firebaseUser.uid)
    const userDoc = await getDoc(userRef)

    if (userDoc.exists()) {
      const data = userDoc.data()
      const existingSchoolId = data.schoolId

      // rejected/pending 상태 → studentRegistrations로 학생 자동 복구 시도
      if (existingSchoolId && !existingSchoolId.startsWith('guest_') &&
          (data.role === 'rejected' || data.role === 'pending')) {
        try {
          const regDoc = await getDoc(doc(db, 'studentRegistrations', email))
          if (regDoc.exists()) {
            const { schoolId: regSchoolId, studentId: regStudentId, name: regName } = regDoc.data()
            await setDoc(userRef, {
              ...data,
              role: 'student',
              schoolId: regSchoolId,
              studentId: regStudentId,
              updatedAt: serverTimestamp(),
            }, { merge: true })
            const schoolData = await fetchSchoolData(regSchoolId)
            setUser(firebaseUser)
            setUserName(displayName || data.name || regName || '')
            setRole('student')
            setSchoolId(regSchoolId)
            setSchoolName(schoolData.name || regSchoolId)
            setCoverApiUrl(schoolData.coverApiUrl || null)
            setStudentId(regStudentId)
            setIsSuperAdmin(false)
            setNeedsSchoolSetup(false)
            return
          }
        } catch (e) {
          console.warn('학생 역할 복구 실패:', e.message)
        }
      }

      // 실제 학교 소속(non-guest, 비활성화 제외) → 바로 진입
      if (existingSchoolId && !existingSchoolId.startsWith('guest_') && data.role !== 'rejected') {
        const schoolData = await fetchSchoolData(existingSchoolId)

        // 표시이름이 바뀌었으면 반영 (개명·오기 수정이 넘어오는 통로)
        if (displayName && displayName !== data.name) {
          updateDoc(userRef, { name: displayName }).catch(() => {})
        }

        // studentId: user doc 우선, 없으면 이메일 패턴(하위 호환)
        const parsedEmail = parseStudentEmail(email)
        const resolvedStudentId = data.studentId || (parsedEmail.isStudent ? parsedEmail.studentId : null)

        setUser(firebaseUser)
        setUserName(displayName || data.name || '')
        setRole(data.role)
        setSchoolId(existingSchoolId)
        setSchoolName(schoolData.name || existingSchoolId)
        setCoverApiUrl(schoolData.coverApiUrl || null)
        setStudentId(resolvedStudentId)
        setIsSuperAdmin(false)
        setNeedsSchoolSetup(false)
        return
      }
    }

    // user doc 없음 or guest_ schoolId → studentRegistrations로 학생 자동 등록 시도
    try {
      const regDoc = await getDoc(doc(db, 'studentRegistrations', email))
      if (regDoc.exists()) {
        const { schoolId: regSchoolId, studentId: regStudentId, name: regName } = regDoc.data()
        await setDoc(userRef, {
          name: displayName || regName || '',
          email,
          role: 'student',
          schoolId: regSchoolId,
          studentId: regStudentId,
          createdAt: serverTimestamp(),
        })
        const schoolData = await fetchSchoolData(regSchoolId)
        setUser(firebaseUser)
        setUserName(displayName || regName || '')
        setRole('student')
        setSchoolId(regSchoolId)
        setSchoolName(schoolData.name || regSchoolId)
        setCoverApiUrl(schoolData.coverApiUrl || null)
        setStudentId(regStudentId)
        setIsSuperAdmin(false)
        setNeedsSchoolSetup(false)
        return
      }
    } catch (e) {
      console.warn('학생 사전등록 조회 실패:', e.message)
    }

    // 사전 등록(preApproved) 교직원 자동 활성화 시도 — 이메일 도메인으로 학교 매핑 후 조회
    try {
      const emailDomain = email.split('@')[1]
      if (emailDomain) {
        const domainSnap = await getDoc(doc(db, 'schoolDomains', emailDomain))
        if (domainSnap.exists()) {
          const { schoolId: domainSchoolId } = domainSnap.data()
          const preSnap = await getDoc(
            doc(db, 'schools', domainSchoolId, 'preApproved', emailToDocId(email))
          )
          if (preSnap.exists()) {
            const { name: preName, staffType, role: preRole } = preSnap.data()
            await setDoc(userRef, {
              name: displayName || preName || '',
              email,
              role: preRole || 'teacher',
              schoolId: domainSchoolId,
              staffType: staffType || '교사',
              createdAt: serverTimestamp(),
            })
            const schoolData = await fetchSchoolData(domainSchoolId)
            setUser(firebaseUser)
            setUserName(displayName || preName || '')
            setRole(preRole || 'teacher')
            setSchoolId(domainSchoolId)
            setSchoolName(schoolData.name || domainSchoolId)
            setCoverApiUrl(schoolData.coverApiUrl || null)
            setStudentId(null)
            setIsSuperAdmin(false)
            setNeedsSchoolSetup(false)
            return
          }
        }
      }
    } catch (e) {
      console.warn('교직원 사전등록 조회 실패:', e.message)
    }

    // 등록된 학생 아님 → SchoolSetup
    setUser(firebaseUser)
    setUserName(displayName || '')
    setNeedsSchoolSetup(true)
    setRole(null)
    setSchoolId(null)
    setSchoolName('')
    setCoverApiUrl(null)
    setStudentId(null)
    setIsSuperAdmin(false)
  }, [])

  // SchoolSetup 완료 후 React 상태 직접 설정 — processUser 우회로 루프 방지
  const completeSchoolSetup = useCallback(async (newSchoolId, newRole) => {
    try {
      const schoolData = await fetchSchoolData(newSchoolId)
      setRole(newRole)
      setSchoolId(newSchoolId)
      setSchoolName(schoolData.name || newSchoolId)
      setCoverApiUrl(schoolData.coverApiUrl || null)
      setStudentId(null)
      setNeedsSchoolSetup(false)
      setIsSuperAdmin(false)
    } catch (e) {
      console.error('학교 설정 완료 실패:', e)
    }
  }, [])

  /**
   * 소속·직군 클레임이 토큰에 있는지 확인하고, 없으면 서버에 채워달라고 요청한다.
   *
   * Storage 규칙이 이 클레임으로 소속 학교와 교직원 여부를 판정한다. 클레임이 없으면
   * 파일 업로드가 통째로 막히는데, 사용자 입장에서는 이유를 알 수 없다.
   *
   * 이미 가입해 있던 계정은 users 문서가 바뀔 일이 없어 트리거가 돌지 않는다.
   * 그래서 로그인할 때마다 한 번 확인하고 비어 있으면 채운다. 채운 뒤에는 토큰을 새로
   * 받아야 새 값이 반영된다(getIdTokenResult(true)).
   */
  const ensureClaims = useCallback(async (firebaseUser) => {
    try {
      const { claims } = await firebaseUser.getIdTokenResult()
      if (claims.schoolId) return

      await httpsCallable(functions, 'refreshMyClaims')()
      await firebaseUser.getIdTokenResult(true)
    } catch (e) {
      // 실패해도 로그인은 진행한다. 파일 업로드만 안 될 뿐 나머지 기능은 Firestore
      // 규칙으로 동작하므로, 여기서 막아 세우면 손해가 더 크다.
      console.error('권한 정보 갱신 실패:', e)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      try {
        if (firebaseUser) {
          await processUser(firebaseUser)
          await ensureClaims(firebaseUser)
        } else {
          setUser(null)
          setUserName('')
          setSchoolId(null)
          setSchoolName('')
          setCoverApiUrl(null)
          setRole(null)
          setStudentId(null)
          setIsSuperAdmin(false)
          setNeedsSchoolSetup(false)
        }
      } catch (err) {
        console.error('인증 처리 오류:', err)
        setUser(null)
        setUserName('')
        setRole(null)
        setSchoolId(null)
        setSchoolName('')
        setIsSuperAdmin(false)
        setNeedsSchoolSetup(false)
      } finally {
        setLoading(false)
      }
    })
    return unsubscribe
  }, [processUser])

  const login = async () => {
    await signInWithPopup(auth, googleProvider)
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{
      user, userName, schoolId, schoolName, coverApiUrl, role, studentId,
      isSuperAdmin,
      isAdmin: role === 'admin' || role === 'school_admin',
      isPrincipal: role === 'principal',
      loading, needsSchoolSetup,
      login, logout, completeSchoolSetup,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서 사용해야 합니다.')
  return ctx
}
