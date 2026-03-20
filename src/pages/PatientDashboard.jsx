import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'

const REGIMEN_LABELS = {
  nph_regular: 'NPH + Regular (N&R)',
  basal_bolus: 'Basal-Bolus',
  premixed_70_30: 'Premixed 70/30',
  pump_csii: 'Insulin Pump (CSII)',
  other: 'Other',
}

function rbsStatus(val) {
  if (!val) return null
  if (val < 70) return { label: 'Low', cls: 'badge-low' }
  if (val > 200) return { label: 'High', cls: 'badge-high' }
  if (val > 150) return { label: 'Borderline', cls: 'badge-warn' }
  return { label: 'Normal', cls: 'badge-normal' }
}

export default function PatientDashboard() {
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('log')

  const today = format(new Date(), 'yyyy-MM-dd')
  const [form, setForm] = useState({
    log_date: today,
    am_rbs: '', pm_rbs: '',
    am_n_dose: '', am_r_dose: '',
    pm_n_dose: '', pm_r_dose: '',
    am_basal: '', am_bolus: '',
    pm_basal: '', pm_bolus: '',
    notes: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(profileData)

    const { data: logsData } = await supabase
      .from('glucose_logs')
      .select('*')
      .eq('patient_id', user.id)
      .order('log_date', { ascending: false })
      .limit(30)
    setLogs(logsData || [])
    setLoading(false)
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      patient_id: user.id,
      log_date: form.log_date,
      am_rbs: parseFloat(form.am_rbs) || null,
      pm_rbs: parseFloat(form.pm_rbs) || null,
      am_n_dose: parseFloat(form.am_n_dose) || null,
      am_r_dose: parseFloat(form.am_r_dose) || null,
      pm_n_dose: parseFloat(form.pm_n_dose) || null,
      pm_r_dose: parseFloat(form.pm_r_dose) || null,
      am_basal: parseFloat(form.am_basal) || null,
      am_bolus: parseFloat(form.am_bolus) || null,
      pm_basal: parseFloat(form.pm_basal) || null,
      pm_bolus: parseFloat(form.pm_bolus) || null,
      notes: form.notes || null,
    }

    const { error: err } = await supabase.from('glucose_logs').upsert(payload, {
      onConflict: 'patient_id,log_date'
    })

    if (err) setError(err.message)
    else {
      setSuccess('Log saved successfully!')
      fetchData()
      setTimeout(() => setSuccess(''), 3000)
    }
    setSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const isNPH = profile?.regimen === 'nph_regular' || profile?.regimen === 'premixed_70_30' || !profile?.regimen
  const isBasalBolus = profile?.regimen === 'basal_bolus'
  const isPump = profile?.regimen === 'pump_csii'

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '16px 0' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 6 L16 26 M6 16 L26 16" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="16" cy="16" r="4" fill="var(--accent)" fillOpacity="0.4"/>
              <circle cx="16" cy="16" r="2" fill="var(--accent)"/>
            </svg>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px' }}>GlucoTrack</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{profile?.full_name}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '32px 24px' }}>
        {/* Profile strip */}
        <div className="card" style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>{profile?.full_name}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {profile?.dob ? `DOB: ${format(parseISO(profile.dob), 'dd MMM yyyy')}` : ''}{profile?.sex ? ` · ${profile.sex === 'M' ? 'Male' : 'Female'}` : ''}
              {profile?.weight_kg ? ` · ${profile.weight_kg} kg` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Regimen</div>
              <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{REGIMEN_LABELS[profile?.regimen] || 'N/A'}</div>
            </div>
            {profile?.diagnosis_year && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Dx Year</div>
                <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{profile.diagnosis_year}</div>
              </div>
            )}
            {profile?.physician_name && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Physician</div>
                <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{profile.physician_name}</div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', width: 'fit-content' }}>
          {['log', 'history'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className="btn" style={{
              background: activeTab === t ? 'var(--accent)' : 'transparent',
              color: activeTab === t ? '#0d1117' : 'var(--text-muted)',
              fontWeight: activeTab === t ? 600 : 400,
              padding: '8px 20px',
            }}>
              {t === 'log' ? '📝 Log Reading' : '📊 My History'}
            </button>
          ))}
        </div>

        {/* Log Form */}
        {activeTab === 'log' && (
          <div className="card" style={{ maxWidth: '600px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '20px' }}>Daily Glucose & Insulin Log</h2>

            {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: '16px' }}>✓ {success}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="field">
                <label>Date</label>
                <input className="input" type="date" value={form.log_date} onChange={set('log_date')} max={today} />
              </div>

              {/* AM Section */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>☀️ Morning (AM)</div>
                <div className="grid-2">
                  <div className="field">
                    <label>RBS (mg/dL)</label>
                    <input className="input" type="number" step="1" placeholder="e.g. 120" value={form.am_rbs} onChange={set('am_rbs')} />
                  </div>
                  <div /> {/* spacer */}
                  {(isNPH) && <>
                    <div className="field">
                      <label>N Dose (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="NPH units" value={form.am_n_dose} onChange={set('am_n_dose')} />
                    </div>
                    <div className="field">
                      <label>R Dose (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="Regular units" value={form.am_r_dose} onChange={set('am_r_dose')} />
                    </div>
                  </>}
                  {isBasalBolus && <>
                    <div className="field">
                      <label>Basal (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="Glargine/Detemir" value={form.am_basal} onChange={set('am_basal')} />
                    </div>
                    <div className="field">
                      <label>Bolus (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="Aspart/Lispro" value={form.am_bolus} onChange={set('am_bolus')} />
                    </div>
                  </>}
                  {isPump && <>
                    <div className="field">
                      <label>Basal Rate (u/hr)</label>
                      <input className="input" type="number" step="0.05" placeholder="0.00" value={form.am_basal} onChange={set('am_basal')} />
                    </div>
                    <div className="field">
                      <label>Bolus (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="units" value={form.am_bolus} onChange={set('am_bolus')} />
                    </div>
                  </>}
                </div>
              </div>

              <hr className="divider" style={{ margin: '0' }} />

              {/* PM Section */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>🌙 Evening (PM)</div>
                <div className="grid-2">
                  <div className="field">
                    <label>RBS (mg/dL)</label>
                    <input className="input" type="number" step="1" placeholder="e.g. 140" value={form.pm_rbs} onChange={set('pm_rbs')} />
                  </div>
                  <div />
                  {isNPH && <>
                    <div className="field">
                      <label>N Dose (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="NPH units" value={form.pm_n_dose} onChange={set('pm_n_dose')} />
                    </div>
                    <div className="field">
                      <label>R Dose (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="Regular units" value={form.pm_r_dose} onChange={set('pm_r_dose')} />
                    </div>
                  </>}
                  {isBasalBolus && <>
                    <div className="field">
                      <label>Basal (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="Glargine/Detemir" value={form.pm_basal} onChange={set('pm_basal')} />
                    </div>
                    <div className="field">
                      <label>Bolus (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="Aspart/Lispro" value={form.pm_bolus} onChange={set('pm_bolus')} />
                    </div>
                  </>}
                  {isPump && <>
                    <div className="field">
                      <label>Basal Rate (u/hr)</label>
                      <input className="input" type="number" step="0.05" placeholder="0.00" value={form.pm_basal} onChange={set('pm_basal')} />
                    </div>
                    <div className="field">
                      <label>Bolus (units)</label>
                      <input className="input" type="number" step="0.5" placeholder="units" value={form.pm_bolus} onChange={set('pm_bolus')} />
                    </div>
                  </>}
                </div>
              </div>

              <div className="field">
                <label>Notes (optional)</label>
                <textarea className="input" rows={2} placeholder="e.g. felt unwell, missed dose, sick day…" value={form.notes} onChange={set('notes')} style={{ resize: 'vertical' }} />
              </div>

              <button className="btn btn-primary" type="submit" disabled={saving} style={{ alignSelf: 'flex-start', minWidth: '160px', justifyContent: 'center' }}>
                {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</> : 'Save Log'}
              </button>
            </form>
          </div>
        )}

        {/* History */}
        {activeTab === 'history' && (
          <div className="card">
            <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '20px' }}>Recent Readings (last 30)</h2>
            {logs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No logs yet. Start by entering your first reading!</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>AM RBS</th>
                      <th>PM RBS</th>
                      <th>AM Insulin</th>
                      <th>PM Insulin</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const amS = rbsStatus(log.am_rbs)
                      const pmS = rbsStatus(log.pm_rbs)
                      const amInsulin = isNPH
                        ? [log.am_n_dose && `N: ${log.am_n_dose}u`, log.am_r_dose && `R: ${log.am_r_dose}u`].filter(Boolean).join(' / ')
                        : [log.am_basal && `Basal: ${log.am_basal}u`, log.am_bolus && `Bolus: ${log.am_bolus}u`].filter(Boolean).join(' / ')
                      const pmInsulin = isNPH
                        ? [log.pm_n_dose && `N: ${log.pm_n_dose}u`, log.pm_r_dose && `R: ${log.pm_r_dose}u`].filter(Boolean).join(' / ')
                        : [log.pm_basal && `Basal: ${log.pm_basal}u`, log.pm_bolus && `Bolus: ${log.pm_bolus}u`].filter(Boolean).join(' / ')
                      return (
                        <tr key={log.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                            {format(parseISO(log.log_date), 'dd MMM yyyy')}
                          </td>
                          <td>
                            {log.am_rbs ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)' }}>{log.am_rbs}</span>
                                {amS && <span className={`badge ${amS.cls}`}>{amS.label}</span>}
                              </div>
                            ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                          </td>
                          <td>
                            {log.pm_rbs ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)' }}>{log.pm_rbs}</span>
                                {pmS && <span className={`badge ${pmS.cls}`}>{pmS.label}</span>}
                              </div>
                            ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                          </td>
                          <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{amInsulin || '—'}</td>
                          <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{pmInsulin || '—'}</td>
                          <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{log.notes || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
