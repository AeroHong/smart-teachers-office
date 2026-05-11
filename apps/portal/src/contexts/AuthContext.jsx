import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
  getAdditionalUserInfo,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const SCHOOL_DOMAIN = 'seonyoo.hs.kr'
export const SCHOOL_ID = 'seonyoo-hs'

const googleProvider = new GoogleAuthProvider()

// Google OAuth 프로필 임시 보관 (signInWithPopup → onAuthStateChanged 순서 보장)
let _pendingGoogleProfile = null

function parseStudentEmail(email) {
  const local = email.split('@')[0]
  if (/^\d{9}$/.test(local)) {
    return { isStudent: true, year: local.slice(0, 4), studentId: local.slice(4) }
  }
  return { isStudent: false }
}

const KNOWN_STAFF_TYPES = ['교사', '교직원']

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userName, setUserName] = useState('')   // Firestore name (given name)
  const [schoolId, setSchoolId] = useState(null)
  const [role, setRole] = useState(null)
  const [studentId, setStudentId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [domainError, setDomainError] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      try {
        if (firebaseUser) {
          const email = firebaseUser.email || ''
          const domain = email.split('@')[1]

          if (domain !== SCHOOL_DOMAIN) {
            await signOut(auth)
            setDomainError(true)
            return
          }

          setDomainError(false)
          const { isStudent, studentId: sid } = parseStudentEmail(email)

          if (isStudent) {
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
            setUserName(firebaseUser.displayName || '')
            setRole('student')
            setSchoolId(SCHOOL_ID)
            setStudentId(sid)
          } else {
            // Google 프로필 소비 (signInWithPopup 직후에만 세팅됨)
            const profile = _pendingGoogleProfile
            _pendingGoogleProfile = null

            const givenName = profile?.given_name || ''
            const familyName = profile?.family_name || ''

            const userRef = doc(db, 'users', firebaseUser.uid)
            const userDoc = await getDoc(userRef)

            if (userDoc.exists()) {
              const data = userDoc.data()

              // 로그인 시 Google 프로필로 이름 동기화
              if (givenName) {
                const updates = { name: givenName, familyName }
                // staffType 미설정 상태이면 성(familyName)으로 자동 추론
                if (!data.staffType && KNOWN_STAFF_TYPES.includes(familyName)) {
                  updates.staffType = familyName
                }
                await updateDoc(userRef, updates)
              }

              setRole(data.role)
              setSchoolId(data.schoolId || null)
              setStudentId(null)
              setUser(firebaseUser)
              setUserName(givenName || data.name || firebaseUser.displayName || '')
            } else {
              // 최초 가입: Google 프로필에서 이름/구분 자동 설정
              const name = givenName || firebaseUser.displayName || ''
              const autoStaffType = KNOWN_STAFF_TYPES.includes(familyName) ? familyName : ''
              await setDoc(userRef, {
                name,
                familyName,
                email,
                role: 'pending',
                schoolId: null,
                staffType: autoStaffType,
                createdAt: serverTimestamp(),
              })
              setRole('pending')
              setSchoolId(null)
              setStudentId(null)
              setUser(firebaseUser)
              setUserName(name)
            }
          }
        } else {
          setUser(null)
          setUserName('')
          setSchoolId(null)
          setRole(null)
          setStudentId(null)
          setDomainError(false)
        }
      } catch (err) {
        console.error('인증 처리 오류:', err)
        setUser(null)
        setUserName('')
        setRole(null)
        setSchoolId(null)
      } finally {
        setLoading(false)
      }
    })
    return unsubscribe
  }, [])

  const login = async () => {
    const result = await signInWithPopup(auth, googleProvider)
    const info = getAdditionalUserInfo(result)
    if (info?.profile) {
      _pendingGoogleProfile = info.profile
    }
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{
      user, userName, schoolId, role, studentId,
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
