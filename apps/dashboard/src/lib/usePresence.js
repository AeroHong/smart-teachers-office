/**
 * 내 재실 상태 읽기·쓰기.
 *
 * 위젯이던 것이 상단바 드롭다운으로 옮겨가면서, 화면과 분리해 훅으로 뺐다.
 *
 * 이 훅은 교사가 직접 고르는 수동 변경만 다룬다(source: 'manual'). 웹은 브라우저 밖의
 * 활동을 감지할 수 없어서다. Electron 데스크톱 클라이언트는 별도 훅(useDesktopPresence.js)
 * 이 OS 유휴시간으로 같은 문서를 source: 'desktop'으로 자동 갱신한다 — 이 화면은
 * onSnapshot으로 그 결과를 그대로 받아 보여줄 뿐, 자동 갱신 로직과는 무관하다.
 */
import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { effectivePresence } from '@shared/lib/presence'
import { useToast } from '../components/ToastProvider'

export default function usePresence() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState('unknown')
  const [source, setSource] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!schoolId || !user) return
    return onSnapshot(
      doc(db, ...schoolPath(schoolId, COL.PRESENCE), user.uid),
      snap => {
        const data = snap.data()
        setCurrent(effectivePresence(data))
        setSource(data?.source || null)
      },
      () => {},
    )
  }, [schoolId, user])

  const setStatus = useCallback(async (status) => {
    if (saving || !user) return
    setSaving(true)
    try {
      await setDoc(
        doc(db, ...schoolPath(schoolId, COL.PRESENCE), user.uid),
        { uid: user.uid, status, source: 'manual', updatedAt: serverTimestamp() },
        { merge: true },
      )
    } catch (e) {
      // 키오스크에 그대로 표시되는 값이라, 반영 안 된 걸 모르고 지나가면 안 된다
      toast.error('재실 상태를 바꾸지 못했습니다.', e)
    } finally {
      setSaving(false)
    }
  }, [saving, user, schoolId, toast])

  return { current, source, saving, setStatus }
}
