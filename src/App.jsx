import { Routes, Route, Link, useLocation } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import AdminPage from './components/AdminPage'
import './App.css'

export default function App() {
  const location = useLocation()
  return (
    <div>
      <nav className="navbar">
        <span className="nav-title">🏥 ICU Patient Tracker</span>
        <div className="nav-links">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Dashboard</Link>
          <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>Admin</Link>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  )
}
