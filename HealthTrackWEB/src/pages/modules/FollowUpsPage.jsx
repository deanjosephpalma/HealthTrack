import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { markAnimalBiteDose } from '../../lib/workflowEngine'
import { sendSms, msgVaccineSchedule, msgFollowUpReminder } from '../../lib/smsService'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { useAuth } from '../../context/useAuth'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isToday(dateStr) {
  if (!dateStr) return false
  return dateStr === new Date().toISOString().slice(0, 10)
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  return dateStr < new Date().toISOString().slice(0, 10)
}

function DueBadge({ date }) {
  if (!date) return null
  if (isToday(date)) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Today</span>
  if (isOverdue(date)) return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Overdue</span>
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{formatDate(date)}</span>
}

// ---- Animal Bite Tab ----
function AnimalBiteTab() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('animal_bite_doses')
      .select('*, patients(name, patient_number)')
      .eq('status', 'active')
      .order('next_due_date', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setRecords(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleMarkDone = async (rec, doseNum) => {
    setActionLoading(rec.id)
    const { error: err } = await markAnimalBiteDose({
      doseRecordId: rec.id,
      doseNumber: doseNum,
      staffId: user.id,
    })
    if (err) setError(err.message)

    // Send email reminder for next dose if exists
    if (rec.patient_email && doseNum < 5) {
      const nextDose = doseNum + 1
      const nextDateKey = `dose_${nextDose}_date`
      if (rec[nextDateKey]) {
        await sendSms({
          to: rec.patient_email,
          message: msgVaccineSchedule({
            patientName: rec.patients?.name ?? 'Patient',
            doseNumber: nextDose,
            date: rec[nextDateKey],
          }),
        })
      }
    }

    await load()
    setActionLoading(null)
  }

  const handleSendReminder = async (rec) => {
    if (!rec.patient_email || !rec.next_due_date) return
    setActionLoading(rec.id)
    await sendSms({
      to: rec.patient_email,
      message: msgFollowUpReminder({
        type: 'Animal Bite Vaccine',
        date: rec.next_due_date,
        dose: `Dose ${rec.next_due_dose}`,
      }),
    })
    setActionLoading(null)
  }

  if (loading) return <p className="info-banner">Loading Animal Bite follow-ups...</p>
  if (error) return <p className="error-banner">{error}</p>
  if (records.length === 0) return <ModuleEmptyState title="No active Animal Bite schedules" description="Patients with pending anti-rabies doses will appear here." />

  return (
    <div className="space-y-3">
      {records.map(rec => {
        const doses = [1,2,3,4,5]
        const isBusy = actionLoading === rec.id

        return (
          <article key={rec.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold text-slate-900">{rec.patients?.name ?? '—'}</h3>
                <p className="text-xs text-slate-500">Bite date: {formatDate(rec.bite_date)}</p>
                {rec.patient_email && <p className="text-xs text-slate-400">{rec.patient_email}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 mb-1">Next dose</p>
                <DueBadge date={rec.next_due_date} />
              </div>
            </div>

            {/* Dose grid */}
            <div className="grid grid-cols-5 gap-1 mb-3">
              {doses.map(d => {
                const doneKey = `dose_${d}_done`
                const dateKey = `dose_${d}_date`
                const done = rec[doneKey]
                return (
                  <div key={d} className={`rounded-lg p-2 text-center text-xs ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                    <p className="font-bold">D{d}</p>
                    <p className="text-[10px]">{formatDate(rec[dateKey])}</p>
                    {done ? <p className="text-emerald-600">✓</p> : <p className="text-slate-300">–</p>}
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {doses.map(d => {
                const doneKey = `dose_${d}_done`
                if (rec[doneKey]) return null
                return (
                  <button
                    key={d}
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-700 text-white hover:bg-teal-600 disabled:opacity-50"
                    onClick={() => handleMarkDone(rec, d)}
                    disabled={isBusy}
                  >
                    {isBusy ? '...' : `✓ Dose ${d} Given`}
                  </button>
                )
              })}
              {rec.patient_email && (
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                  onClick={() => handleSendReminder(rec)}
                  disabled={isBusy}
                >
                  ✉ Send Reminder
                </button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ---- TB Monitoring Tab ----
function TBTab() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('tb_monitoring')
      .select('*, patients(name, patient_number)')
      .eq('status', 'active')
      .order('start_date', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setRecords(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const today = new Date().toISOString().slice(0, 10)

  const handleSendReminder = async (rec) => {
    if (!rec.patient_email) return
    setActionLoading(rec.id)
    const todaySlot = (rec.schedule ?? []).find(s => s.date === today && s.status === 'pending')
    if (todaySlot) {
      await sendSms({
        to: rec.patient_email,
        message: msgFollowUpReminder({
          type: 'TB Treatment',
          date: today,
          dose: `Week ${todaySlot.week}`,
        }),
      })
    }
    setActionLoading(null)
  }

  const handleMarkVisit = async (rec) => {
    setActionLoading(rec.id)
    const updatedSchedule = (rec.schedule ?? []).map(s =>
      s.date === today ? { ...s, status: 'attended' } : s
    )
    await supabase
      .from('tb_monitoring')
      .update({ schedule: updatedSchedule, last_visit_date: today })
      .eq('id', rec.id)
    await load()
    setActionLoading(null)
  }

  if (loading) return <p className="info-banner">Loading TB follow-ups...</p>
  if (error) return <p className="error-banner">{error}</p>
  if (records.length === 0) return <ModuleEmptyState title="No active TB monitoring records" description="TB patients enrolled in treatment will appear here." />

  return (
    <div className="space-y-3">
      {records.map(rec => {
        const schedule = rec.schedule ?? []
        const attended = schedule.filter(s => s.status === 'attended').length
        const todaySlot = schedule.find(s => s.date === today && s.status === 'pending')
        const isBusy = actionLoading === rec.id

        return (
          <article key={rec.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="font-semibold text-slate-900">{rec.patients?.name ?? '—'}</h3>
                <p className="text-xs text-slate-500">Started: {formatDate(rec.start_date)} · {rec.treatment_duration_weeks} weeks</p>
                {rec.patient_email && <p className="text-xs text-slate-400">{rec.patient_email}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Attended</p>
                <p className="text-sm font-bold text-teal-700">{attended}/{schedule.length}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-3 h-1.5 w-full rounded-full bg-slate-200">
              <div className="h-1.5 rounded-full bg-teal-600 transition-all" style={{ width: `${schedule.length > 0 ? (attended / schedule.length) * 100 : 0}%` }} />
            </div>

            {todaySlot && (
              <p className="mb-2 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                ⚠ Week {todaySlot.week} visit due today
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {todaySlot && (
                <button type="button" className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-700 text-white hover:bg-teal-600 disabled:opacity-50" onClick={() => handleMarkVisit(rec)} disabled={isBusy}>
                  {isBusy ? '...' : '✓ Mark Visit Today'}
                </button>
              )}
              {rec.patient_email && (
                <button type="button" className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50" onClick={() => handleSendReminder(rec)} disabled={isBusy}>
                  ✉ Send Reminder
                </button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ---- Outpatient check-up tab ----
function OutpatientTab() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('appointments')
      .select('id, patient_name, appointment_date, status, notes, preferred_schedule')
      .eq('reason', 'Outpatient Follow-up')
      .eq('status', 'scheduled')
      .order('appointment_date', { ascending: true })
    if (err) setError(err.message)
    setRecords(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const markComplete = async (record) => {
    setActionLoading(record.id)
    const { error: err } = await supabase.from('appointments').update({ status: 'completed' }).eq('id', record.id)
    if (err) setError(err.message)
    await load()
    setActionLoading(null)
  }

  if (loading) return <p className="info-banner">Loading outpatient check-ups...</p>
  if (error) return <p className="error-banner">{error}</p>
  if (records.length === 0) return <ModuleEmptyState title="No scheduled outpatient check-ups" description="Doctor-set outpatient follow-up dates will appear here." />

  return (
    <div className="space-y-3">
      {records.map((record) => {
        const busy = actionLoading === record.id
        return (
          <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">{record.patient_name || 'Patient'}</h3>
                <p className="text-xs text-slate-500">Outpatient follow-up check-up</p>
                {record.notes ? <p className="mt-2 text-sm text-slate-600">{record.notes}</p> : null}
              </div>
              <div className="text-right">
                <p className="mb-1 text-xs text-slate-500">Check-up date</p>
                <DueBadge date={record.appointment_date} />
              </div>
            </div>
            <button type="button" className="mt-3 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-50" onClick={() => void markComplete(record)} disabled={busy}>
              {busy ? '...' : 'Mark check-up completed'}
            </button>
          </article>
        )
      })}
    </div>
  )
}

// ---- Main Page ----
export default function FollowUpsPage() {
  const [tab, setTab] = useState('animal-bite')

  return (
    <section className="module-card">
      <h2 className="module-title">Follow-up Schedules</h2>
      <p className="module-subtitle">Anti-rabies, TB monitoring, and doctor-set outpatient check-ups.</p>

      <div className="mb-4 flex gap-2">
        {[
          { key: 'outpatient', label: 'Outpatient' },
          { key: 'animal-bite', label: '🐾 Animal Bite' },
          { key: 'tb', label: '🫁 TB Monitoring' },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'animal-bite' && <AnimalBiteTab />}
      {tab === 'tb' && <TBTab />}
      {tab === 'outpatient' && <OutpatientTab />}
    </section>
  )
}
