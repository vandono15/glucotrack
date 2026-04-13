import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ThemeToggle } from '../lib/theme.jsx'
import ChangePasswordModal from '../components/ChangePasswordModal.jsx'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'

const REGIMEN_LABELS = {
  nph_regular: 'NPH + Regular (N&R)',
  basal_bolus: 'Basal-Bolus',
  premixed_70_30: 'Premixed 70/30',
  pump_csii: 'CSII Pump',
  other: 'Other',
}

function rbsStatus(val) {
  if (!val) return null
  if (val < 70) return { label: 'Low', cls: 'badge-low' }
  if (val > 200) return { label: 'High', cls: 'badge-high' }
  if (val > 150) return { label: 'Borderline', cls: 'badge-warn' }
  return { label: 'Normal', cls: 'badge-normal' }
}

function calcStreak(logs) {
  if (!logs || logs.length === 0) return 0
  const sorted = [...logs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date))
  let streak = 1
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = differenceInCalendarDays(parseISO(sorted[i].log_date), parseISO(sorted[i + 1].log_date))
    if (diff === 1) streak++
    else break
  }
  return streak
}

const HYPO_SYMPTOMS = ['Shakiness', 'Sweating', 'Dizziness', 'Headache', 'Confusion', 'Palpitations', 'Hunger', 'Blurred vision']

// ── These components are defined OUTSIDE PatientDashboard so they never remount on state change ──

function RBSInput({ value, onChange, placeholder }) {
  return (
    <input
      className="input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder={placeholder || 'e.g. 120'}
      value={value}
      onChange={onChange}
    />
  )
}

function DoseInput({ value, onChange, placeholder }) {
  return (
    <input
      className="input"
      type="text"
      inputMode="decimal"
      placeholder={placeholder || '0'}
      value={value}
      onChange={onChange}
    />
  )
}

