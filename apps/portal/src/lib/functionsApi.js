import { auth } from './firebase'

// Python Cloud Functions(functions-python, codebase: python-tools)는 파일 업로드/다운로드가
// 있어 onCall(JSON 직렬화) 대신 순수 HTTP + multipart/form-data로 직접 호출한다.
const FUNCTIONS_BASE_URL = 'https://asia-northeast3-seonyoo-system.cloudfunctions.net'

export async function callToolFunction(name, formData) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('로그인이 필요합니다.')

  const res = await fetch(`${FUNCTIONS_BASE_URL}/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  if (!res.ok) {
    const contentType = res.headers.get('Content-Type') || ''
    if (contentType.includes('application/json')) {
      const { error } = await res.json()
      throw new Error(error || '요청을 처리하지 못했습니다.')
    }
    throw new Error('요청을 처리하지 못했습니다.')
  }

  return res
}
