import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { isHighVitalReferral } from '../../lib/emergencyTriage'

export default function NurseConsultPage({ queueOnly = false }) {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('case') || ''
  const [cases, setCases] = useState([])
  const [policy, setPolicy] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState(false)

  const load = useCallback(async () => {
    try {
      const [result, settings] = await Promise.all([
        supabase.from('emergency_cases').select('*').order('created_at', { ascending: true }),
        supabase.from('emergency_triage_policy').select('*').single(),
      ])
      if (result.error || settings.error) throw result.error || settings.error
      setCases(result.data || [])
      setPolicy(settings.data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void load()
    const timer = window.setInterval(load, 10000)
    return () => window.clearInterval(timer)
  }, [load])

  const selected = cases.find(c => c.id === selectedId)
  const active = c => ['pending', 'in_care'].includes(c.status)
  const visible = cases.filter(c => queueOnly
    ? active(c) && isHighVitalReferral(c, policy)
    : history ? !active(c) : active(c))

  async function save() {
    if (!selected || saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      const { error: saveError } = await supabase.rpc('complete_emergency_consultation', {
        p_id: selected.id, p_notes: drafts[selected.id] ?? selected.notes,
      })
      if (saveError) throw saveError
      setMessage('Consultation completed and saved to patient records.')
      setDrafts(previous => { const next = { ...previous }; delete next[selected.id]; return next })
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return <div className="space-y-5">
    <header className="rounded-2xl bg-rose-900 p-6 text-white">
      <p className="text-sm">Nurse Zuleika</p>
      <h1 className="mt-2 text-3xl font-bold">{queueOnly ? 'High-priority Queue' : 'Nurse Consultation'}</h1>
      <p className="mt-2">{queueOnly ? 'High BP and high temperature referrals for immediate assessment.' : 'Assess emergency patients, record care, and complete the consultation.'}</p>
    </header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</p>}
    {queueOnly && <Link to="/dashboard/nurse-consult" className="inline-block font-semibold text-rose-700">Open Nurse Consult — including accidents and direct emergencies →</Link>}
    {!queueOnly && <button className="font-semibold text-rose-700" onClick={() => setHistory(!history)}>{history ? 'Show active patients' : 'Show completed / referred consultations'}</button>}
    <div className={`grid gap-5 ${!queueOnly ? 'lg:grid-cols-2' : ''}`}>
      <section className="space-y-3" aria-label="Patients">
        {loading ? <p>Loading patients…</p> : !visible.length && <p className="rounded-xl border bg-white p-5">No patients in this list.</p>}
        {visible.map(c => <article key={c.id} className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-bold">{c.patient_name}</h2>
          <p className="mt-1 text-sm">{c.reason}</p>
          <p className="mt-2 text-sm">BP: {c.vitals?.bp || 'Not recorded'} mmHg · Temperature: {c.vitals?.temp || 'Not recorded'} °C</p>
          <p className="my-2 text-xs text-slate-500">{c.status.replace('_', ' ')} · Received {new Date(c.created_at).toLocaleString()}</p>
          {queueOnly ? <Link className="font-semibold text-rose-700" to={`/dashboard/nurse-consult?case=${c.id}`}>Open consultation →</Link>
            : <button disabled={saving} className="font-semibold text-rose-700" onClick={() => { setParams({ case: c.id }); setMessage('') }}>Open consultation →</button>}
        </article>)}
      </section>
      {!queueOnly && <section className="rounded-xl border bg-white p-5" aria-label="Consultation">
        {!selected ? <p className="text-slate-600">Select a patient to open their consultation.</p> : <>
          <h2 className="text-xl font-bold">{selected.patient_name}</h2>
          <p className="mt-2">{selected.reason}</p>
          <dl className="my-4 grid grid-cols-2 gap-3 text-sm">
            {Object.entries({ Age: selected.vitals?.age, Contact: selected.vitals?.mobile_phone, Barangay: selected.vitals?.barangay, Municipality: selected.vitals?.municipality, 'Weight (kg)': selected.vitals?.wt, 'Height (cm)': selected.vitals?.ht, 'Blood pressure': selected.vitals?.bp, 'Temperature (°C)': selected.vitals?.temp, 'Pulse / HR': selected.vitals?.pr_hr, 'Respiratory rate': selected.vitals?.rr, 'SpO₂ (%)': selected.vitals?.spo2, Status: selected.status.replace('_', ' ') }).map(([label,value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{value || 'Not recorded'}</dd></div>)}
          </dl>
          <label className="block font-semibold" htmlFor="consult-notes">Assessment, care provided, and referral plan</label>
          <textarea id="consult-notes" rows={12} className="mt-2 w-full rounded-xl border p-3 text-sm" disabled={saving || !active(selected)} placeholder="Record symptoms, assessment findings, interventions, response, and referral or discharge instructions." value={drafts[selected.id] ?? selected.notes} onChange={e => setDrafts({ ...drafts, [selected.id]: e.target.value })} />
          <div className="mt-4 flex flex-wrap gap-2">
            {active(selected) ? <button disabled={saving || !(drafts[selected.id] ?? selected.notes ?? '').trim()} onClick={() => void save()} className="rounded-lg bg-rose-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving consultation...' : 'Complete consultation'}</button> : <p className="text-sm text-emerald-700">This consultation is closed. View the saved record in Patient Records.</p>}
          </div>
        </>}
      </section>}
    </div>
  </div>
}
