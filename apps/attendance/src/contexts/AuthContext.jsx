import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const SCHOOL_DOMAIN = 'seonyoo.hs.kr'
export const SCHOOL_ID = 'seonyoo-hs'

const googleProvider = new GoogleAuthProvider()

// 학생 이메일 판별: 로컬파트가 숫자 9자리 (학년도4 + 학번5)
// 예: 202630107@seonyoo.hs.kr → true
// 예: teacher@seonyoo.hs.kr   → false
function parseStudentEmail(email) {
  const local = email.split('@')[0]
  if (/^\d{9}$/.test(local)) {
    return {
      isStudent: true,
      year: local.slice(0, 4),         // "2026"
      studentId: local.slice(4),       // "30107"
    }
  }
  return { isStudent: false }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [schoolId, setSchoolId] = useState(null)
  const [role, setRole] = useState(null)       // 'admin' | 'teacher' | 'student' | 'pending'
  const [studentId, setStudentId] = useState(null)  // 학생 학번 (학생 계정일 때만)
  const [loading, setLoading] = useState(true)
  const [domainError, setDomainError] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)  // Firestore 처리 완료 전까지 로딩 유지
      try {
        if (firebaseUser) {
          const email = firebaseUser.email || ''
          const domain = email.split('@')[1]

          // 학교 도메인 체크
          if (domain !== SCHOOL_DOMAIN) {
            await signOut(auth)
            setDomainError(true)
            return
          }

          setDomainError(false)
          const { isStudent, studentId: sid } = parseStudentEmail(email)

          if (isStudent) {
            // ── 학생 계정: 이메일에서 학번 추출, 자동 승인 ──
            const userRef = doc(db, 'users', firebaseUser.uid)
            await setDoc(userRef, {
              name: firebaseUser.displayName || '',
              email,
              role: 'student',
              schoolId: SCHOOL_ID,
              studentId: sid,
              updatedAt: serverTimestamp(),
            }, { merge: true })

            setUser(firebaseUser)
            setRole('student')
            setSchoolId(SCHOOL_ID)
            setStudentId(sid)
          } else {
            // ── 교사 계정: pending 처리 ──
            const userRef = doc(db, 'users', firebaseUser.uid)
            const userDoc = await getDoc(userRef)

            if (userDoc.exists()) {
              const data = userDoc.data()
              setRole(data.role)
              setSchoolId(data.schoolId || null)
              setStudentId(null)
              setUser(firebaseUser)
            } else {
              // 첫 로그인 → pending 생성
              await setDoc(userRef, {
                name: firebaseUser.displayName || '',
                email,
                role: 'pending',
                schoolId: null,
                createdAt: serverTimestamp(),
              })
              setRole('pending')
              setSchoolId(null)
              setStudentId(null)
              setUser(firebaseUser)
            }
          }
        } else {
          setUser(null)
          setSchoolId(null)
          setRole(null)
          setStudentId(null)
          setDomainError(false)
        }
      } catch (err) {
        console.error('인증 처리 오류:', err)
        setUser(null)
        setRole(null)
        setSchoolId(null)
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [])

  const login = () => signInWithPopup(auth, googleProvider)
  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{
      user, schoolId, role, studentId,
      loading, domainError,
      login, logout, SCHOOL_ID,
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
