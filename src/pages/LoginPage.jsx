import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ThemeToggle } from '../lib/theme.jsx'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('login') // 'login' | 'forgot'
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setResetLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    })
    if (error) setError(error.message)
    else setResetSent(true)
    setResetLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {/* Theme toggle top right */}
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>

      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="var(--accent)" fillOpacity="0.15"/>
              <path d="M16 6 L16 26 M6 16 L26 16" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="16" cy="16" r="4" fill="var(--accent)" fillOpacity="0.4"/>
              <circle cx="16" cy="16" r="2" fill="var(--accent)"/>
            </svg>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: 'var(--text)' }}>GlucoTrack</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Paediatric Diabetes Management</p>
        </div>

        <div className="card">
          {view === 'login' && (
            <>
              <h2 style={{ marginBottom: '24px', fontSize: '18px', fontWeight: 600 }}>Sign In</h2>
              {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="field">
                  <label>Email</label>
                  <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <div style={{ textAlign: 'right', marginTop: '-8px' }}>
                  <button type="button" onClick={() => { setView('forgot'); setError('') }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Forgot password?
                  </button>
                </div>
                <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in…</> : 'Sign In'}
                </button>
              </form>
              <div className="divider" />
              <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                New patient?{' '}
                <Link to="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Create account</Link>
              </p>
            </>
          )}

          {view === 'forgot' && (
            <>
              <h2 style={{ marginBottom: '8px', fontSize: '18px', fontWeight: 600 }}>Reset Password</h2>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                Enter your email and we'll send you a reset link.
              </p>
              {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
              {resetSent ? (
                <div>
                  <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                    ✓ Reset email sent! Check your inbox and follow the link.
                  </div>
                  <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setView('login'); setResetSent(false) }}>
                    ← Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="field">
                    <label>Email</label>
                    <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={resetLoading} style={{ width: '100%', justifyContent: 'center' }}>
                    {resetLoading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Sending…</> : 'Send Reset Link'}
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setView('login'); setError('') }}>
                    ← Back to Sign In
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: 'var(--text-dim)' }}>
          Doctor accounts are created by clinic administration
        </p>
      </div>
    </div>
  )
}
