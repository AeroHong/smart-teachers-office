import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Layout({ children }) {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div style={styles.wrapper}>
      <nav style={styles.nav}>
        <span style={styles.brand}>📋 스마트 출결</span>
        <div style={styles.links}>
          <Link to="/" style={styles.link} state={{ reset: Date.now() }}>대시보드</Link>
          <Link to="/students" style={styles.link}>학생 명단</Link>
          <Link to="/events/new" style={styles.link}>이벤트 생성</Link>
          <Link to="/stats" style={styles.link}>통계</Link>
          {(role === 'admin' || role === 'school_admin') && <Link to="/admin" style={styles.link}>관리자</Link>}
        </div>
        <div style={styles.userInfo}>
          {role === 'school_admin' && <span style={styles.roleBadge}>학교관리자</span>}
          <span style={styles.userName}>{user?.displayName}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>로그아웃</button>
        </div>
      </nav>
      <main style={styles.main}>{children}</main>
    </div>
  )
}

const styles = {
  wrapper: { minHeight: '100vh', backgroundColor: '#f9f9f9' },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '0 2rem',
    height: '56px',
    backgroundColor: '#1a73e8',
    color: '#fff',
  },
  brand: { fontWeight: 700, fontSize: '1rem', marginRight: '1rem' },
  links: { display: 'flex', gap: '1.25rem', flex: 1 },
  link: { color: '#fff', textDecoration: 'none', fontSize: '0.9rem', opacity: 0.9 },
  userInfo: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' },
  userName: { fontSize: '0.85rem', opacity: 0.9 },
  roleBadge: { fontSize: '0.72rem', backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 },
  logoutBtn: {
    padding: '0.3rem 0.75rem',
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  main: { padding: '2rem', maxWidth: '1100px', margin: '0 auto' },
}
