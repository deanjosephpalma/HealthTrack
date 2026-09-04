import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { MODULES } from '../config/rbac'
import { supabase } from '../lib/supabaseClient'

export default function BhwDashboardPage() {
  const { profile, role } = useAuth()
  const [awaiting, setAwaiting] = useState(0)
  const [encoded, setEncoded] = useState(0)
  const [loading, setLoading] = useState(true)

  const firstName = (profile?.name || role || 'Encoder').toString().split(' ')[0]
  const roleLabel = role === 'Volunteer' ? 'Volunteer' : 'BHW'

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [awaitingRes, encodedRes] = await Promise.all([
        supabase
          .from('service_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Awaiting Encoding'),
        supabase
          .from('service_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Encoded'),
      ])
      setAwaiting(awaitingRes.count ?? 0)
      setEncoded(encodedRes.count ?? 0)
    } catch {
      setAwaiting(0)
      setEncoded(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 20000)
    return () => window.clearInterval(id)
  }, [refresh])

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-6 text-white shadow-lg sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-100">Encode desk</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Hello, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-teal-50/95 sm:text-base">
          As {roleLabel}, encode patients who got in line, then issue their queue number for the doctor or service
          counter.
        </p>
        <div className="mt-5">
          <Link
            to={`/dashboard/${MODULES.STAFF_ENCODE}`}
            className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-teal-900 transition hover:bg-teal-50"
          >
            Open Encode Desk
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to={`/dashboard/${MODULES.STAFF_ENCODE}`} className="block no-underline">
          <div className="staff-dash-stat-card h-full">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Awaiting encoding</p>
            <p className="staff-dash-stat-value mt-3 text-teal-700">{loading ? '…' : awaiting}</p>
            <p className="mt-1 text-sm text-slate-500">Patients in line for you</p>
          </div>
        </Link>
        <Link to={`/dashboard/${MODULES.STAFF_ENCODE}`} className="block no-underline">
          <div className="staff-dash-stat-card h-full">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ready for queue #</p>
            <p className="staff-dash-stat-value mt-3 text-sky-700">{loading ? '…' : encoded}</p>
            <p className="mt-1 text-sm text-slate-500">Encoded — issue number next</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
