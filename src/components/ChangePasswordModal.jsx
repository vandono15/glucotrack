import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPass !== confirm) { setError('New passwords do not match'); return }
    if (newPass.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true); setError('')

    // Re-authenticate with current password first
    const { data: { user } } = await supabase.auth.getUser()
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    })
    if (signInErr) { setError('Current password is incorrect'); setLoading(false); return }

    // Update password
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPass })
    if (updateErr) setError(updateErr.message)
    else { setSuccess(true); setTimeout(onClose, 2000) }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Change Password</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>✓ Password updated successfully!</div>}

        {!success && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field">
              <label>Current Password</label>
              <input className="input" type="password" placeholder="••••••••" value={current} onChange={e => setCurrent(e.target.value)} required />
            </div>
            <div className="field">
              <label>New Password</label>
              <input className="input" type="password" placeholder="••••••••" value={newPass} onChange={e => setNewPass(e.target.value)} required />
            </div>
            <div className="field">
              <label>Confirm New Password</label>
              <input className="input" type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Updating…</> : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
