import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { EMPTY_EMERGENCY_INTAKE, PILA_BARANGAYS, patientEmergencyIntake } from '../../lib/emergencyIntake'

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm'
const vitalFields = { bp: 'BP (mmHg, e.g. 120/80)', temp: 'Temperature (°C)', pr_hr: 'Pulse / heart rate (bpm)', rr: 'Respiratory rate (/min)', spo2: 'SpO2 (%)', wt: 'Weight (kg)', ht: 'Height (cm)' }

export default function EmergencyEncodePage() {
  const [form, setForm] = useState(EMPTY_EMERGENCY_INTAKE)
  const [patientId, setPatientId] = useState('')
  const [search, setSearch] = useState('')
  const [patients, setPatients] = useState([])
  const [searching, setSearching] = useState(false)
  const [outsidePila, setOutsidePila] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState('')
  const caseId = useRef(crypto.randomUUID())
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const term = search.trim().replace(/[%_\\]/g, '')
      if (term.length < 2) { setPatients([]); setSearching(false); return }
      setSearching(true)
      try {
        const { data, error: queryError } = await supabase.from('patients')
          .select('id,name,patient_number,patient_auth_id,birthdate,sex,mobile_phone,phone,barangay,municipality,province')
          .is('archived_at', null).ilike('name', `%${term}%`).order('name').limit(20)
        if (queryError) throw queryError
        if (!cancelled) setPatients(data || [])
      } catch (e) { if (!cancelled) setError(e.message) }
      finally { if (!cancelled) setSearching(false) }
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [search])

  async function encode(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setSavedId('')
    try {
      if (!form.patient_name.trim() || !form.reason.trim()) throw new Error('Patient name and incident / reason are required.')
      const { data, error: saveError } = await supabase.rpc('encode_emergency_patient', {
        p_case_id: caseId.current, p_patient_id: patientId || null, p_data: form,
      })
      if (saveError) throw saveError
      setSavedId(data)
      caseId.current = crypto.randomUUID()
      setForm(EMPTY_EMERGENCY_INTAKE); setPatientId(''); setSearch(''); setOutsidePila(false)
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
      <p>Emergency case recorded. Complete the consultation to publish the medical record.</p>
      <Link className="mt-2 inline-block font-semibold underline" to={`/dashboard/nurse-consult?case=${savedId}`}>Open consultation</Link>
    </div>}
    <form onSubmit={encode} className="rounded-2xl border bg-white p-5">
      <fieldset disabled={busy} className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Patient</h2>
          <label className="block text-sm font-semibold">Find existing patient by name
            <input className={fieldClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Type at least 2 letters" />
          </label>
          {searching && <p className="text-sm">Searching…</p>}
          {patients.length > 0 && <ul className="max-h-64 overflow-auto rounded-lg border">{patients.map(p => <li key={p.id}><button type="button" className="w-full border-b p-3 text-left text-sm hover:bg-rose-50" onClick={() => {
            const intake = patientEmergencyIntake(p)
            setPatientId(p.id); setForm(previous => ({ ...previous, ...intake, ...Object.fromEntries(Object.keys(vitalFields).map(key => [key, previous[key]])), reason: previous.reason, notes: previous.notes })); setOutsidePila(intake.municipality.toLowerCase() !== 'pila'); setSearch('')
          }}>{p.name} · Patient #{p.patient_number} · {p.birthdate || 'Birthdate unknown'} · {p.barangay || 'Address unknown'} · {p.patient_auth_id ? 'Portal account linked' : 'No portal account'}</button></li>)}</ul>}
          {patientId ? <p className="text-sm text-emerald-800">Existing patient selected. <button type="button" className="underline" onClick={() => { setPatientId(''); setForm(EMPTY_EMERGENCY_INTAKE); setOutsidePila(false) }}>Use a new patient instead</button></p>
            : <p className="text-sm text-slate-600">Select the existing patient to link the record to their portal. Otherwise, a new patient profile is created for staff records; portal access requires linking that profile to the patient's account.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries({ patient_name: 'Patient name', mobile_phone: 'Contact number', age: 'Age' }).map(([key,label]) => <label key={key} className="text-sm font-semibold">{label}<input className={fieldClass} required={key === 'patient_name'} readOnly={key === 'patient_name' && Boolean(patientId)} type={key === 'age' ? 'number' : key === 'mobile_phone' ? 'tel' : 'text'} min={key === 'age' ? 0 : undefined} max={key === 'age' ? 150 : undefined} step={key === 'age' ? 1 : undefined} value={form[key]} onChange={e => change(key,e.target.value)} /></label>)}
            <label className="text-sm font-semibold">Sex<select className={fieldClass} value={form.sex} onChange={e => change('sex',e.target.value)}><option value="">Not recorded</option><option>Male</option><option>Female</option></select></label>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Address</h2>
          <label className="block text-sm font-semibold">Municipality<select className={fieldClass} value={outsidePila ? 'others' : 'Pila'} onChange={e => {
            const outside = e.target.value === 'others'; setOutsidePila(outside); setForm(previous => ({ ...previous, municipality: outside ? '' : 'Pila', province: outside ? '' : 'Laguna', barangay: '' }))
          }}><option value="Pila">Pila, Laguna</option><option value="others">Others — outside Pila</option></select></label>
          <div className="grid gap-4 sm:grid-cols-2">
            {outsidePila && <>{['municipality','province'].map(key => <label key={key} className="text-sm font-semibold capitalize">{key}<input required className={fieldClass} value={form[key]} onChange={e => change(key,e.target.value)} /></label>)}</>}
            <label className="text-sm font-semibold">Barangay{outsidePila ? <input className={fieldClass} value={form.barangay} onChange={e => change('barangay',e.target.value)} placeholder="Enter barangay outside Pila" /> : <select className={fieldClass} value={form.barangay} onChange={e => change('barangay',e.target.value)}><option value="">Select barangay</option>{PILA_BARANGAYS.map(b => <option key={b}>{b}</option>)}</select>}</label>
          </div>
        </section>
        <section className="space-y-3"><h2 className="text-xl font-bold">Vital signs</h2>
          <div className="grid gap-4 sm:grid-cols-2">{Object.entries(vitalFields).map(([key,label]) => <label key={key} className="text-sm font-semibold">{label}<input className={fieldClass} type={key === 'bp' ? 'text' : 'number'} min={key === 'bp' ? undefined : 0} max={key === 'spo2' ? 100 : undefined} step="any" pattern={key === 'bp' ? '\\s*[0-9]{2,3}\\s*/\\s*[0-9]{2,3}\\s*' : undefined} value={form[key]} onChange={e => change(key,e.target.value)} /></label>)}</div>
        </section>
        <label className="block text-sm font-semibold">Incident / reason for emergency<input required className={fieldClass} value={form.reason} onChange={e => change('reason',e.target.value)} /></label>
        <label className="block text-sm font-semibold">Initial notes<textarea className={fieldClass} rows={4} value={form.notes} onChange={e => change('notes',e.target.value)} /></label>
        <button className="rounded-xl bg-rose-700 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={busy}>{busy ? 'Saving…' : 'Save emergency case'}</button>
      </fieldset>
    </form>
  </div>
}
