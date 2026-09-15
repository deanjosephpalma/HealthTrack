import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

const emptyForm = { patient_name: '', reason: '', bp: '', temp: '', notes: '' }
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white p-3 text-sm'

export default function EmergencyEncodePage() {
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState('')

  async function encode(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setSavedId('')
    try {
      if (!form.patient_name.trim() || !form.reason.trim()) throw new Error('Patient name and incident / reason are required.')
      const { data, error: saveError } = await supabase.from('emergency_cases').insert({
        patient_name: form.patient_name.trim(), reason: form.reason.trim(), source: 'direct',
        vitals: { bp: form.bp, temp: form.temp }, notes: form.notes,
      }).select('id').single()
      if (saveError) throw saveError
      setSavedId(data.id)
      setForm(emptyForm)
    } catch (e) { setError(e.message || 'Failed to save emergency case.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <header className="rounded-2xl bg-rose-900 p-6 text-white">
      <p className="text-sm font-semibold text-rose-100">Nurse Zuleika · Emergency station</p>
      <h1 className="mt-2 text-3xl font-bold">Emergency Encode</h1>
      <p className="mt-2">Register accidents and emergency walk-ins for immediate nurse assessment.</p>
    </header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
    {savedId && <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
      <p>Emergency case recorded. Patient goes directly to nurse assessment.</p>
      <Link className="mt-2 inline-block font-semibold underline" to={`/dashboard/nurse-consult?case=${savedId}`}>Open consultation →</Link>
    </div>}
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">Encode emergency case</h2>
      <p className="mb-4 text-sm text-slate-600">No BHW encoding or queue ticket required. Use “Unidentified patient” when the name is unknown.</p>
      <form onSubmit={encode} className="grid gap-4 sm:grid-cols-2">
        {Object.entries({ patient_name: 'Patient name', reason: 'Incident / reason for emergency', bp: 'BP (mmHg, e.g. 120/80)', temp: 'Temperature (°C)' }).map(([key, label]) => <label key={key} className="text-sm font-semibold">{label}
          <input className={fieldClass} required={['patient_name','reason'].includes(key)} value={form[key]} type={key === 'temp' ? 'number' : 'text'} step={key === 'temp' ? '0.1' : undefined} pattern={key === 'bp' ? '\\s*[0-9]{2,3}\\s*/\\s*[0-9]{2,3}\\s*' : undefined} onChange={e => setForm({ ...form, [key]: e.target.value })} />
        </label>)}
        <label className="text-sm font-semibold sm:col-span-2">Initial notes<textarea className={fieldClass} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <button disabled={busy} className="rounded-xl bg-rose-700 p-3 font-semibold text-white disabled:opacity-50">Save emergency case</button>
      </form>
    </section>
  </div>
}
