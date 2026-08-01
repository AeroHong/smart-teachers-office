/**
 * 실패를 사용자에게 알리는 공용 장치.
 *
 * 그동안 쪽지 전송·읽음 처리·배치 저장 실패는 console.error로만 남았다. 화면에는
 * 아무 일도 일어나지 않아서, 사용자 입장에서는 "보내기를 눌렀는데 그냥 닫혔다"로 보였다.
 * 권한 규칙이나 인덱스 문제로 조용히 실패하는 경우가 특히 위험하다.
 *
 * 사용법: const toast = useToast(); toast.error('쪽지를 보내지 못했습니다.', e)
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  // Provider 밖(테스트·스토리북 등)에서도 호출부가 깨지지 않게 무동작 객체를 돌려준다
  return ctx || NOOP_TOAST
}

const NOOP_TOAST = { error: () => {}, success: () => {} }

export default function ToastProvider({ children }) {
  const [toast, setToast] = useState(null) // { message, severity }

  const show = useCallback((severity, message, cause) => {
    if (cause) console.error(message, cause)
    setToast({ severity, message })
  }, [])

  const api = useMemo(() => ({
    error: (message, cause) => show('error', message, cause),
    success: (message) => show('success', message),
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.severity === 'error' ? 8000 : 3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {/* Snackbar는 자식이 없으면 렌더 오류가 나므로 닫힌 뒤에도 마지막 내용을 유지한다 */}
        <Alert
          severity={toast?.severity || 'info'}
          variant="filled"
          onClose={() => setToast(null)}
          sx={{ borderRadius: 1 }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  )
}
