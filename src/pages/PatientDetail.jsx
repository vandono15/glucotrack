import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInYears, differenceInCalendarDays } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
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

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 8 }}>
            <span>{p.name}:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{p.value}{p.name === 'HbA1c' ? '%' : ' mg/dL'}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

// Time-in-range donut chart
function TimeInRangeChart({ logs }) {
  const allRBS = logs.flatMap(l => [l.am_rbs, l.pm_rbs].filter(Boolean))
  if (allRBS.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No readings yet.</p>

  const low = allRBS.filter(v => v < 70).length
  const normal = allRBS.filter(v => v >= 70 && v <= 150).length
  const borderline = allRBS.filter(v => v > 150 && v <= 200).length
  const high = allRBS.filter(v => v > 200).length
  const total = allRBS.length

  const pct = v => Math.round((v / total) * 100)

  const data = [
    { name: 'Normal (70–150)', value: normal, color: '#3ecf8e' },
    { name: 'Borderline (151–200)', value: borderline, color: '#fbbf24' },
    { name: 'High (>200)', value: high, color: '#f87171' },
    { name: 'Low (<70)', value: low, color: '#60a5fa' },
  ].filter(d => d.value > 0)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value">
            {data.map((entry, index) => <Cell key={index} fill={entry.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[
          { label: 'Normal (70–150)', val: normal, color: '#3ecf8e' },
          { label: 'Borderline (151–200)', val: borderline, color: '#fbbf24' },
          { label: 'High (>200)', val: high, color: '#f87171' },
          { label: 'Low (<70)', val: low, color: '#60a5fa' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, marginLeft: 'auto', paddingLeft: 16 }}>
              {pct(item.val)}%
            </span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{total} total readings</div>
      </div>
    </div>
  )
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [hba1cLogs, setHba1cLogs] = useState([])
  const [clinicalNotes, setClinicalNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // HbA1c form
  const [hba1cForm, setHba1cForm] = useState({ recorded_date: format(new Date(), 'yyyy-MM-dd'), hba1c_percent: '', notes: '' })
  const [savingHba1c, setSavingHba1c] = useState(false)
  const [hba1cMsg, setHba1cMsg] = useState('')

  // Clinical note form
  const [noteForm, setNoteForm] = useState({ note_date: format(new Date(), 'yyyy-MM-dd'), note: '' })
  const [savingNote, setSavingNote] = useState(false)
  const [noteMsg, setNoteMsg] = useState('')

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(prof)
    const { data: logsData } = await supabase.from('glucose_logs').select('*').eq('patient_id', id).order('log_date', { ascending: true })
    setLogs(logsData || [])
    const { data: hba1c } = await supabase.from('hba1c_logs').select('*').eq('patient_id', id).order('recorded_date', { ascending: true })
    setHba1cLogs(hba1c || [])
    const { data: notes } = await supabase.from('clinical_notes').select('*').eq('patient_id', id).order('note_date', { ascending: false })
    setClinicalNotes(notes || [])
    setLoading(false)
  }

  async function saveHba1c(e) {
    e.preventDefault()
    setSavingHba1c(true); setHba1cMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('hba1c_logs').upsert({
      patient_id: id,
      recorded_date: hba1cForm.recorded_date,
      hba1c_percent: parseFloat(hba1cForm.hba1c_percent),
      notes: hba1cForm.notes || null,
      created_by: user.id,
    }, { onConflict: 'patient_id,recorded_date' })
    if (error) setHba1cMsg('Error: ' + error.message)
    else { setHba1cMsg('Saved!'); fetchData(); setHba1cForm(f => ({ ...f, hba1c_percent: '', notes: '' })); setTimeout(() => setHba1cMsg(''), 3000) }
    setSavingHba1c(false)
  }

  async function saveNote(e) {
    e.preventDefault()
    setSavingNote(true); setNoteMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('clinical_notes').insert({
      patient_id: id,
      note_date: noteForm.note_date,
      note: noteForm.note,
      created_by: user.id,
    })
    if (error) setNoteMsg('Error: ' + error.message)
    else { setNoteMsg('Note saved!'); fetchData(); setNoteForm(f => ({ ...f, note: '' })); setTimeout(() => setNoteMsg(''), 3000) }
    setSavingNote(false)
  }

  async function deleteNote(noteId) {
    await supabase.from('clinical_notes').delete().eq('id', noteId)
    fetchData()
  }

  function exportCSV() {
    const isNPH = profile?.regimen === 'nph_regular' || profile?.regimen === 'premixed_70_30'
    const headers = isNPH
      ? ['Date', 'AM RBS', 'AM N Dose', 'AM R Dose', 'Missed AM', 'PM RBS', 'PM N Dose', 'PM R Dose', 'Missed PM', 'Notes']
      : ['Date', 'AM RBS', 'AM Basal', 'AM Bolus', 'Missed AM', 'PM RBS', 'PM Basal', 'PM Bolus', 'Missed PM', 'Notes']
    const rows = logs.map(l => isNPH
      ? [l.log_date, l.am_rbs, l.am_n_dose, l.am_r_dose, l.missed_am_dose ? 'Yes' : '', l.pm_rbs, l.pm_n_dose, l.pm_r_dose, l.missed_pm_dose ? 'Yes' : '', l.notes].map(v => v ?? '')
      : [l.log_date, l.am_rbs, l.am_basal, l.am_bolus, l.missed_am_dose ? 'Yes' : '', l.pm_rbs, l.pm_basal, l.pm_bolus, l.missed_pm_dose ? 'Yes' : '', l.notes].map(v => v ?? '')
    )
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${profile?.full_name?.replace(/\s+/g, '_')}_glucose_log.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!profile) return <div className="loading-screen">Patient not found</div>

  const isNPH = profile?.regimen === 'nph_regular' || profile?.regimen === 'premixed_70_30' || !profile?.regimen
  const age = profile?.dob ? differenceInYears(new Date(), parseISO(profile.dob)) : null
  const streak = calcStreak(logs)

  const chartData = [...logs].slice(-14).map(l => ({
    date: format(parseISO(l.log_date), 'dd MMM'),
    'AM RBS': l.am_rbs || null,
    'PM RBS': l.pm_rbs || null,
  }))

  const allRBS = logs.flatMap(l => [l.am_rbs, l.pm_rbs].filter(Boolean))
  const avgRBS = allRBS.length ? Math.round(allRBS.reduce((a, b) => a + b, 0) / allRBS.length) : null
  const highCount = allRBS.filter(v => v > 200).length
  const lowCount = allRBS.filter(v => v < 70).length
  const missedCount = logs.filter(l => l.missed_am_dose || l.missed_pm_dose).length

  const hba1cChartData = hba1cLogs.map(h => ({
    date: format(parseISO(h.recorded_date), 'dd MMM yy'),
    'HbA1c': h.hba1c_percent,
  }))

  const tabs = ['overview', 'logs', 'hba1c', 'notes']

  return (
    <div className="page">
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
        {/* Profile */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{ fontSize: '22px', fontWeight: 600 }}>{profile.full_name}</h1>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                {age !== null ? `${age} years old` : ''}{profile.sex ? ` · ${profile.sex === 'M' ? 'Male' : 'Female'}` : ''}
                {profile.weight_kg ? ` · ${profile.weight_kg} kg` : ''}{profile.dob ? ` · DOB: ${format(parseISO(profile.dob), 'dd MMM yyyy')}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '10px 16px', background: streak >= 7 ? 'rgba(62,207,142,0.1)' : 'var(--surface2)', borderRadius: 10, border: `1px solid ${streak >= 7 ? 'var(--accent)' : 'var(--border)'}` }}>
                <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: streak >= 7 ? 'var(--accent)' : 'var(--text)' }}>🔥 {streak}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Day Streak</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Regimen</div>
                <div style={{ fontWeight: 500, marginTop: '2px', fontSize: 14 }}>{REGIMEN_LABELS[profile.regimen] || '—'}</div>
              </div>
              {profile.diagnosis_year && <div><div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Dx Year</div><div style={{ fontWeight: 500, marginTop: '2px' }}>{profile.diagnosis_year}</div></div>}
              {profile.physician_name && <div><div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Physician</div><div style={{ fontWeight: 500, marginTop: '2px' }}>Dr. {profile.physician_name}</div></div>}
            </div>
          </div>
          {profile.notes && <div style={{ marginTop: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: 8, fontSize: '13px', color: 'var(--text-muted)' }}>📋 {profile.notes}</div>}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Avg RBS', val: avgRBS ?? '—', sub: 'mg/dL overall', color: 'var(--accent)' },
            { label: '⬆ High', val: highCount, sub: '>200 mg/dL', color: 'var(--danger)' },
            { label: '⬇ Low', val: lowCount, sub: '<70 mg/dL', color: 'var(--accent2)' },
            { label: '⚠️ Missed Doses', val: missedCount, sub: 'days with missed dose', color: 'var(--warning)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', flexWrap: 'wrap' }}>
          {[
            { key: 'overview', label: '📊 Overview' },
            { key: 'logs', label: '📋 All Logs' },
            { key: 'hba1c', label: '🧪 HbA1c' },
            { key: 'notes', label: '📝 Clinical Notes' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} className="btn" style={{
              background: activeTab === t.key ? 'var(--accent)' : 'transparent',
              color: activeTab === t.key ? '#0d1117' : 'var(--text-muted)',
              fontWeight: activeTab === t.key ? 600 : 400, padding: '8px 18px',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Time in range */}
            <div className="card">
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Time in Range</h2>
              <TimeInRangeChart logs={logs} />
            </div>

            {/* Glucose trend */}
            {chartData.length > 1 && (
              <div className="card">
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Glucose Trend — Last 14 Logs</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} domain={[0, 'auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <ReferenceLine y={70} stroke="var(--accent2)" strokeDasharray="4 4" />
                    <ReferenceLine y={200} stroke="var(--danger)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="AM RBS" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                    <Line type="monotone" dataKey="PM RBS" stroke="var(--accent2)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Latest HbA1c */}
            {hba1cLogs.length > 0 && (
              <div className="card">
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Latest HbA1c</h2>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {[...hba1cLogs].slice(-3).reverse().map(h => (
                    <div key={h.id} style={{ padding: '16px 20px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', minWidth: 120 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: h.hba1c_percent > 8 ? 'var(--danger)' : h.hba1c_percent > 7 ? 'var(--warning)' : 'var(--accent)' }}>
                        {h.hba1c_percent}%
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{format(parseISO(h.recorded_date), 'dd MMM yyyy')}</div>
                      {h.notes && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{h.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="card">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>All Logs <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>{logs.length} entries</span></h2>
            {logs.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No logs yet.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>AM RBS</th><th>AM Insulin</th><th>PM RBS</th><th>PM Insulin</th><th>Missed</th><th>Notes</th></tr></thead>
                  <tbody>
                    {[...logs].reverse().map(log => {
                      const amB = rbsBadge(log.am_rbs); const pmB = rbsBadge(log.pm_rbs)
                      const amInsulin = isNPH ? [log.am_n_dose && `N ${log.am_n_dose}u`, log.am_r_dose && `R ${log.am_r_dose}u`].filter(Boolean).join(' / ') : [log.am_basal && `Basal ${log.am_basal}u`, log.am_bolus && `Bolus ${log.am_bolus}u`].filter(Boolean).join(' / ')
                      const pmInsulin = isNPH ? [log.pm_n_dose && `N ${log.pm_n_dose}u`, log.pm_r_dose && `R ${log.pm_r_dose}u`].filter(Boolean).join(' / ') : [log.pm_basal && `Basal ${log.pm_basal}u`, log.pm_bolus && `Bolus ${log.pm_bolus}u`].filter(Boolean).join(' / ')
                      const missedFlag = [log.missed_am_dose && 'AM', log.missed_pm_dose && 'PM'].filter(Boolean).join(', ')
                      return (
                        <tr key={log.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{format(parseISO(log.log_date), 'dd MMM yyyy')}</td>
                          <td>{log.am_rbs ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontFamily: 'var(--font-mono)' }}>{log.am_rbs}</span>{amB && <span className={`badge ${amB.cls}`}>{amB.label}</span>}</div> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                          <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{amInsulin || '—'}</td>
                          <td>{log.pm_rbs ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontFamily: 'var(--font-mono)' }}>{log.pm_rbs}</span>{pmB && <span className={`badge ${pmB.cls}`}>{pmB.label}</span>}</div> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                          <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{pmInsulin || '—'}</td>
                          <td>{missedFlag ? <span className="badge badge-warn">⚠️ {missedFlag}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                          <td style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: 160 }}>{log.notes || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* HBA1C TAB */}
        {activeTab === 'hba1c' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Add HbA1c */}
            <div className="card">
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Record HbA1c</h2>
              {hba1cMsg && <div className={`alert ${hba1cMsg.startsWith('Error') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{hba1cMsg}</div>}
              <form onSubmit={saveHba1c} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="field" style={{ minWidth: 160 }}>
                  <label>Date</label>
                  <input className="input" type="date" value={hba1cForm.recorded_date} onChange={e => setHba1cForm(f => ({ ...f, recorded_date: e.target.value }))} required />
                </div>
                <div className="field" style={{ minWidth: 120 }}>
                  <label>HbA1c (%)</label>
                  <input className="input" type="number" step="0.1" min="4" max="20" placeholder="e.g. 7.5" value={hba1cForm.hba1c_percent} onChange={e => setHba1cForm(f => ({ ...f, hba1c_percent: e.target.value }))} required />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 200 }}>
                  <label>Notes (optional)</label>
                  <input className="input" placeholder="e.g. pre-clinic check" value={hba1cForm.notes} onChange={e => setHba1cForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <button className="btn btn-primary" type="submit" disabled={savingHba1c} style={{ marginBottom: 0 }}>
                  {savingHba1c ? 'Saving…' : '+ Add'}
                </button>
              </form>
            </div>

            {/* HbA1c trend chart */}
            {hba1cChartData.length > 1 && (
              <div className="card">
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>HbA1c Trend</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={hba1cChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} domain={[4, 12]} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={7} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: 'Target 7%', fill: 'var(--accent)', fontSize: 11 }} />
                    <ReferenceLine y={8} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: '8%', fill: 'var(--danger)', fontSize: 11 }} />
                    <Line type="monotone" dataKey="HbA1c" stroke="var(--warning)" strokeWidth={2.5} dot={{ r: 5, fill: 'var(--warning)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* HbA1c history */}
            {hba1cLogs.length > 0 && (
              <div className="card">
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>HbA1c History</h2>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>HbA1c</th><th>Status</th><th>Notes</th></tr></thead>
                    <tbody>
                      {[...hba1cLogs].reverse().map(h => (
                        <tr key={h.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{format(parseISO(h.recorded_date), 'dd MMM yyyy')}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: h.hba1c_percent > 8 ? 'var(--danger)' : h.hba1c_percent > 7 ? 'var(--warning)' : 'var(--accent)' }}>{h.hba1c_percent}%</td>
                          <td><span className={`badge ${h.hba1c_percent > 8 ? 'badge-high' : h.hba1c_percent > 7 ? 'badge-warn' : 'badge-normal'}`}>{h.hba1c_percent > 8 ? 'Poor' : h.hba1c_percent > 7 ? 'Borderline' : 'Good'}</span></td>
                          <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{h.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CLINICAL NOTES TAB */}
        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card">
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Add Clinical Note</h2>
              {noteMsg && <div className={`alert ${noteMsg.startsWith('Error') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{noteMsg}</div>}
              <form onSubmit={saveNote} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field" style={{ maxWidth: 200 }}>
                  <label>Visit Date</label>
                  <input className="input" type="date" value={noteForm.note_date} onChange={e => setNoteForm(f => ({ ...f, note_date: e.target.value }))} required />
                </div>
                <div className="field">
                  <label>Note</label>
                  <textarea className="input" rows={4} placeholder="Clinical observations, dose adjustments, patient concerns, plan…" value={noteForm.note} onChange={e => setNoteForm(f => ({ ...f, note: e.target.value }))} style={{ resize: 'vertical' }} required />
                </div>
                <button className="btn btn-primary" type="submit" disabled={savingNote} style={{ alignSelf: 'flex-start' }}>
                  {savingNote ? 'Saving…' : '+ Add Note'}
                </button>
              </form>
            </div>

            {clinicalNotes.length === 0 ? (
              <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No clinical notes yet.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {clinicalNotes.map(note => (
                  <div key={note.id} className="card" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{format(parseISO(note.note_date), 'dd MMM yyyy')}</span>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteNote(note.id)}>Delete</button>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{note.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
