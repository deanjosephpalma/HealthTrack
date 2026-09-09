import { useCallback, useEffect, useState } from 'react'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabaseClient'
import { isOnline } from '../../lib/offline/connectivity'
import {
  cacheFollowUpSchedules,
  listCachedFollowUps,
} from '../../lib/offline/paperlessService'

function formatDate(d) {
  if (!d) return '—'
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return String(d)
  }
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
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{formatDate(date)}</span>
}

export default function PatientFollowUpsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offlineNote, setOfflineNote] = useState('')
  const [abRecords, setAbRecords] = useState([])
  const [tbRecords, setTbRecords] = useState([])
  const [outpatientRecords, setOutpatientRecords] = useState([])

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError('')
    setOfflineNote('')
    try {
      if (!isOnline()) {
        const cached = await listCachedFollowUps(user.id)
        setAbRecords(cached.animalBite)
        setTbRecords(cached.tb)
        setOutpatientRecords(cached.outpatient)
        setOfflineNote(
          cached.cachedAt
            ? `Showing saved schedules (last synced ${new Date(cached.cachedAt).toLocaleString()}).`
            : 'Offline — no cached schedules yet. Connect once to download your follow-ups.',
        )
        return
      }

      const [abRes, outpatientRes, tbRes] = await Promise.all([
        supabase
          .from('animal_bite_doses')
          .select('*')
          .eq('patient_auth_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('id, patient_id, patient_auth_id, patient_name, appointment_date, status, reason, notes, preferred_schedule, created_at')
          .eq('patient_auth_id', user.id)
          .eq('reason', 'Outpatient Follow-up')
          .eq('status', 'scheduled')
          .order('appointment_date', { ascending: true }),
        supabase
          .from('tb_monitoring')
          .select('*')
          .eq('patient_auth_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      if (abRes.error || tbRes.error || outpatientRes.error) {
        setError([abRes.error?.message, tbRes.error?.message, outpatientRes.error?.message].filter(Boolean).join(' | '))
      }
      const ab = abRes.data ?? []
      const tb = tbRes.data ?? []
      const outpatient = outpatientRes.data ?? []
      setAbRecords(ab)
      setTbRecords(tb)
      setOutpatientRecords(outpatient)
      await cacheFollowUpSchedules({ animalBite: ab, tb, outpatient })
    } catch (e) {
      try {
        const cached = await listCachedFollowUps(user.id)
        setAbRecords(cached.animalBite)
        setTbRecords(cached.tb)
        setOutpatientRecords(cached.outpatient)
        setOfflineNote('Could not refresh online — showing last saved schedules.')
      } catch {
        setError(e?.message || 'Failed to load follow-up schedules.')
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-5">
      {loading ? <p className="info-banner">Loading your schedules…</p> : null}
      {offlineNote ? <p className="info-banner">{offlineNote}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {!loading && abRecords.length === 0 && tbRecords.length === 0 && outpatientRecords.length === 0 ? (
        <ModuleEmptyState
          title="No follow-up schedules yet"
          description="When your doctor sets an Animal Bite, TB, or outpatient follow-up schedule, it will appear here."
        />
      ) : null}

      {abRecords.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Animal Bite / Anti-rabies</p>
          {abRecords.map((rec) => {
            const doses = [1, 2, 3, 4, 5]
            return (
              <article key={rec.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">Anti-rabies vaccine schedule</h3>
                    <p className="text-xs text-slate-500">Bite / Day 0: {formatDate(rec.bite_date)}</p>
                    <p className="text-xs capitalize text-slate-500">Status: {rec.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="mb-1 text-xs text-slate-500">Next dose</p>
                    <DueBadge date={rec.next_due_date} />
                    {rec.next_due_dose ? (
                      <p className="mt-1 text-xs font-semibold text-teal-700">Dose {rec.next_due_dose}</p>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {doses.map((n) => {
                    const done = Boolean(rec[`dose_${n}_done`])
                    const date = rec[`dose_${n}_date`]
                    return (
                      <div
                        key={n}
                        className={`rounded-xl border p-2 text-center ${
                          done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <p className="text-[11px] font-semibold text-slate-600">Dose {n}</p>
                        <p className="text-xs text-slate-800">{formatDate(date)}</p>
                        <p className={`mt-1 text-[11px] font-semibold ${done ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {done ? 'Given' : 'Pending'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      {tbRecords.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">TB Treatment monitoring</p>
          {tbRecords.map((rec) => {
            const schedule = Array.isArray(rec.schedule) ? rec.schedule : []
            const attended = schedule.filter((s) => s.status === 'attended').length
            const next = schedule.find((s) => s.status === 'pending')
            const pct = schedule.length ? Math.round((attended / schedule.length) * 100) : 0
            return (
              <article key={rec.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">TB weekly follow-ups</h3>
                    <p className="text-xs text-slate-500">
                      Start: {formatDate(rec.start_date)} · {rec.treatment_duration_weeks || schedule.length} weeks
                    </p>
                    <p className="text-xs capitalize text-slate-500">Status: {rec.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="mb-1 text-xs text-slate-500">Next visit</p>
                    <DueBadge date={next?.date} />
                    {next?.week ? <p className="mt-1 text-xs font-semibold text-teal-700">Week {next.week}</p> : null}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>Progress</span>
                    <span>
                      {attended}/{schedule.length} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {schedule.slice(0, 12).map((slot) => (
                    <div
                      key={`${slot.week}-${slot.date}`}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-slate-700">Week {slot.week}</span>
                      <span className="text-slate-600">{formatDate(slot.date)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          slot.status === 'attended'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {slot.status === 'attended' ? 'Attended' : 'Pending'}
                      </span>
                    </div>
                  ))}
                  {schedule.length > 12 ? (
                    <p className="pt-1 text-center text-[11px] text-slate-500">
                      +{schedule.length - 12} more weeks in your full schedule
                    </p>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      {outpatientRecords.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outpatient check-up</p>
          {outpatientRecords.map((record) => (
            <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Doctor-set follow-up check-up</h3>
                  <p className="text-xs text-slate-500">Please return to the RHU on the scheduled date.</p>
                  {record.notes ? <p className="mt-2 text-sm text-slate-600">{record.notes}</p> : null}
                </div>
                <div className="text-right">
                  <p className="mb-1 text-xs text-slate-500">Check-up date</p>
                  <DueBadge date={record.appointment_date} />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
