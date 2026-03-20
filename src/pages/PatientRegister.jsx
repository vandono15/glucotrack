import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const REGIMENS = [
  { value: 'nph_regular', label: 'NPH + Regular (N&R) — twice daily' },
  { value: 'basal_bolus', label: 'Basal-Bolus (e.g. Glargine + Aspart/Lispro)' },
  { value: 'premixed_70_30', label: 'Premixed 70/30 — twice daily' },
  { value: 'pump_csii', label: 'Insulin Pump (CSII)' },
  { value: 'other', label: 'Other' },
]

export default function PatientRegister() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    full_name: '', dob: '', weight_kg: '', sex: '',
    diagnosis_year: '', regimen: 'nph_regular',
    physician_name: '', notes: ''
  })

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')

    // Sign up
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })
    if (authErr) { setError(authErr.message); setLoading(false); return }

    // Insert profile
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: authData.user.id,
      role: 'patient',
      full_name: form.full_name,
      dob: form.dob,
      weight_kg: parseFloat(form.weight_kg) || null,
      sex: form.sex,
      diagnosis_year: parseInt(form.diagnosis_year) || null,
      regimen: form.regimen,
      physician_name: form.physician_name,
      notes: form.notes,
    })

    if (profileErr) { setError(profileErr.message); setLoading(false); return }
    setLoading(false)
    navigate('/patient')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--text)' }}>GlucoTrack</span>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Patient Registration</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              flex: 1, height: '4px', borderRadius: '2px',
              background: s <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        <div className="card">
          {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>Account Details</h2>

              <div className="field">
                <label>Full Name</label>
                <input className="input" placeholder="First Last" value={form.full_name} onChange={set('full_name')} required />
              </div>
              <div className="field">
                <label>Email</label>
                <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Password</label>
                  <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
                </div>
                <div className="field">
                  <label>Confirm</label>
                  <input className="input" type="password" placeholder="••••••••" value={form.confirmPassword} onChange={set('confirmPassword')} required />
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                onClick={() => {
                  if (!form.full_name || !form.email || !form.password || !form.confirmPassword) {
                    setError('Please fill in all fields'); return
                  }
                  if (form.password !== form.confirmPassword) {
                    setError('Passwords do not match'); return
                  }
                  setError('')
                  setStep(2)
                }}
              >
                Continue →
              </button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>Medical Profile</h2>

              <div className="grid-2">
                <div className="field">
                  <label>Date of Birth</label>
                  <input className="input" type="date" value={form.dob} onChange={set('dob')} required />
                </div>
                <div className="field">
                  <label>Sex</label>
                  <select className="input" value={form.sex} onChange={set('sex')} required>
                    <option value="">Select…</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>Weight (kg)</label>
                  <input className="input" type="number" step="0.1" placeholder="e.g. 32.5" value={form.weight_kg} onChange={set('weight_kg')} />
                </div>
                <div className="field">
                  <label>Diagnosis Year</label>
                  <input className="input" type="number" placeholder="e.g. 2020" value={form.diagnosis_year} onChange={set('diagnosis_year')} />
                </div>
              </div>

              <div className="field">
                <label>Insulin Regimen</label>
                <select className="input" value={form.regimen} onChange={set('regimen')}>
                  {REGIMENS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Physician Name</label>
                <input className="input" placeholder="Dr. Smith" value={form.physician_name} onChange={set('physician_name')} />
              </div>

              <div className="field">
                <label>Additional Notes (optional)</label>
                <textarea className="input" rows={2} placeholder="Allergies, other conditions…" value={form.notes} onChange={set('notes')} style={{ resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
                  {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Creating account…</> : 'Create Account'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: 'var(--text-muted)' }}>
          Already registered?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