function TimePointSection({ label, color, rbsField, nField, rField, basalField, bolusField, missedField, missedLabel, form, onChange, onToggle, regimen }) {
  const isNPH = regimen === 'nph_regular' || regimen === 'premixed_70_30' || !regimen
  const isBasalBolus = regimen === 'basal_bolus'
  const isPump = regimen === 'pump_csii'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface2)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{label}</div>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>RBS (mg/dL)</label>
          <RBSInput value={form[rbsField]} onChange={e => onChange(rbsField, e.target.value)} />
        </div>
        <div />
      </div>
      {(nField || basalField) && (
        <div className="grid-2" style={{ marginBottom: 12 }}>
          {isNPH && nField && (
            <>
              <div className="field">
                <label>N Dose (units)</label>
                <DoseInput value={form[nField]} onChange={e => onChange(nField, e.target.value)} placeholder="NPH" />
              </div>
              {rField && (
                <div className="field">
                  <label>R Dose (units)</label>
                  <DoseInput value={form[rField]} onChange={e => onChange(rField, e.target.value)} placeholder="Regular" />
                </div>
              )}
            </>
          )}
          {isBasalBolus && basalField && (
            <>
              <div className="field">
                <label>Basal (units)</label>
                <DoseInput value={form[basalField]} onChange={e => onChange(basalField, e.target.value)} />
              </div>
              {bolusField && (
                <div className="field">
                  <label>Bolus (units)</label>
                  <DoseInput value={form[bolusField]} onChange={e => onChange(bolusField, e.target.value)} />
                </div>
              )}
            </>
          )}
          {isPump && basalField && (
            <>
              <div className="field">
                <label>Basal (u/hr)</label>
                <DoseInput value={form[basalField]} onChange={e => onChange(basalField, e.target.value)} />
              </div>
              {bolusField && (
                <div className="field">
                  <label>Bolus (units)</label>
                  <DoseInput value={form[bolusField]} onChange={e => onChange(bolusField, e.target.value)} />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {missedField && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: form[missedField] ? 'var(--warning)' : 'var(--text-muted)' }}>
          <input type="checkbox" checked={form[missedField]} onChange={() => onToggle(missedField)} style={{ width: 16, height: 16, accentColor: 'var(--warning)' }} />
          ⚠️ {missedLabel}
        </label>
      )}
    </div>
  )
}

export default function PatientDashboard() {
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('log')
  const [showChangePassword, setShowChangePassword] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    log_date: today,
    fasting_rbs: '', am_rbs: '', pre_lunch_rbs: '', pre_dinner_rbs: '', pm_rbs: '', bedtime_rbs: '',
    fasting_n_dose: '', fasting_r_dose: '', fasting_basal: '', fasting_bolus: '',
    am_n_dose: '', am_r_dose: '', am_basal: '', am_bolus: '',
    lunch_n_dose: '', lunch_r_dose: '', lunch_basal: '', lunch_bolus: '',
    dinner_n_dose: '', dinner_r_dose: '', dinner_basal: '', dinner_bolus: '',
    pm_n_dose: '', pm_r_dose: '', pm_basal: '', pm_bolus: '',
    bedtime_n_dose: '', bedtime_basal: '',
    missed_am_dose: false, missed_pm_dose: false,
    missed_lunch_dose: false, missed_dinner_dose: false, missed_bedtime_dose: false,
    exercise_notes: '',
    hypo_symptoms: [],
    notes: ''
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(profileData)
    const { data: logsData } = await supabase
      .from('glucose_logs').select('*').eq('patient_id', user.id)
      .order('log_date', { ascending: false }).limit(30)
    setLogs(logsData || [])
    setLoading(false)
  }

  // Stable onChange handler — does NOT recreate on every render
  const handleFieldChange = useCallback((field, value) => {
    setForm(f => ({ ...f, [field]: value }))
  }, [])

  const handleToggle = useCallback((field) => {
    setForm(f => ({ ...f, [field]: !f[field] }))
  }, [])

  function toggleHypo(symptom) {
    setForm(f => ({
      ...f,
      hypo_symptoms: f.hypo_symptoms.includes(symptom)
        ? f.hypo_symptoms.filter(s => s !== symptom)
        : [...f.hypo_symptoms, symptom]
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    const { data: { user } } = await supabase.auth.getUser()

    const n = v => parseFloat(v) || null

    const payload = {
      patient_id: user.id,
      log_date: form.log_date,
      fasting_rbs: n(form.fasting_rbs), am_rbs: n(form.am_rbs),
      pre_lunch_rbs: n(form.pre_lunch_rbs), pre_dinner_rbs: n(form.pre_dinner_rbs),
      pm_rbs: n(form.pm_rbs), bedtime_rbs: n(form.bedtime_rbs),
      fasting_n_dose: n(form.fasting_n_dose), fasting_r_dose: n(form.fasting_r_dose),
      fasting_basal: n(form.fasting_basal), fasting_bolus: n(form.fasting_bolus),
      am_n_dose: n(form.am_n_dose), am_r_dose: n(form.am_r_dose),
      am_basal: n(form.am_basal), am_bolus: n(form.am_bolus),
      lunch_n_dose: n(form.lunch_n_dose), lunch_r_dose: n(form.lunch_r_dose),
      lunch_basal: n(form.lunch_basal), lunch_bolus: n(form.lunch_bolus),
      dinner_n_dose: n(form.dinner_n_dose), dinner_r_dose: n(form.dinner_r_dose),
      dinner_basal: n(form.dinner_basal), dinner_bolus: n(form.dinner_bolus),
      pm_n_dose: n(form.pm_n_dose), pm_r_dose: n(form.pm_r_dose),
      pm_basal: n(form.pm_basal), pm_bolus: n(form.pm_bolus),
      bedtime_n_dose: n(form.bedtime_n_dose), bedtime_basal: n(form.bedtime_basal),
      missed_am_dose: form.missed_am_dose, missed_pm_dose: form.missed_pm_dose,
      missed_lunch_dose: form.missed_lunch_dose, missed_dinner_dose: form.missed_dinner_dose,
      missed_bedtime_dose: form.missed_bedtime_dose,
      exercise_notes: form.exercise_notes || null,
      hypo_symptoms: form.hypo_symptoms.length > 0 ? form.hypo_symptoms.join(', ') : null,
      notes: form.notes || null,
    }

    const { error: err } = await supabase.from('glucose_logs').upsert(payload, { onConflict: 'patient_id,log_date' })
    if (err) setError(err.message)
    else { setSuccess('Log saved!'); fetchData(); setTimeout(() => setSuccess(''), 3000) }
    setSaving(false)
  }

  async function handleSignOut() { await supabase.auth.signOut() }

  const streak = calcStreak(logs)
  const regimen = profile?.regimen

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 0' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 6 L16 26 M6 16 L26 16" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="16" cy="16" r="4" fill="var(--accent)" fillOpacity="0.4"/>
              <circle cx="16" cy="16" r="2" fill="var(--accent)"/>
            </svg>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px' }}>GlucoTrack</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{profile?.full_name}</span>
            <ThemeToggle />
            <button className="btn btn-secondary btn-sm" onClick={() => setShowChangePassword(true)}>🔒 Password</button>
            <button className="btn btn-secondary btn-sm" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '28px 24px' }}>
        {/* Profile strip */}
        <div className="card" style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>{profile?.full_name}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {profile?.dob ? `DOB: ${format(parseISO(profile.dob), 'dd MMM yyyy')}` : ''}
              {profile?.sex ? ` · ${profile.sex === 'M' ? 'Male' : 'Female'}` : ''}
              {profile?.weight_kg ? ` · ${profile.weight_kg} kg` : ''}
              {profile?.phone ? ` · ${profile.phone}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', padding: '8px 16px', background: streak >= 7 ? 'rgba(62,207,142,0.1)' : 'var(--surface2)', borderRadius: 10, border: `1px solid ${streak >= 7 ? 'var(--accent)' : 'var(--border)'}` }}>
              <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: streak >= 7 ? 'var(--accent)' : 'var(--text)' }}>🔥 {streak}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Day Streak</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Regimen</div>
              <div style={{ fontSize: '13px', fontWeight: 500, marginTop: 2 }}>{REGIMEN_LABELS[profile?.regimen] || 'N/A'}</div>
            </div>
            {profile?.physician_name && (
              <div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Physician</div>
                <div style={{ fontSize: '13px', fontWeight: 500, marginTop: 2 }}>Dr. {profile.physician_name}</div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', width: 'fit-content' }}>
          {['log', 'history'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className="btn" style={{
              background: activeTab === t ? 'var(--accent)' : 'transparent',
              color: activeTab === t ? '#fff' : 'var(--text-muted)',
              fontWeight: activeTab === t ? 600 : 400, padding: '8px 20px',
            }}>
              {t === 'log' ? '📝 Log Reading' : '📊 My History'}
            </button>
          ))}
        </div>

        {activeTab === 'log' && (
          <div className="card" style={{ maxWidth: '640px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '20px' }}>Daily Glucose & Insulin Log</h2>
            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>✓ {success}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Date</label>
                <input className="input" type="date" value={form.log_date} onChange={e => handleFieldChange('log_date', e.target.value)} max={today} />
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -4 }}>All time points are optional — fill in whichever apply to your regimen.</p>

              <TimePointSection label="🌅 Fasting (Pre-Breakfast)" color="var(--accent)"
                rbsField="fasting_rbs" nField="fasting_n_dose" rField="fasting_r_dose"
                basalField="fasting_basal" bolusField="fasting_bolus"
                missedField="missed_am_dose" missedLabel="Missed fasting/breakfast dose"
                form={form} onChange={handleFieldChange} onToggle={handleToggle} regimen={regimen} />

              <TimePointSection label="☀️ Morning (AM)" color="#60a5fa"
                rbsField="am_rbs" nField="am_n_dose" rField="am_r_dose"
                basalField="am_basal" bolusField="am_bolus"
                missedField={null} missedLabel={null}
                form={form} onChange={handleFieldChange} onToggle={handleToggle} regimen={regimen} />

              <TimePointSection label="🕛 Pre-Lunch" color="var(--warning)"
                rbsField="pre_lunch_rbs" nField="lunch_n_dose" rField="lunch_r_dose"
                basalField="lunch_basal" bolusField="lunch_bolus"
                missedField="missed_lunch_dose" missedLabel="Missed lunch dose"
                form={form} onChange={handleFieldChange} onToggle={handleToggle} regimen={regimen} />

              <TimePointSection label="🌆 Pre-Dinner" color="#f97316"
                rbsField="pre_dinner_rbs" nField="dinner_n_dose" rField="dinner_r_dose"
                basalField="dinner_basal" bolusField="dinner_bolus"
                missedField="missed_dinner_dose" missedLabel="Missed dinner dose"
                form={form} onChange={handleFieldChange} onToggle={handleToggle} regimen={regimen} />

              <TimePointSection label="🌙 Evening (PM)" color="#a78bfa"
                rbsField="pm_rbs" nField="pm_n_dose" rField="pm_r_dose"
                basalField="pm_basal" bolusField="pm_bolus"
                missedField="missed_pm_dose" missedLabel="Missed evening dose"
                form={form} onChange={handleFieldChange} onToggle={handleToggle} regimen={regimen} />

              <TimePointSection label="🌛 Bedtime" color="#ec4899"
                rbsField="bedtime_rbs" nField="bedtime_n_dose" rField={null}
                basalField="bedtime_basal" bolusField={null}
                missedField="missed_bedtime_dose" missedLabel="Missed bedtime dose"
                form={form} onChange={handleFieldChange} onToggle={handleToggle} regimen={regimen} />

              <hr className="divider" style={{ margin: 0 }} />

              <div className="field">
                <label>🏃 Exercise Today</label>
                <input className="input" type="text" placeholder="e.g. 30 min walk, football, swimming…"
                  value={form.exercise_notes} onChange={e => handleFieldChange('exercise_notes', e.target.value)} />
              </div>

              <div className="field">
                <label>⚡ Hypoglycaemia Symptoms</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {HYPO_SYMPTOMS.map(s => (
                    <button key={s} type="button" onClick={() => toggleHypo(s)} style={{
                      padding: '6px 14px', borderRadius: 20, border: '1px solid',
                      borderColor: form.hypo_symptoms.includes(s) ? 'var(--danger)' : 'var(--border)',
                      background: form.hypo_symptoms.includes(s) ? 'rgba(248,113,113,0.15)' : 'var(--surface2)',
                      color: form.hypo_symptoms.includes(s) ? 'var(--danger)' : 'var(--text-muted)',
                      fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s'
                    }}>{s}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Notes (optional)</label>
                <textarea className="input" rows={2} placeholder="e.g. felt unwell, sick day…"
                  value={form.notes} onChange={e => handleFieldChange('notes', e.target.value)} style={{ resize: 'vertical' }} />
              </div>

              <button className="btn btn-primary" type="submit" disabled={saving} style={{ alignSelf: 'flex-start', minWidth: 160, justifyContent: 'center' }}>
                {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</> : 'Save Log'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="card">
            <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '20px' }}>Recent Readings (last 30)</h2>
            {logs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No logs yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Fasting</th>
                      <th>AM</th>
                      <th>Pre-Lunch</th>
                      <th>Pre-Dinner</th>
                      <th>PM</th>
                      <th>Bedtime</th>
                      <th>Hypo Sx</th>
                      <th>Exercise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const fields = [log.fasting_rbs, log.am_rbs, log.pre_lunch_rbs, log.pre_dinner_rbs, log.pm_rbs, log.bedtime_rbs]
                      return (
                        <tr key={log.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{format(parseISO(log.log_date), 'dd MMM yyyy')}</td>
                          {fields.map((val, i) => {
                            const s = rbsStatus(val)
                            return (
                              <td key={i}>
                                {val ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{val}</span>
                                    {s && <span className={`badge ${s.cls}`} style={{ fontSize: 10, padding: '1px 6px' }}>{s.label}</span>}
                                  </div>
                                ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                              </td>
                            )
                          })}
                          <td style={{ fontSize: 12, color: 'var(--danger)' }}>{log.hypo_symptoms || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.exercise_notes || '—'}</td>
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
