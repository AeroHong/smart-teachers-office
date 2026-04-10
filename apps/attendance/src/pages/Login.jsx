import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login, domainError, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // auth 처리 완료 후 자동 이동 (레이스 컨디션 방지)
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/')
    }
  }, [user, authLoading, navigate])

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      await login()
      // navigate('/')를 직접 호출하지 않음 — useEffect에서 user 설정 완료 후 이동
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('로그인 중 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>스마트 출결 시스템</h1>
        <p style={styles.subtitle}>선유고등학교</p>

        <button onClick={handleGoogleLogin} disabled={loading} style={styles.googleButton}>
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            style={{ width: 20, height: 20 }}
          />
          {loading ? '로그인 중...' : 'Google 계정으로 로그인'}
        </button>

        {domainError && (
          <p style={styles.error}>학교 계정(@seonyoo.hs.kr)으로만 로그인할 수 있습니다.</p>
        )}
        {error && <p style={styles.error}>{error}</p>}

        <p style={styles.hint}>학교에서 발급된 Google 계정으로 로그인하세요.</p>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  card: {
    backgroundColor: '#fff',
    padding: '2.5rem',
    borderRadius: '12px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '380px',
    textAlign: 'center',
  },
  title: { margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 700 },
  subtitle: { margin: '0 0 2rem', color: '#666', fontSize: '0.9rem' },
  googleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
  },
  error: { marginTop: '1rem', color: '#d32f2f', fontSize: '0.85rem' },
  hint: { marginTop: '1.5rem', color: '#999', fontSize: '0.8rem' },
}
