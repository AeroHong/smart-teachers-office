import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
  getAdditionalUserInfo,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const SUPER_ADMIN_EMAIL = 'hckgood@gmail.com'

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

// schoolDomains에서 schoolId 조회 (단순 포인터)
async function lookupSchoolByDomain(domain) {
  try {
    const snap = await getDoc(doc(db, 'schoolDomains', domain))
    if (snap.exists()) {
      const data = snap.data()
      return { schoolId: data.schoolId }
    }
  } catch (e) {
    console.error('학교 도메인 조회 실패:', e)
  }
  return null
}

// userEmailMap에서 schoolId + role 조회
async function lookupSchoolByEmail(email) {
  try {
    const docId = email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__')
    const snap = await getDoc(doc(db, 'userEmailMap', docId))
    if (snap.exists()) {
      const data = snap.data()
      return { schoolId: data.schoolId, role: data.role }
    }
  } catch (e) {
    console.error('이메일 매핑 조회 실패:', e)
  }
  return null
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
    const domain = email.split('@')[1]

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

    // ── 도메인 → 이메일 순으로 학교 조회 ───────────────────────
    const lookupInfo = (await lookupSchoolByDomain(domain))
                    || (await lookupSchoolByEmail(email))

    if (!lookupInfo) {
      // 미등록 → SchoolSetup 필요
      setUser(firebaseUser)
      setUserName(firebaseUser.displayName || '')
      setNeedsSchoolSetup(true)
      setRole(null)
      setSchoolId(null)
      setSchoolName('')
      setCoverApiUrl(null)
      setStudentId(null)
      setIsSuperAdmin(false)
      return
    }

    setNeedsSchoolSetup(false)
    const { schoolId: sid, role: mappedRole } = lookupInfo

    // schools 컬렉션을 단일 소스로 학교 정보 취득
    const schoolData = await fetchSchoolData(sid)
    const sName = schoolData.name || sid
    const coverUrl = schoolData.coverApiUrl || null
    const adminEmail = schoolData.adminEmail || null

    const { isStudent, studentId: stid } = parseStudentEmail(email)

    if (isStudent) {
      const userRef = doc(db, 'users', firebaseUser.uid)
      await setDoc(userRef, {
        name: firebaseUser.displayName || '',
        email,
        role: 'student',
        schoolId: sid,
        studentId: stid,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      setUser(firebaseUser)
      setUserName(firebaseUser.displayName || '')
      setRole('student')
      setSchoolId(sid)
      setSchoolName(sName)
      setCoverApiUrl(coverUrl)
      setStudentId(stid)
      setIsSuperAdmin(false)
      return
    }

    // ── 교직원 처리 ─────────────────────────────────────────────
    const profile = _pendingGoogleProfile
    _pendingGoogleProfile = null

    const displayName = firebaseUser.displayName || ''
    const familyName = profile?.family_name || ''

    const userRef = doc(db, 'users', firebaseUser.uid)
    const userDoc = await getDoc(userRef)

    if (userDoc.exists()) {
      const data = userDoc.data()

      const updates = {}
      if (displayName) updates.name = displayName
      if (familyName && !data.staffType && KNOWN_STAFF_TYPES.includes(familyName)) {
        updates.staffType = familyName
      }
      if (!data.schoolId && sid) updates.schoolId = sid
      if (Object.keys(updates).length > 0) await updateDoc(userRef, updates)

      setRole(data.role)
      setSchoolId(data.schoolId || sid)
      setSchoolName(sName)
      setCoverApiUrl(coverUrl)
      setStudentId(null)
      setUser(firebaseUser)
      setUserName(displayName || data.name || '')
      setIsSuperAdmin(false)
    } else {
      const autoStaffType = KNOWN_STAFF_TYPES.includes(familyName) ? familyName : ''
      const isDesignatedAdmin = adminEmail && email.toLowerCase() === adminEmail.toLowerCase()

      // role 우선순위: 이메일 직접 배정 > 지정 관리자 > preApproved > pending
      let finalRole = isDesignatedAdmin ? 'school_admin' : 'pending'
      let finalStaffType = autoStaffType

      if (mappedRole) {
        finalRole = mappedRole
      } else if (!isDesignatedAdmin) {
        try {
          const preDocId = email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__')
          const preRef = doc(db, 'schools', sid, 'preApproved', preDocId)
          const preSnap = await getDoc(preRef)
          if (preSnap.exists()) {
            const pre = preSnap.data()
            finalRole = pre.role || 'teacher'
            finalStaffType = pre.staffType || autoStaffType
          }
        } catch (e) {
          console.warn('사전 등록 확인 실패:', e)
        }
      }

      await setDoc(userRef, {
        name: displayName,
        email,
        role: finalRole,
        schoolId: sid,
        staffType: finalStaffType,
        createdAt: serverTimestamp(),
      })
      setRole(finalRole)
      setSchoolId(sid)
      setSchoolName(sName)
      setCoverApiUrl(coverUrl)
      setStudentId(null)
      setUser(firebaseUser)
      setUserName(displayName)
      setIsSuperAdmin(false)
    }
  }, [])

  // SchoolSetup 완료 후 호출 — 현재 Firebase 사용자로 인증 상태 재처리
  const reloadUser = useCallback(async () => {
    const currentUser = auth.currentUser
    if (!currentUser) return
    setLoading(true)
    try {
      await processUser(currentUser)
    } catch (err) {
      console.error('사용자 정보 새로고침 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [processUser])

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
    const result = await signInWithPopup(auth, googleProvider)
    const info = getAdditionalUserInfo(result)
    if (info?.profile) {
      _pendingGoogleProfile = info.profile
    }
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{
      user, userName, schoolId, schoolName, coverApiUrl, role, studentId,
      isSuperAdmin, loading, needsSchoolSetup,
      login, logout, reloadUser,
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
