import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ThemeToggle } from '../lib/theme.jsx'
import ChangePasswordModal from '../components/ChangePasswordModal.jsx'
import { format, parseISO, differenceInYears } from 'date-fns'

const REGIMEN_LABELS = {
  nph_regular: 'NPH + Regular',
  basal_bolus: 'Basal-Bolus',
  premixed_70_30: 'Premixed 70/30',
  pump_csii: 'CSII Pump',
  other: 'Other',
}

function rbsFlag(val) {
  if (!val) return null
  if (val < 70) return 'low'
  if (val > 200) return 'high'
  if (val > 150) return 'warn'
  return 'normal'
}

export default function DoctorDashboard() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [recentLogs, setRecentLogs] = useState({})
  const [allLogs, setAllLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    setDoctorName(me?.full_name || 'Doctor')

    const { data: pts } = await supabase.from('profiles').select('*').eq('role', 'patient').order('full_name')
    setPatients(pts || [])

    if (pts && pts.length > 0) {
      const ids = pts.map(p => p.id)
      const { data: logs } = await supabase.from('glucose_logs').select('*').in('patient_id', ids).order('log_date', { ascending: false })
      setAllLogs(logs || [])
      const byPatient = {}
      logs?.forEach(log => {
        if (!byPatient[log.patient_id]) byPatient[log.patient_id] = []
        byPatient[log.patient_id].push(log)
      })
      setRecentLogs(byPatient)
    }
    setLoading(false)
  }

  async function handleSignOut() { await supabase.auth.signOut() }

  function exportAllCSV() {
    setExportingAll(true)
    const headers = [
      'Patient Name', 'DOB', 'Age', 'Sex', 'Weight (kg)', 'Diagnosis Year', 'Regimen',
      'Date', 'AM RBS', 'AM N Dose', 'AM R Dose', 'AM Basal', 'AM Bolus',
      'Missed AM', 'PM RBS', 'PM N Dose', 'PM R Dose', 'PM Basal', 'PM Bolus', 'Missed PM', 'Notes'
    ]

    const patientMap = {}
    patients.forEach(p => { patientMap[p.id] = p })

    const rows = allLogs.map(l => {
      const p = patientMap[l.patient_id]
      const age = p?.dob ? differenceInYears(new Date(), parseISO(p.dob)) : ''
      return [
        p?.full_name || '', p?.dob || '', age, p?.sex || '', p?.weight_kg || '',
        p?.diagnosis_year || '', REGIMEN_LABELS[p?.regimen] || p?.regimen || '',
        l.log_date, l.am_rbs ?? '', l.am_n_dose ?? '', l.am_r_dose ?? '',
        l.am_basal ?? '', l.am_bolus ?? '',
        l.missed_am_dose ? 'Yes' : '',
        l.pm_rbs ?? '', l.pm_n_dose ?? '', l.pm_r_dose ?? '',
        l.pm_basal ?? '', l.pm_bolus ?? '',
        l.missed_pm_dose ? 'Yes' : '',
        l.notes || ''
      ]
    })

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `glucotrack_all_patients_${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExportingAll(false)
  }

  const filtered = patients.filter(p =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.physician_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPatients = patients.length
  const flaggedToday = patients.filter(p => {
    const logs = recentLogs[p.id] || []
    const last = logs[0]
    if (!last) return false
    return [last.am_rbs, last.pm_rbs].some(v => v && (v < 70 || v > 200))
  }).length

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 0' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 6 L16 26 M6 16 L26 16" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="16" cy="16" r="4" fill="var(--accent)" fillOpacity="0.4"/>
              <circle cx="16" cy="16" r="2" fill="var(--accent)"/>
            </svg>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px' }}>GlucoTrack</span>
            <span style={{ padding: '2px 10px', background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>Physician</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Dr. {doctorName}</span>
            <ThemeToggle />
            <button className="btn btn-secondary btn-sm" onClick={() => setShowChangePassword(true)}>🔒 Password</button>
            <button className="btn btn-secondary btn-sm" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '32px 24px' }}>
        {/* Stats */}
        <div className="grid-3" style={{ marginBottom: '28px' }}>
          <div className="stat-card">
            <div className="stat-label">Total Patients</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{totalPatients}</div>
            <div className="stat-sub">registered in clinic</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">⚠️ Flagged</div>
            <div className="stat-value" style={{ color: flaggedToday > 0 ? 'var(--danger)' : 'var(--accent)' }}>{flaggedToday}</div>
            <div className="stat-sub">out-of-range last reading</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Logs This Month</div>
            <div className="stat-value" style={{ color: 'var(--accent2)' }}>
              {Object.values(recentLogs).reduce((sum, logs) => {
                const thisMonth = new Date().toISOString().slice(0, 7)
                return sum + logs.filter(l => l.log_date?.startsWith(thisMonth)).length
              }, 0)}
            </div>
            <div className="stat-sub">entries recorded</div>
          </div>
        </div>

        {/* Search + Export All */}
        <div style={{ display: 'flex', gap: 12, marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="🔍 Search patients by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: '320px' }}
          />
          <button
            className="btn btn-secondary"
            onClick={exportAllCSV}
            disabled={exportingAll || allLogs.length === 0}
            style={{ marginLeft: 'auto' }}
          >
            {exportingAll ? '⏳ Exporting…' : '⬇ Export All Patients CSV'}
          </button>
        </div>

        {/* Patient list */}
        <div className="card">
          <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '20px' }}>
            All Patients
            <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '10px' }}>{filtered.length} shown</span>
          </h2>

          {filtered.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No patients found.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Age / Sex</th>
                    <th>Regimen</th>
                    <th>Last AM RBS</th>
                    <th>Last PM RBS</th>
                    <th>Last Log</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const logs = recentLogs[p.id] || []
                    const last = logs[0]
                    const age = p.dob ? differenceInYears(new Date(), parseISO(p.dob)) : null
                    const amF = last ? rbsFlag(last.am_rbs) : null
                    const pmF = last ? rbsFlag(last.pm_rbs) : null
                    return (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/doctor/patient/${p.id}`)}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{p.full_name}</div>
                          {p.physician_name && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Dr. {p.physician_name}</div>}
                        </td>
                        <td style={{ fontSize: '13px' }}>{age !== null ? `${age}y` : '—'}{p.sex ? ` / ${p.sex}` : ''}</td>
                        <td><span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{REGIMEN_LABELS[p.regimen] || '—'}</span></td>
                        <td>
                          {last?.am_rbs ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{last.am_rbs}</span>
                              {amF && amF !== 'normal' && <span className={`badge badge-${amF}`}>{amF === 'high' ? '▲' : amF === 'low' ? '▼' : '!'}</span>}
                            </div>
                          ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td>
                          {last?.pm_rbs ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{last.pm_rbs}</span>
                              {pmF && pmF !== 'normal' && <span className={`badge badge-${pmF}`}>{pmF === 'high' ? '▲' : pmF === 'low' ? '▼' : '!'}</span>}
                            </div>
                          ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{last?.log_date ? format(parseISO(last.log_date), 'dd MMM') : 'No logs'}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/doctor/patient/${p.id}`) }}>View →</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
