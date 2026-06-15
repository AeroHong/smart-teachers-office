import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

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

    // ── 슈퍼 어드민 ────────────────────────────────────────────
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      setUser(firebaseUser)
      setUserName(firebaseUser.displayName || '')
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
            setUserName(firebaseUser.displayName || data.name || regName || '')
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

        // displayName 변경 시 업데이트
        const displayName = firebaseUser.displayName || ''
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
          name: firebaseUser.displayName || regName || '',
          email,
          role: 'student',
          schoolId: regSchoolId,
          studentId: regStudentId,
          createdAt: serverTimestamp(),
        })
        const schoolData = await fetchSchoolData(regSchoolId)
        setUser(firebaseUser)
        setUserName(firebaseUser.displayName || regName || '')
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

    // 등록된 학생 아님 → SchoolSetup
    setUser(firebaseUser)
    setUserName(firebaseUser.displayName || '')
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      try {
        if (firebaseUser) {
          await processUser(firebaseUser)
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
      isSuperAdmin, loading, needsSchoolSetup,
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
