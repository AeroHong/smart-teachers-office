import { createContext, useContext, useEffect, useState } from 'react'
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

// 이메일 도메인으로 학교 정보 조회
async function lookupSchoolByDomain(domain) {
  try {
    const snap = await getDoc(doc(db, 'schoolDomains', domain))
    if (snap.exists()) return snap.data()  // { schoolId, schoolName }
  } catch (e) {
    console.error('학교 도메인 조회 실패:', e)
  }
  return null
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
  // null = 확인 전, true = 등록됨, false = 미등록 도메인
  const [domainRegistered, setDomainRegistered] = useState(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      try {
        if (firebaseUser) {
          const email = firebaseUser.email || ''
          const domain = email.split('@')[1]

          // ── 슈퍼 어드민 ──────────────────────────────────────────
          if (email.toLowerCase() === SUPER_ADMIN_EMAIL) {
            setUser(firebaseUser)
            setUserName(firebaseUser.displayName || '')
            setRole('super_admin')
            setIsSuperAdmin(true)
            setSchoolId(null)
            setSchoolName('')
            setStudentId(null)
            setDomainRegistered(true)
            return
          }

          // ── 도메인으로 학교 조회 ──────────────────────────────────
          const schoolInfo = await lookupSchoolByDomain(domain)

          if (!schoolInfo) {
            // 미등록 도메인 → 게스트 학교 자동 생성 또는 기존 게스트 학교 로드
            const userRef = doc(db, 'users', firebaseUser.uid)
            const userDoc = await getDoc(userRef)

            let guestSchoolId, guestSchoolName, guestRole

            if (userDoc.exists() && userDoc.data().schoolId?.startsWith('guest_')) {
              // 기존 게스트 학교
              guestSchoolId = userDoc.data().schoolId
              guestRole = userDoc.data().role || 'school_admin'
              const schoolSnap = await getDoc(doc(db, 'schools', guestSchoolId))
              guestSchoolName = schoolSnap.data()?.name || '체험 학교'
            } else {
              // 새 게스트 학교 생성
              guestSchoolId = `guest_${firebaseUser.uid.slice(0, 8)}`
              guestRole = 'school_admin'
              const dName = firebaseUser.displayName || email.split('@')[0]
              guestSchoolName = `${dName}의 체험 학교`
              await setDoc(doc(db, 'schools', guestSchoolId), {
                name: guestSchoolName,
                isGuest: true,
                ownerEmail: email,
                ownerUid: firebaseUser.uid,
                domain,
                createdAt: serverTimestamp(),
              })
              await setDoc(userRef, {
                name: firebaseUser.displayName || '',
                email,
                role: 'school_admin',
                schoolId: guestSchoolId,
                staffType: '교사',
                createdAt: serverTimestamp(),
              }, { merge: true })
            }

            setUser(firebaseUser)
            setUserName(firebaseUser.displayName || '')
            setRole(guestRole)
            setSchoolId(guestSchoolId)
            setSchoolName(guestSchoolName)
            setCoverApiUrl(null)
            setStudentId(null)
            setDomainRegistered(true)
            setIsSuperAdmin(false)
            return
          }

          setDomainRegistered(true)
          const { schoolId: sid, schoolName: sName, coverApiUrl: coverUrl = null } = schoolInfo
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
          } else {
            const profile = _pendingGoogleProfile
            _pendingGoogleProfile = null

            const displayName = firebaseUser.displayName || ''
            const familyName = profile?.family_name || ''  // staffType 자동 감지용

            const userRef = doc(db, 'users', firebaseUser.uid)
            const userDoc = await getDoc(userRef)

            if (userDoc.exists()) {
              const data = userDoc.data()

              const updates = {}
              if (displayName) {
                updates.name = displayName
              }
              if (familyName && !data.staffType && KNOWN_STAFF_TYPES.includes(familyName)) {
                updates.staffType = familyName
              }
              // schoolId가 미설정인 경우 도메인 조회 결과로 자동 보정
              if (!data.schoolId && sid) {
                updates.schoolId = sid
              }
              if (Object.keys(updates).length > 0) {
                await updateDoc(userRef, updates)
              }

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
              const isDesignatedAdmin = schoolInfo.adminEmail &&
                email.toLowerCase() === schoolInfo.adminEmail.toLowerCase()

              // 사전 등록 명단 확인 (school_admin이 미리 등록해둔 경우 자동 승인)
              let finalRole = isDesignatedAdmin ? 'school_admin' : 'pending'
              let finalStaffType = autoStaffType
              let finalName = displayName
              if (!isDesignatedAdmin) {
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
                name: finalName,
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
              setUserName(finalName)
              setIsSuperAdmin(false)
            }
          }
        } else {
          setUser(null)
          setUserName('')
          setSchoolId(null)
          setSchoolName('')
          setCoverApiUrl(null)
          setRole(null)
          setStudentId(null)
          setIsSuperAdmin(false)
          setDomainRegistered(null)
        }
      } catch (err) {
        console.error('인증 처리 오류:', err)
        setUser(null)
        setUserName('')
        setRole(null)
        setSchoolId(null)
        setSchoolName('')
        setIsSuperAdmin(false)
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
      user, userName, schoolId, schoolName, coverApiUrl, role, studentId,
      isSuperAdmin, loading, domainRegistered,
      login, logout,
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
