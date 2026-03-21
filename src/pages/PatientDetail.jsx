import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ThemeToggle, useTheme } from '../lib/theme.jsx'
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
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
        {payload.map(p => p.value != null && (
          <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 8 }}>
            <span>{p.name}:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{p.value}{p.name === 'HbA1c' ? '%' : ' mg/dL'}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

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
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2} dataKey="value">
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
            <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, marginLeft: 'auto', paddingLeft: 16, color: 'var(--text)' }}>{pct(item.val)}%</span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{total} total readings</div>
      </div>
    </div>
  )
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [hba1cLogs, setHba1cLogs] = useState([])
  const [clinicalNotes, setClinicalNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [chartDays, setChartDays] = useState(7)

  const [hba1cForm, setHba1cForm] = useState({ recorded_date: format(new Date(), 'yyyy-MM-dd'), hba1c_percent: '', notes: '' })
  const [savingHba1c, setSavingHba1c] = useState(false)
  const [hba1cMsg, setHba1cMsg] = useState('')

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
    e.preventDefault(); setSavingHba1c(true); setHba1cMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('hba1c_logs').upsert({
      patient_id: id, recorded_date: hba1cForm.recorded_date,
      hba1c_percent: parseFloat(hba1cForm.hba1c_percent),
      notes: hba1cForm.notes || null, created_by: user.id,
    }, { onConflict: 'patient_id,recorded_date' })
    if (error) setHba1cMsg('Error: ' + error.message)
    else { setHba1cMsg('Saved!'); fetchData(); setHba1cForm(f => ({ ...f, hba1c_percent: '', notes: '' })); setTimeout(() => setHba1cMsg(''), 3000) }
    setSavingHba1c(false)
  }

  async function saveNote(e) {
    e.preventDefault(); setSavingNote(true); setNoteMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('clinical_notes').insert({
      patient_id: id, note_date: noteForm.note_date, note: noteForm.note, created_by: user.id,
    })
    if (error) setNoteMsg('Error: ' + error.message)
    else { setNoteMsg('Saved!'); fetchData(); setNoteForm(f => ({ ...f, note: '' })); setTimeout(() => setNoteMsg(''), 3000) }
    setSavingNote(false)
  }

  async function deleteNote(noteId) {
    await supabase.from('clinical_notes').delete().eq('id', noteId)
    fetchData()
  }

  function exportCSV() {
    const isNPH = profile?.regimen === 'nph_regular' || profile?.regimen === 'premixed_70_30'
    const headers = isNPH
      ? ['Date','AM RBS','AM N Dose','AM R Dose','Missed AM','PM RBS','PM N Dose','PM R Dose','Missed PM','Notes']
      : ['Date','AM RBS','AM Basal','AM Bolus','Missed AM','PM RBS','PM Basal','PM Bolus','Missed PM','Notes']
    const rows = logs.map(l => isNPH
      ? [l.log_date,l.am_rbs,l.am_n_dose,l.am_r_dose,l.missed_am_dose?'Yes':'',l.pm_rbs,l.pm_n_dose,l.pm_r_dose,l.missed_pm_dose?'Yes':'',l.notes].map(v=>v??'')
      : [l.log_date,l.am_rbs,l.am_basal,l.am_bolus,l.missed_am_dose?'Yes':'',l.pm_rbs,l.pm_basal,l.pm_bolus,l.missed_pm_dose?'Yes':'',l.notes].map(v=>v??'')
    )
    const csv = [headers,...rows].map(r=>r.join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`${profile?.full_name?.replace(/\s+/g,'_')}_glucose_log.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!profile) return <div className="loading-screen">Patient not found</div>

  const isNPH = profile?.regimen === 'nph_regular' || profile?.regimen === 'premixed_70_30' || !profile?.regimen
  const age = profile?.dob ? differenceInYears(new Date(), parseISO(profile.dob)) : null
  const streak = calcStreak(logs)

  // Chart data
  const chartLogs = [...logs].slice(-chartDays)
  const chartData = chartLogs.map(l => ({
    date: format(parseISO(l.log_date), 'MMM d'),
    'AM RBS': l.am_rbs || null,
    'PM RBS': l.pm_rbs || null,
  }))

  // Stats for selected period
  const periodLogs = [...logs].slice(-7)
  const periodRBS = periodLogs.flatMap(l => [l.am_rbs, l.pm_rbs].filter(Boolean))
  const avgRBS7 = periodRBS.length ? Math.round(periodRBS.reduce((a,b)=>a+b,0)/periodRBS.length) : null
  const minRBS7 = periodRBS.length ? Math.min(...periodRBS) : null
  const maxRBS7 = periodRBS.length ? Math.max(...periodRBS) : null
  const hypoEvents7 = periodLogs.filter(l => l.am_rbs < 70 || l.pm_rbs < 70).length
  const normalCount7 = periodRBS.filter(v => v >= 70 && v <= 180).length
  const tirPct = periodRBS.length ? Math.round((normalCount7 / periodRBS.length) * 100) : null

  const allRBS = logs.flatMap(l => [l.am_rbs, l.pm_rbs].filter(Boolean))
  const highCount = allRBS.filter(v => v > 200).length
  const lowCount = allRBS.filter(v => v < 70).length
  const missedCount = logs.filter(l => l.missed_am_dose || l.missed_pm_dose).length

  const hba1cChartData = hba1cLogs.map(h => ({
    date: format(parseISO(h.recorded_date), 'MMM yy'),
    'HbA1c': h.hba1c_percent,
  }))

  const gridColor = theme === 'light' ? '#e2e8f0' : '#2d3748'
  const axisColor = theme === 'light' ? '#94a3b8' : '#8b949e'

  return (
    <div className="page">
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 0' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/doctor')}>← Back</button>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px' }}>GlucoTrack</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ThemeToggle />
            <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '28px 24px' }}>

        {/* Patient header card — matches screenshot style */}
        <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid var(--accent2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{profile.full_name}</h1>
              <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
                {age !== null ? `${age} years old` : ''}
                {profile.sex ? ` · ${profile.sex === 'M' ? 'Male' : 'Female'}` : ''}
                {profile.weight_kg ? ` · ${profile.weight_kg} kg` : ''}
                {` · ${REGIMEN_LABELS[profile.regimen] || 'Unknown regimen'}`}
                {profile.diagnosis_year ? ` · Dx ${profile.diagnosis_year}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'center', padding: '8px 16px', background: streak >= 7 ? 'rgba(62,207,142,0.1)' : 'var(--surface2)', borderRadius: 10, border: `1px solid ${streak >= 7 ? 'var(--accent)' : 'var(--border)'}` }}>
                <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: streak >= 7 ? 'var(--accent)' : 'var(--text)' }}>🔥 {streak}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Day Streak</div>
              </div>
            </div>
          </div>
          {profile.notes && <div style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: '13px', color: 'var(--text-muted)' }}>📋 {profile.notes}</div>}
        </div>

        {/* 4 stat cards matching screenshot */}
        <div className="grid-4" style={{ marginBottom: '20px' }}>
          <div className="stat-card">
            <div className="stat-label">Avg RBS</div>
            <div className="stat-value" style={{ fontSize: 32, color: 'var(--text)' }}>{avgRBS7 ?? '—'}</div>
            <div className="stat-sub">mg/dL (7d)</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Time in Range</div>
            <div className="stat-value" style={{ fontSize: 32, color: tirPct >= 70 ? 'var(--accent)' : tirPct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{tirPct != null ? `${tirPct}%` : '—'}</div>
            <div className="stat-sub">(70–180 mg/dL)</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Range</div>
            <div className="stat-value" style={{ fontSize: minRBS7 ? 24 : 32, color: 'var(--text)', paddingTop: minRBS7 ? 4 : 0 }}>{minRBS7 != null ? `${minRBS7}–${maxRBS7}` : '—'}</div>
            <div className="stat-sub">mg/dL (7d)</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Hypo Events</div>
            <div className="stat-value" style={{ fontSize: 32, color: hypoEvents7 > 0 ? 'var(--danger)' : 'var(--accent)' }}>{hypoEvents7}</div>
            <div className="stat-sub">7 days</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', width: 'fit-content', flexWrap: 'wrap' }}>
          {[
            { key: 'overview', label: '📊 Overview' },
            { key: 'logs', label: '📋 All Logs' },
            { key: 'hba1c', label: '🧪 HbA1c' },
            { key: 'notes', label: '📝 Clinical Notes' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} className="btn" style={{
              background: activeTab === t.key ? 'var(--accent)' : 'transparent',
              color: activeTab === t.key ? '#fff' : 'var(--text-muted)',
              fontWeight: activeTab === t.key ? 600 : 400, padding: '8px 16px',
            }}>{t.label}</button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Glucose trend chart — matching screenshot style */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700 }}>{chartDays}-Day Glucose Trend</h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[7, 14, 30].map(d => (
                    <button key={d} onClick={() => setChartDays(d)} style={{
                      padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer',
                      background: chartDays === d ? 'var(--accent)' : 'var(--surface2)',
                      color: chartDays === d ? '#fff' : 'var(--text-muted)',
                      fontSize: 13, fontFamily: 'var(--font)', fontWeight: chartDays === d ? 600 : 400
                    }}>{d}d</button>
                  ))}
                </div>
              </div>
              {chartData.length < 2 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Not enough data for a trend yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={gridColor} vertical={true} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} domain={[40, 'auto']} ticks={[70, 130, 190, 250, 300]} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={70} stroke="#60a5fa" strokeDasharray="4 4" strokeWidth={1.5} />
                    <ReferenceLine y={180} stroke="#f87171" strokeDasharray="4 4" strokeWidth={1.5} />
                    <Line type="monotone" dataKey="AM RBS" stroke="#6366f1" strokeWidth={2.5}
                      dot={{ r: 5, fill: '#fff', stroke: '#6366f1', strokeWidth: 2.5 }}
                      activeDot={{ r: 7 }} connectNulls />
                    <Line type="monotone" dataKey="PM RBS" stroke="#f59e0b" strokeWidth={2.5}
                      dot={{ r: 5, fill: '#fff', stroke: '#f59e0b', strokeWidth: 2.5 }}
                      activeDot={{ r: 7 }} connectNulls />
                    <Legend
                      wrapperStyle={{ fontSize: 13, paddingTop: 16 }}
                      formatter={(value) => <span style={{ color: value === 'AM RBS' ? '#6366f1' : '#f59e0b', fontWeight: 600 }}>{value}</span>}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Time in range */}
            <div className="card">
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Time in Range — All Time</h2>
              <TimeInRangeChart logs={logs} />
            </div>

            {/* Latest HbA1c */}
            {hba1cLogs.length > 0 && (
              <div className="card">
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Latest HbA1c</h2>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[...hba1cLogs].slice(-3).reverse().map(h => (
                    <div key={h.id} style={{ padding: '16px 20px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', minWidth: 120 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: h.hba1c_percent > 8 ? 'var(--danger)' : h.hba1c_percent > 7 ? 'var(--warning)' : 'var(--accent)' }}>{h.hba1c_percent}%</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{format(parseISO(h.recorded_date), 'dd MMM yyyy')}</div>
                      {h.notes && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{h.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOGS */}
        {activeTab === 'logs' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600 }}>All Logs <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>{logs.length} entries</span></h2>
            </div>
            {logs.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No logs yet.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>AM RBS</th><th>AM Insulin</th><th>PM RBS</th><th>PM Insulin</th><th>Missed</th><th>Notes</th></tr></thead>
                  <tbody>
                    {[...logs].reverse().map(log => {
                      const amB = rbsBadge(log.am_rbs); const pmB = rbsBadge(log.pm_rbs)
                      const amInsulin = isNPH ? [log.am_n_dose&&`N ${log.am_n_dose}u`,log.am_r_dose&&`R ${log.am_r_dose}u`].filter(Boolean).join(' / ') : [log.am_basal&&`Basal ${log.am_basal}u`,log.am_bolus&&`Bolus ${log.am_bolus}u`].filter(Boolean).join(' / ')
                      const pmInsulin = isNPH ? [log.pm_n_dose&&`N ${log.pm_n_dose}u`,log.pm_r_dose&&`R ${log.pm_r_dose}u`].filter(Boolean).join(' / ') : [log.pm_basal&&`Basal ${log.pm_basal}u`,log.pm_bolus&&`Bolus ${log.pm_bolus}u`].filter(Boolean).join(' / ')
                      const missedFlag = [log.missed_am_dose&&'AM',log.missed_pm_dose&&'PM'].filter(Boolean).join(', ')
                      return (
                        <tr key={log.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{format(parseISO(log.log_date), 'dd MMM yyyy')}</td>
                          <td>{log.am_rbs ? <div style={{ display:'flex',alignItems:'center',gap:8 }}><span style={{fontFamily:'var(--font-mono)'}}>{log.am_rbs}</span>{amB&&<span className={`badge ${amB.cls}`}>{amB.label}</span>}</div> : <span style={{color:'var(--text-dim)'}}>—</span>}</td>
                          <td style={{ fontSize:13,color:'var(--text-muted)' }}>{amInsulin||'—'}</td>
                          <td>{log.pm_rbs ? <div style={{ display:'flex',alignItems:'center',gap:8 }}><span style={{fontFamily:'var(--font-mono)'}}>{log.pm_rbs}</span>{pmB&&<span className={`badge ${pmB.cls}`}>{pmB.label}</span>}</div> : <span style={{color:'var(--text-dim)'}}>—</span>}</td>
                          <td style={{ fontSize:13,color:'var(--text-muted)' }}>{pmInsulin||'—'}</td>
                          <td>{missedFlag ? <span className="badge badge-warn">⚠️ {missedFlag}</span> : <span style={{color:'var(--text-dim)'}}>—</span>}</td>
                          <td style={{ fontSize:13,color:'var(--text-muted)',maxWidth:160 }}>{log.notes||'—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* HBA1C */}
        {activeTab === 'hba1c' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Record HbA1c</h2>
              {hba1cMsg && <div className={`alert ${hba1cMsg.startsWith('Error') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{hba1cMsg}</div>}
              <form onSubmit={saveHba1c} style={{ display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end' }}>
                <div className="field" style={{ minWidth:160 }}>
                  <label>Date</label>
                  <input className="input" type="date" value={hba1cForm.recorded_date} onChange={e=>setHba1cForm(f=>({...f,recorded_date:e.target.value}))} required />
                </div>
                <div className="field" style={{ minWidth:120 }}>
                  <label>HbA1c (%)</label>
                  <input className="input" type="number" step="0.1" min="4" max="20" placeholder="e.g. 7.5" value={hba1cForm.hba1c_percent} onChange={e=>setHba1cForm(f=>({...f,hba1c_percent:e.target.value}))} required />
                </div>
                <div className="field" style={{ flex:1,minWidth:200 }}>
                  <label>Notes (optional)</label>
                  <input className="input" placeholder="e.g. pre-clinic check" value={hba1cForm.notes} onChange={e=>setHba1cForm(f=>({...f,notes:e.target.value}))} />
                </div>
                <button className="btn btn-primary" type="submit" disabled={savingHba1c}>{savingHba1c?'Saving…':'+ Add'}</button>
              </form>
            </div>
            {hba1cChartData.length > 1 && (
              <div className="card">
                <h2 style={{ fontSize:'16px',fontWeight:600,marginBottom:20 }}>HbA1c Trend</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={hba1cChartData} margin={{ top:5,right:20,left:0,bottom:5 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={gridColor} />
                    <XAxis dataKey="date" tick={{ fontSize:12,fill:axisColor }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:12,fill:axisColor }} axisLine={false} tickLine={false} domain={[4,12]} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={7} stroke="var(--accent)" strokeDasharray="4 4" label={{ value:'Target 7%',fill:'var(--accent)',fontSize:11 }} />
                    <ReferenceLine y={8} stroke="var(--danger)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="HbA1c" stroke="var(--warning)" strokeWidth={2.5} dot={{ r:5,fill:'#fff',stroke:'var(--warning)',strokeWidth:2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {hba1cLogs.length > 0 && (
              <div className="card">
                <h2 style={{ fontSize:'16px',fontWeight:600,marginBottom:16 }}>HbA1c History</h2>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>HbA1c</th><th>Status</th><th>Notes</th></tr></thead>
                    <tbody>
                      {[...hba1cLogs].reverse().map(h => (
                        <tr key={h.id}>
                          <td style={{ fontFamily:'var(--font-mono)',fontSize:13 }}>{format(parseISO(h.recorded_date),'dd MMM yyyy')}</td>
                          <td style={{ fontFamily:'var(--font-mono)',fontWeight:600,color:h.hba1c_percent>8?'var(--danger)':h.hba1c_percent>7?'var(--warning)':'var(--accent)' }}>{h.hba1c_percent}%</td>
                          <td><span className={`badge ${h.hba1c_percent>8?'badge-high':h.hba1c_percent>7?'badge-warn':'badge-normal'}`}>{h.hba1c_percent>8?'Poor':h.hba1c_percent>7?'Borderline':'Good'}</span></td>
                          <td style={{ fontSize:13,color:'var(--text-muted)' }}>{h.notes||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CLINICAL NOTES */}
        {activeTab === 'notes' && (
          <div style={{ display:'flex',flexDirection:'column',gap:20 }}>
            <div className="card">
              <h2 style={{ fontSize:'16px',fontWeight:600,marginBottom:16 }}>Add Clinical Note</h2>
              {noteMsg && <div className={`alert ${noteMsg.startsWith('Error')?'alert-error':'alert-success'}`} style={{ marginBottom:12 }}>{noteMsg}</div>}
              <form onSubmit={saveNote} style={{ display:'flex',flexDirection:'column',gap:12 }}>
                <div className="field" style={{ maxWidth:200 }}>
                  <label>Visit Date</label>
                  <input className="input" type="date" value={noteForm.note_date} onChange={e=>setNoteForm(f=>({...f,note_date:e.target.value}))} required />
                </div>
                <div className="field">
                  <label>Note</label>
                  <textarea className="input" rows={4} placeholder="Clinical observations, dose adjustments, patient concerns, plan…" value={noteForm.note} onChange={e=>setNoteForm(f=>({...f,note:e.target.value}))} style={{ resize:'vertical' }} required />
                </div>
                <button className="btn btn-primary" type="submit" disabled={savingNote} style={{ alignSelf:'flex-start' }}>{savingNote?'Saving…':'+ Add Note'}</button>
              </form>
            </div>
            {clinicalNotes.length === 0 ? (
              <div className="card"><p style={{ color:'var(--text-muted)',fontSize:14 }}>No clinical notes yet.</p></div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                {clinicalNotes.map(note => (
                  <div key={note.id} className="card">
                    <div style={{ display:'flex',justifyContent:'space-between',marginBottom:10 }}>
                      <span style={{ fontSize:13,fontWeight:600,color:'var(--accent)',fontFamily:'var(--font-mono)' }}>{format(parseISO(note.note_date),'dd MMM yyyy')}</span>
                      <button className="btn btn-danger btn-sm" onClick={()=>deleteNote(note.id)}>Delete</button>
                    </div>
                    <p style={{ fontSize:14,lineHeight:1.7,color:'var(--text)',whiteSpace:'pre-wrap' }}>{note.note}</p>
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
