import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import PatientRegister from './pages/PatientRegister'
import PatientDashboard from './pages/PatientDashboard'
import DoctorDashboard from './pages/DoctorDashboard'
import PatientDetail from './pages/PatientDetail'
import ResetPassword from './pages/ResetPassword'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else setRole(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchRole(userId) {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    setRole(data?.role || null)
  }

  if (session === undefined) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  // Always allow reset-password route regardless of auth state
  if (window.location.pathname === '/reset-password') {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<PatientRegister />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  if (!role) {
    return <div className="loading-screen"><div className="spinner" /><span>Setting up your account…</span></div>
  }

  return (
    <Routes>
      {role === 'doctor' ? (
        <>
          <Route path="/doctor" element={<DoctorDashboard />} />
          <Route path="/doctor/patient/:id" element={<PatientDetail />} />
          <Route path="*" element={<Navigate to="/doctor" />} />
        </>
      ) : (
        <>
          <Route path="/patient" element={<PatientDashboard />} />
          <Route path="*" element={<Navigate to="/patient" />} />
        </>
      )}
    </Routes>
  )
}
