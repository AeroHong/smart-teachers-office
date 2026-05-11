import { useAuth } from '../contexts/AuthContext'

/**
 * 로그인한 학교의 보강 시스템 Apps Script URL을 AuthContext에서 조회
 * (로그인 시 schoolDomains에서 이미 읽어온 값을 그대로 사용)
 * @returns {{ apiUrl: string|null, loading: boolean, notConfigured: boolean }}
 */
export function useCoverApiUrl() {
  const { coverApiUrl, loading } = useAuth()
  return {
    apiUrl: coverApiUrl,
    loading,
    notConfigured: !loading && !coverApiUrl,
  }
}
