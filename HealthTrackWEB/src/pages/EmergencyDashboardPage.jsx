import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white p-3 text-sm'

export default function EmergencyDashboardPage() {
  const [cases, setCases] = useState([])
  const [policy, setPolicy] = useState(null)
  const [cutoffs, setCutoffs] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState(false)
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
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{history ? 'Case history' : 'Active emergencies'}</h2><button className="text-sm font-semibold text-rose-700" onClick={() => setHistory(!history)}>{history ? 'Show active cases' : 'Show history'}</button></div>
      {loading ? <p>Loading cases…</p> : !displayed.length && <p className="rounded-xl border bg-white p-6 text-slate-600">No {history ? 'closed' : 'active'} emergency cases.</p>}
      {displayed.map(c => <article key={c.id} className="space-y-3 rounded-xl border border-rose-200 bg-white p-5">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-bold">{c.patient_name}</h3><span className="text-sm font-semibold">{c.status.replace('_', ' ')} • {c.source === 'bhw' ? 'BHW referral' : 'Direct emergency'}</span></div>
        <p>{c.reason}</p><p className="text-sm">BP: {c.vitals?.bp || 'Not recorded'} • Temperature: {c.vitals?.temp || 'Not recorded'}{c.vitals?.temp ? ' °C' : ''}</p>
        <Link className="inline-block font-semibold text-rose-700" to={`/dashboard/nurse-consult?case=${c.id}`}>Open consultation →</Link>
        <p className="text-xs text-slate-500">Received {new Date(c.created_at).toLocaleString()}</p>
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
