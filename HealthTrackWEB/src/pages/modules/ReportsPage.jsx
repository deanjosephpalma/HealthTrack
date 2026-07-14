import { useEffect, useMemo, useState } from 'react'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabaseClient'
import { generateHealthPlanReport } from '../../lib/ai'
import ReactMarkdown from 'react-markdown'

const AGE_BUCKETS = [
  { key: '0-9', min: 0, max: 9 },
  { key: '10-19', min: 10, max: 19 },
  { key: '20-29', min: 20, max: 29 },
  { key: '30-39', min: 30, max: 39 },
  { key: '40-49', min: 40, max: 49 },
  { key: '50-59', min: 50, max: 59 },
  { key: '60+', min: 60, max: Infinity },
]

function normalizeLabel(value, fallback) {
  const text = (value ?? '').toString().trim()
  return text || fallback
}

function safeDateOnly(value) {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

function formatDateKey(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function buildSeries(days) {
  const today = new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const items = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(base)
    d.setDate(base.getDate() - i)
    items.push({ date: d, key: formatDateKey(d), value: 0 })
  }
  return items
}

export default function ReportsPage() {
  const { role } = useAuth()
  const [metrics, setMetrics] = useState({
    patients: 0,
    appointments: 0,
    patientRecords: 0,
    inventory: 0,
    queue: 0,
    queueWaiting: 0,
    lowStock: 0,
  })
  const [analytics, setAnalytics] = useState({
    topDiagnoses: [],
    topBarangays: [],
    sexCounts: { Male: 0, Female: 0, Unknown: 0 },
    ageBuckets: [],
    recordsTrend: [],
    queueStatus: [],
    lowStockItems: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [aiReport, setAiReport] = useState('')
  const [generatingReport, setGeneratingReport] = useState(false)

  const handleGenerateAIReport = async () => {
    setGeneratingReport(true)
    try {
      const report = await generateHealthPlanReport({ metrics, analytics })
      setAiReport(report)
    } catch (err) {
      console.error(err)
      setAiReport('Failed to generate report.')
    } finally {
      setGeneratingReport(false)
    }
  }

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true)
      setError('')

      const canReadAppointments = role === 'Doctor' || role === 'Nurse'
      const canReadInventory = role === 'Doctor' || role === 'Nurse'

      const countQueries = [
        supabase.from('patients').select('id', { count: 'exact', head: true }),
        supabase.from('patient_records').select('id', { count: 'exact', head: true }),
        supabase.from('queue').select('id', { count: 'exact', head: true }),
        canReadAppointments ? supabase.from('appointments').select('id', { count: 'exact', head: true }) : Promise.resolve({ count: 0, error: null }),
        canReadInventory ? supabase.from('inventory_items').select('id', { count: 'exact', head: true }) : Promise.resolve({ count: 0, error: null }),
      ]

      const [patientsCount, recordsCount, queueCount, appointmentsCount, inventoryCount] = await Promise.all(countQueries)
      const firstError = [patientsCount.error, recordsCount.error, queueCount.error, appointmentsCount.error, inventoryCount.error].find(Boolean)

      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const [recordsResult, queueResult, inventoryResult] = await Promise.all([
        supabase
          .from('patient_records')
          .select('diagnosis, barangay, sex, age, created_at, date_of_consultation, latitude, longitude')
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase.from('queue').select('status, created_at').order('created_at', { ascending: false }).limit(2000),
        canReadInventory
          ? supabase.from('inventory_items').select('id, item_name, stock_quantity, unit, updated_at').order('stock_quantity', { ascending: true }).limit(200)
          : Promise.resolve({ data: [], error: null }),
      ])

      const analyticsError = [recordsResult.error, queueResult.error, inventoryResult.error].find(Boolean)
      if (analyticsError) {
        setError(analyticsError.message)
        setLoading(false)
        return
      }

      const patientRows = Array.isArray(recordsResult.data) ? recordsResult.data : []
      const queueRows = Array.isArray(queueResult.data) ? queueResult.data : []
      const inventoryRows = Array.isArray(inventoryResult.data) ? inventoryResult.data : []

      const diagnosisMap = new Map()
      const barangayMap = new Map()
      const sexCounts = { Male: 0, Female: 0, Unknown: 0 }
      const ageBucketCounts = AGE_BUCKETS.reduce((acc, bucket) => ({ ...acc, [bucket.key]: 0 }), {})
      const trend = buildSeries(14)
      const trendMap = new Map(trend.map((item) => [item.key, item]))

      for (const row of patientRows) {
        const diagnosis = normalizeLabel(row.diagnosis, 'Unspecified')
        const barangay = normalizeLabel(row.barangay, 'Unknown')
        diagnosisMap.set(diagnosis, (diagnosisMap.get(diagnosis) ?? 0) + 1)
        barangayMap.set(barangay, (barangayMap.get(barangay) ?? 0) + 1)

        const sexRaw = (row.sex ?? '').toString().trim().toLowerCase()
        if (sexRaw === 'male') sexCounts.Male += 1
        else if (sexRaw === 'female') sexCounts.Female += 1
        else sexCounts.Unknown += 1

        const age = Number(row.age)
        if (Number.isFinite(age) && age >= 0) {
          const bucket = AGE_BUCKETS.find((b) => age >= b.min && age <= b.max)
          if (bucket) ageBucketCounts[bucket.key] += 1
        }

        const date = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)
        if (date) {
          const key = formatDateKey(date)
          const entry = trendMap.get(key)
          if (entry) entry.value += 1
        }
      }

      const topDiagnoses = Array.from(diagnosisMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      const topBarangays = Array.from(barangayMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      const ageBuckets = AGE_BUCKETS.map((bucket) => ({
        label: bucket.key,
        count: ageBucketCounts[bucket.key] ?? 0,
      }))

      const queueStatusMap = new Map()
      for (const row of queueRows) {
        const status = normalizeLabel(row.status, 'unknown')
        queueStatusMap.set(status, (queueStatusMap.get(status) ?? 0) + 1)
      }
      const queueStatus = Array.from(queueStatusMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)

      const queueWaiting = queueStatusMap.get('waiting') ?? 0

      const lowStockItems = inventoryRows
        .filter((item) => Number(item.stock_quantity) <= 5)
        .slice(0, 10)
        .map((item) => ({
          id: item.id,
          item_name: item.item_name,
          stock_quantity: item.stock_quantity,
          unit: item.unit,
        }))

      setMetrics({
        patients: patientsCount.count ?? 0,
        patientRecords: recordsCount.count ?? 0,
        queue: queueCount.count ?? 0,
        appointments: appointmentsCount.count ?? 0,
        inventory: inventoryCount.count ?? 0,
        queueWaiting,
        lowStock: lowStockItems.length,
      })

      setAnalytics({
        topDiagnoses,
        topBarangays,
        sexCounts,
        ageBuckets,
        recordsTrend: trend,
        queueStatus,
        lowStockItems,
      })

      setLoading(false)
    }

    loadReports()
  }, [role])

  const allZero =
    metrics.patients === 0 &&
    metrics.patientRecords === 0 &&
    metrics.appointments === 0 &&
    metrics.inventory === 0 &&
    metrics.queue === 0

  const topDiagnosisMax = useMemo(() => Math.max(1, ...analytics.topDiagnoses.map((d) => d.count)), [analytics.topDiagnoses])
  const topBarangayMax = useMemo(() => Math.max(1, ...analytics.topBarangays.map((b) => b.count)), [analytics.topBarangays])
  const trendMax = useMemo(() => Math.max(1, ...analytics.recordsTrend.map((t) => t.value)), [analytics.recordsTrend])
  
  return (
    <section className="module-card">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="module-title">Reports and Analytics</h2>
          <p className="module-subtitle mb-0">
            Operational summaries and simple analytics driven by live Supabase data.
          </p>
        </div>
        <button
          onClick={handleGenerateAIReport}
          disabled={generatingReport || loading || allZero}
          className="secondary-btn w-auto shrink-0 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500"
        >
          {generatingReport ? 'Generating AI Report...' : 'Generate AI Health Plan'}
        </button>
      </div>

      {aiReport && (
        <div className="mb-8 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-indigo-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            AI Health Planning Report
          </h3>
          <div className="prose prose-sm max-w-none text-slate-700 prose-headings:text-indigo-900 prose-a:text-indigo-600">
            <ReactMarkdown>{aiReport}</ReactMarkdown>
          </div>
        </div>
      )}

      {loading && <p className="info-banner mb-4">Loading reports...</p>}
      {error && <p className="error-banner mb-4">Reports error: {error}</p>}

      {!loading && !error && allZero ? (
        <ModuleEmptyState
          title="No report data yet"
          description="All analytics cards stay at zero until tables are populated from the mobile app and nurse workflows."
        />
      ) : (
        <>
          <div className="simple-grid">
            <article className="stat-card">
              <p className="stat-label">Patients</p>
              <p className="stat-value">{metrics.patients}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Patient Records</p>
              <p className="stat-value">{metrics.patientRecords}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Queue Entries</p>
              <p className="stat-value">{metrics.queue}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Waiting Queue</p>
              <p className="stat-value">{metrics.queueWaiting}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Appointments</p>
              <p className="stat-value">{metrics.appointments}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Inventory Items</p>
              <p className="stat-value">{metrics.inventory}</p>
            </article>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Patient Records Trend (Last 14 days)</h3>
              <div className="mt-4 flex items-end gap-2">
                {analytics.recordsTrend.map((point) => {
                  const heightPct = Math.round((point.value / trendMax) * 100)
                  return (
                    <div key={point.key} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-lg bg-teal-500/80"
                        style={{
                          height: `${Math.max(6, heightPct)}px`,
                        }}
                        title={`${point.key}: ${point.value}`}
                      />
                      <span className="text-[10px] text-slate-500">{point.key.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Queue Status</h3>
              {analytics.queueStatus.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">No queue data.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {analytics.queueStatus.map((item) => {
                    const max = Math.max(1, ...analytics.queueStatus.map((s) => s.count))
                    const widthPct = Math.round((item.count / max) * 100)
                    return (
                      <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                          <p className="text-sm font-semibold text-slate-900">{item.count}</p>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-slate-900" style={{ width: `${widthPct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Top Diagnoses</h3>
              {analytics.topDiagnoses.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">No diagnosis data.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {analytics.topDiagnoses.map((item) => {
                    const widthPct = Math.round((item.count / topDiagnosisMax) * 100)
                    return (
                      <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                          <p className="text-sm font-semibold text-slate-900">{item.count}</p>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-teal-600" style={{ width: `${widthPct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Records by Barangay</h3>
              {analytics.topBarangays.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">No barangay data.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {analytics.topBarangays.map((item) => {
                    const widthPct = Math.round((item.count / topBarangayMax) * 100)
                    return (
                      <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                          <p className="text-sm font-semibold text-slate-900">{item.count}</p>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${widthPct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Demographics</h3>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Sex</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-700">
                    <div>
                      <p className="font-semibold text-slate-900">{analytics.sexCounts.Male}</p>
                      <p>Male</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{analytics.sexCounts.Female}</p>
                      <p>Female</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{analytics.sexCounts.Unknown}</p>
                      <p>Unknown</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Age Groups</p>
                  <div className="mt-3 space-y-2">
                    {analytics.ageBuckets.map((bucket) => (
                      <div key={bucket.label} className="flex items-center justify-between gap-4 text-sm text-slate-700">
                        <span>{bucket.label}</span>
                        <span className="font-semibold text-slate-900">{bucket.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Low Stock Items (≤ 5)</p>
                  {analytics.lowStockItems.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">No low stock alerts.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {analytics.lowStockItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-4 text-sm text-slate-700">
                          <span className="truncate">{item.item_name}</span>
                          <span className="font-semibold text-slate-900">
                            {item.stock_quantity} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}
