import { useAuth } from '../../contexts/AuthContext'

export default function PendingApproval() {
  const { user, logout } = useAuth()

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>⏳</div>
        <h2 style={styles.title}>승인 대기 중</h2>
        <p style={styles.desc}>
          <strong>{user?.displayName || user?.email}</strong>님의 계정이<br />
          관리자 승인을 기다리고 있습니다.
        </p>
        <p style={styles.hint}>
          관리자에게 승인을 요청하세요.<br />
          승인 후 다시 로그인하면 이용 가능합니다.
        </p>
        <button onClick={logout} style={styles.logoutButton}>로그아웃</button>
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
  icon: { fontSize: '3rem', marginBottom: '1rem' },
  title: { margin: '0 0 1rem', fontSize: '1.3rem', fontWeight: 700 },
  desc: { color: '#333', lineHeight: 1.8, marginBottom: '0.75rem' },
  hint: { color: '#888', fontSize: '0.85rem', lineHeight: 1.7, marginBottom: '1.5rem' },
  logoutButton: {
    padding: '0.6rem 1.5rem',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
}
