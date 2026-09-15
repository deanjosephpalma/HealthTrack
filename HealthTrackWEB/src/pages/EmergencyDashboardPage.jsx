import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'

const emptyForm = { patient_name: '', reason: '', bp: '', temp: '', notes: '' }
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white p-3 text-sm'

export default function EmergencyDashboardPage() {
  const [cases, setCases] = useState([])
  const [policy, setPolicy] = useState(null)
  const [cutoffs, setCutoffs] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState(false)
  const [notes, setNotes] = useState({})
  const load = useCallback(async () => {
    const [result, settings] = await Promise.all([
      supabase.from('emergency_cases').select('*').order('created_at', { ascending: false }),
      supabase.from('emergency_triage_policy').select('*').single(),
    ])
    if (result.error || settings.error) setError((result.error || settings.error).message)
    else { setCases(result.data); setPolicy(settings.data) }
    setLoading(false)
  }, [])
  useEffect(() => {
    void load()
    const timer = window.setInterval(load, 10000)
    return () => window.clearInterval(timer)
  }, [load])

  async function perform(action, success) {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await action()
      if (result.error) throw result.error
      setMessage(success)
      await load()
      return true
    } catch (e) { setError(e.message); return false }
    finally { setBusy(false) }
  }

  async function encode(event) {
    event.preventDefault()
    const ok = await perform(() => supabase.from('emergency_cases').insert({
      patient_name: form.patient_name.trim(), reason: form.reason.trim(), source: 'direct',
      vitals: { bp: form.bp, temp: form.temp }, notes: form.notes,
    }), 'Emergency case recorded. Patient goes directly to nurse assessment.')
    if (ok) setForm(emptyForm)
  }

  const active = cases.filter(c => ['pending', 'in_care'].includes(c.status))
  const displayed = history ? cases.filter(c => !['pending', 'in_care'].includes(c.status)) : active
  const settings = cutoffs || policy
  return <div className="space-y-6">
    <header className="rounded-2xl bg-rose-900 p-6 text-white">
      <p className="text-sm font-semibold text-rose-100">Nurse Zuleika • Emergency station</p>
      <h1 className="mt-2 text-3xl font-bold">Emergency Dashboard</h1>
      <div className="my-4 flex flex-wrap gap-3">
        <Link to="/dashboard/nurse-consult" className="rounded-lg bg-white px-4 py-2 font-semibold text-rose-900">Nurse Consult</Link>
        <Link to="/dashboard/queue" className="rounded-lg border border-white/50 px-4 py-2 font-semibold">High-priority Queue</Link>
      </div>
      <p className="mt-2">Immediate assessment for elevated vital signs, accidents, and emergency walk-ins.</p>
      <div className="mt-5 flex gap-6"><span>{active.filter(c => c.status === 'pending').length} awaiting assessment</span><span>{active.filter(c => c.status === 'in_care').length} in care</span></div>
    </header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</p>}
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">Encode emergency case</h2>
      <p className="mb-4 text-sm text-slate-600">No BHW encoding or queue ticket required. Use “Unidentified patient” when the name is unknown.</p>
      <form onSubmit={encode} className="grid gap-4 sm:grid-cols-2">
        {Object.entries({ patient_name: 'Patient name', reason: 'Incident / reason for emergency', bp: 'BP (mmHg, e.g. 120/80)', temp: 'Temperature (°C)' }).map(([key, label]) => <label key={key} className="text-sm font-semibold">{label}
          <input className={fieldClass} required={['patient_name','reason'].includes(key)} value={form[key]} type={key === 'temp' ? 'number' : 'text'} step={key === 'temp' ? '0.1' : undefined} pattern={key === 'bp' ? '\\s*[0-9]{2,3}\\s*/\\s*[0-9]{2,3}\\s*' : undefined} onChange={e => setForm({ ...form, [key]: e.target.value })} />
        </label>)}
        <label className="text-sm font-semibold sm:col-span-2">Initial notes<textarea className={fieldClass} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <button disabled={busy || loading || !policy} className="rounded-xl bg-rose-700 p-3 font-semibold text-white disabled:opacity-50">Save emergency case</button>
      </form>
    </section>
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{history ? 'Case history' : 'Active emergencies'}</h2><button className="text-sm font-semibold text-rose-700" onClick={() => setHistory(!history)}>{history ? 'Show active cases' : 'Show history'}</button></div>
      {loading ? <p>Loading cases…</p> : !displayed.length && <p className="rounded-xl border bg-white p-6 text-slate-600">No {history ? 'closed' : 'active'} emergency cases.</p>}
      {displayed.map(c => <article key={c.id} className="space-y-3 rounded-xl border border-rose-200 bg-white p-5">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-bold">{c.patient_name}</h3><span className="text-sm font-semibold">{c.status.replace('_', ' ')} • {c.source === 'bhw' ? 'BHW referral' : 'Direct emergency'}</span></div>
        <p>{c.reason}</p><p className="text-sm">BP: {c.vitals?.bp || 'Not recorded'} • Temperature: {c.vitals?.temp || 'Not recorded'}{c.vitals?.temp ? ' °C' : ''}</p>
        <Link className="inline-block font-semibold text-rose-700" to={`/dashboard/nurse-consult?case=${c.id}`}>Open consultation →</Link>
        <p className="text-xs text-slate-500">Received {new Date(c.created_at).toLocaleString()}</p>
        <label className="block text-sm font-semibold">Care / referral notes<textarea className={fieldClass} value={notes[c.id] ?? c.notes} onChange={e => setNotes({ ...notes, [c.id]: e.target.value })} /></label>
        <div className="flex flex-wrap gap-2">{[['in_care','Start care'],['completed','Complete'],['referred','Refer / transfer'],[c.status,'Save notes']].map(([status,label]) => <button key={label} disabled={busy || (status === c.status && label !== 'Save notes')} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40" onClick={() => void perform(() => supabase.rpc('update_emergency_case', { p_id: c.id, p_status: status, p_notes: notes[c.id] ?? c.notes }), 'Case updated.')}>{label}</button>)}</div>
      </article>)}
    </section>
    {settings && <details className="rounded-xl border bg-white p-5" open={!policy?.enabled}>
      <summary className="cursor-pointer font-semibold">Automatic referral cutoffs — {policy?.enabled ? 'enabled' : 'not configured / disabled'}</summary>
      <p className="my-3 text-sm text-slate-600">Enter the RHU-approved thresholds. A reading at or above any cutoff routes the patient here. These are referral rules, not a diagnosis.</p>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={async e => {
        e.preventDefault()
        const ok = await perform(() => supabase.from('emergency_triage_policy').update({ enabled: true, systolic: Number(settings.systolic), diastolic: Number(settings.diastolic), temperature: Number(settings.temperature) }).eq('id', true).select().single(), 'Automatic referral cutoffs saved.')
        if (ok) setCutoffs(null)
      }}>
        {['systolic','diastolic','temperature'].map(key => <label key={key} className="text-sm capitalize">{key} {key === 'temperature' ? '(°C)' : '(mmHg)'}<input required type="number" min="0.1" step="0.1" className={fieldClass} value={settings[key] ?? ''} onChange={e => setCutoffs({ ...settings, [key]: e.target.value })} /></label>)}
        <button disabled={busy} className="rounded-lg bg-slate-800 p-3 text-sm font-semibold text-white">Save approved cutoffs and enable</button>
      </form>
    </details>}
  </div>
}
