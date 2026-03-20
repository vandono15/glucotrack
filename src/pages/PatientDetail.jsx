import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInYears } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend
} from 'recharts'

const REGIMEN_LABELS = {
  nph_regular: 'NPH + Regular (N&R)',
  basal_bolus: 'Basal-Bolus',
  premixed_70_30: 'Premixed 70/30',
  pump_csii: 'CSII Pump',
  other: 'Other',
}

function rbsBadge(val) {
  if (!val) return null
  if (val < 70) return { label: 'Low', cls: 'badge-low' }
  if (val > 200) return { label: 'High', cls: 'badge-high' }
  if (val > 150) return { label: 'Borderline', cls: 'badge-warn' }
  return { label: 'Normal', cls: 'badge-normal' }
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 8 }}>
            <span>{p.name}:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{p.value} mg/dL</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(prof)
    const { data: logsData } = await supabase
      .from('glucose_logs')
      .select('*')
      .eq('patient_id', id)
      .order('log_date', { ascending: true })
    setLogs(logsData || [])
    setLoading(false)
  }

  function exportCSV() {
    const isNPH = profile?.regimen === 'nph_regular' || profile?.regimen === 'premixed_70_30'
    const headers = isNPH
      ? ['Date', 'AM RBS', 'AM N Dose', 'AM R Dose', 'PM RBS', 'PM N Dose', 'PM R Dose', 'Notes']
      : ['Date', 'AM RBS', 'AM Basal', 'AM Bolus', 'PM RBS', 'PM Basal', 'PM Bolus', 'Notes']

    const rows = logs.map(l => isNPH
      ? [l.log_date, l.am_rbs, l.am_n_dose, l.am_r_dose, l.pm_rbs, l.pm_n_dose, l.pm_r_dose, l.notes].map(v => v ?? '')
      : [l.log_date, l.am_rbs, l.am_basal, l.am_bolus, l.pm_rbs, l.pm_basal, l.pm_bolus, l.notes].map(v => v ?? '')
    )

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${profile?.full_name?.replace(/\s+/g, '_')}_glucose_log.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!profile) return <div className="loading-screen">Patient not found</div>

  const isNPH = profile?.regimen === 'nph_regular' || profile?.regimen === 'premixed_70_30' || !profile?.regimen
  const age = profile?.dob ? differenceInYears(new Date(), parseISO(profile.dob)) : null

  // Chart data (last 14 entries)
  const chartData = [...logs].slice(-14).map(l => ({
    date: format(parseISO(l.log_date), 'dd MMM'),
    'AM RBS': l.am_rbs || null,
    'PM RBS': l.pm_rbs || null,
  }))

  // Summary stats
  const allRBS = logs.flatMap(l => [l.am_rbs, l.pm_rbs].filter(Boolean))
  const avgRBS = allRBS.length ? Math.round(allRBS.reduce((a, b) => a + b, 0) / allRBS.length) : null
  const highCount = allRBS.filter(v => v > 200).length
  const lowCount = allRBS.filter(v => v < 70).length

  return (
    <div className="page">
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '16px 0' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/doctor')}>← Back</button>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px' }}>GlucoTrack</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
        </div>
      </div>

      <div className="container" style={{ padding: '32px 24px' }}>
        {/* Profile header */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{ fontSize: '22px', fontWeight: 600 }}>{profile.full_name}</h1>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                {age !== null ? `${age} years old` : ''}
                {profile.sex ? ` · ${profile.sex === 'M' ? 'Male' : 'Female'}` : ''}
                {profile.weight_kg ? ` · ${profile.weight_kg} kg` : ''}
                {profile.dob ? ` · DOB: ${format(parseISO(profile.dob), 'dd MMM yyyy')}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Regimen</div>
                <div style={{ fontWeight: 500, marginTop: '2px' }}>{REGIMEN_LABELS[profile.regimen] || '—'}</div>
              </div>
              {profile.diagnosis_year && (
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Dx Year</div>
                  <div style={{ fontWeight: 500, marginTop: '2px' }}>{profile.diagnosis_year}</div>
                </div>
              )}
              {profile.physician_name && (
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Physician</div>
                  <div style={{ fontWeight: 500, marginTop: '2px' }}>Dr. {profile.physician_name}</div>
                </div>
              )}
            </div>
          </div>
          {profile.notes && (
            <div style={{ marginTop: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: 8, fontSize: '13px', color: 'var(--text-muted)' }}>
              📋 {profile.notes}
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid-3" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">Avg RBS</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{avgRBS ?? '—'}</div>
            <div className="stat-sub">mg/dL across all readings</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">⬆ High Readings</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{highCount}</div>
            <div className="stat-sub">&gt;200 mg/dL</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">⬇ Low Readings</div>
            <div className="stat-value" style={{ color: 'var(--accent2)' }}>{lowCount}</div>
            <div className="stat-sub">&lt;70 mg/dL</div>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 1 && (
          <div className="card" style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Glucose Trend — Last 14 Logs</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <ReferenceLine y={70} stroke="var(--accent2)" strokeDasharray="4 4" label={{ value: '70', fill: 'var(--accent2)', fontSize: 11 }} />
                <ReferenceLine y={200} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: '200', fill: 'var(--danger)', fontSize: 11 }} />
                <Line type="monotone" dataKey="AM RBS" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4, fill: 'var(--accent)' }} connectNulls />
                <Line type="monotone" dataKey="PM RBS" stroke="var(--accent2)" strokeWidth={2} dot={{ r: 4, fill: 'var(--accent2)' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Logs table */}
        <div className="card">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>
            All Logs
            <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px' }}>{logs.length} entries</span>
          </h2>
          {logs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>This patient has not submitted any logs yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>AM RBS</th>
                    <th>AM Insulin</th>
                    <th>PM RBS</th>
                    <th>PM Insulin</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...logs].reverse().map(log => {
                    const amB = rbsBadge(log.am_rbs)
                    const pmB = rbsBadge(log.pm_rbs)
                    const amInsulin = isNPH
                      ? [log.am_n_dose && `N ${log.am_n_dose}u`, log.am_r_dose && `R ${log.am_r_dose}u`].filter(Boolean).join(' / ')
                      : [log.am_basal && `Basal ${log.am_basal}u`, log.am_bolus && `Bolus ${log.am_bolus}u`].filter(Boolean).join(' / ')
                    const pmInsulin = isNPH
                      ? [log.pm_n_dose && `N ${log.pm_n_dose}u`, log.pm_r_dose && `R ${log.pm_r_dose}u`].filter(Boolean).join(' / ')
                      : [log.pm_basal && `Basal ${log.pm_basal}u`, log.pm_bolus && `Bolus ${log.pm_bolus}u`].filter(Boolean).join(' / ')

                    return (
                      <tr key={log.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                          {format(parseISO(log.log_date), 'dd MMM yyyy')}
                        </td>
                        <td>
                          {log.am_rbs ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'var(--font-mono)' }}>{log.am_rbs}</span>
                              {amB && <span className={`badge ${amB.cls}`}>{amB.label}</span>}
                            </div>
                          ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{amInsulin || '—'}</td>
                        <td>
                          {log.pm_rbs ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'var(--font-mono)' }}>{log.pm_rbs}</span>
                              {pmB && <span className={`badge ${pmB.cls}`}>{pmB.label}</span>}
                            </div>
                          ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{pmInsulin || '—'}</td>
                        <td style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '160px' }}>{log.notes || '—'}</td>
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
