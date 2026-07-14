import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabaseClient'
import { ROLES } from '../config/rbac'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function normalizeLabel(value, fallback) {
  const text = (value ?? '').toString().trim()
  return text ? text : fallback
}

function formatDoctorName(name) {
  const text = (name ?? '').toString().trim()
  if (!text) return 'Doctor'
  if (/^dr\.?\s/i.test(text)) return text
  return `Dr. ${text}`
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

function formatClock(now) {
  try {
    return now.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return now.toISOString()
  }
}

function formatTime(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  try {
    return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function formatMinutes(mins) {
  const total = Math.max(0, Math.round(mins))
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}h ${m}m`
}

function computePriority({ reason, patientName }) {
  const text = `${reason ?? ''} ${patientName ?? ''}`.toLowerCase()
  const emergencyHints = ['chest pain', 'difficulty breathing', 'shortness of breath', 'seizure', 'unconscious', 'stroke', 'bleeding', 'severe', 'emergency']
  const highHints = ['dengue', 'fever', 'high fever', 'pregnant', 'asthma', 'hypertension', 'diabetes', 'tb', 'pneumonia']
  const moderateHints = ['cough', 'flu', 'headache', 'diarrhea', 'skin rash', 'follow-up']
  if (emergencyHints.some((h) => text.includes(h))) return 'EMERGENCY'
  if (highHints.some((h) => text.includes(h))) return 'HIGH'
  if (moderateHints.some((h) => text.includes(h))) return 'MODERATE'
  return 'LOW'
}

function severityMeta(level) {
  const v = (level ?? '').toString().toLowerCase()
  if (v === 'critical' || v === 'red') return { label: 'Critical', classes: 'bg-rose-50 text-rose-700 border-rose-200' }
  if (v === 'high' || v === 'orange') return { label: 'High', classes: 'bg-orange-50 text-orange-700 border-orange-200' }
  if (v === 'moderate' || v === 'yellow') return { label: 'Moderate', classes: 'bg-amber-50 text-amber-700 border-amber-200' }
  return { label: 'Low', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}

function pctChange(current, previous) {
  if (!Number.isFinite(previous) || previous <= 0) {
    if (!Number.isFinite(current) || current <= 0) return 0
    return 100
  }
  return Math.round(((current - previous) / previous) * 100)
}

function Icon({ name, className }) {
  const common = `h-5 w-5 ${className ?? ''}`.trim()
  if (name === 'users') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }
  if (name === 'queue') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M3 12h18" />
        <path d="M3 18h12" />
        <path d="M19 16l2 2-2 2" />
      </svg>
    )
  }
  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M3 4h18v18H3z" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
      </svg>
    )
  }
  if (name === 'stethoscope') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M4 3v7a5 5 0 0 0 10 0V3" />
        <path d="M9 21a5 5 0 0 0 5-5v-3" />
        <path d="M19 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    )
  }
  if (name === 'alert') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    )
  }
  if (name === 'map') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
      </svg>
    )
  }
  if (name === 'spark') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
      <path d="M12 2v20" />
      <path d="M2 12h20" />
    </svg>
  )
}

function useAnimatedNumber(target) {
  const [value, setValue] = useState(() => (Number.isFinite(Number(target)) ? Number(target) : 0))
  const targetRef = useRef(target)
  const valueRef = useRef(value)

  useEffect(() => {
    targetRef.current = target
  }, [target])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    const next = Number(targetRef.current)
    if (!Number.isFinite(next)) return
    const start = Number(valueRef.current)
    if (!Number.isFinite(start)) {
      setValue(next)
      return
    }
    const delta = next - start
    const duration = 520
    const startAt = performance.now()
    let raf = 0
    const tick = (t) => {
      const p = Math.min(1, (t - startAt) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(start + delta * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  return Math.round(value)
}

function TinyArea({ data, color = '#0f766e' }) {
  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#grad-${color.replace('#', '')})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function MiniOutbreakCanvas({ points, onOpen }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)

    const bg = ctx.createLinearGradient(0, 0, width, height)
    bg.addColorStop(0, 'rgba(20, 184, 166, 0.14)')
    bg.addColorStop(0.5, 'rgba(16, 185, 129, 0.10)')
    bg.addColorStop(1, 'rgba(59, 130, 246, 0.06)')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    if (!Array.isArray(points) || points.length === 0) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
      ctx.font = '600 12px Manrope, sans-serif'
      ctx.fillText('No outbreak points yet', 12, 24)
      return
    }

    const valid = points
      .map((p) => ({ x: Number(p.longitude), y: Number(p.latitude) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    if (valid.length === 0) return

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of valid) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const pad = 0.0005
    minX -= pad
    maxX += pad
    minY -= pad
    maxY += pad

    const mapX = (x) => ((x - minX) / Math.max(1e-9, maxX - minX)) * (width - 24) + 12
    const mapY = (y) => (1 - (y - minY) / Math.max(1e-9, maxY - minY)) * (height - 24) + 12

    for (const p of valid) {
      const cx = mapX(p.x)
      const cy = mapY(p.y)
      const r = 16
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, 'rgba(244, 63, 94, 0.33)')
      g.addColorStop(0.55, 'rgba(245, 158, 11, 0.10)')
      g.addColorStop(1, 'rgba(245, 158, 11, 0.0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.strokeStyle = 'rgba(15, 118, 110, 0.28)'
    ctx.lineWidth = 1
    ctx.strokeRect(8.5, 8.5, width - 17, height - 17)
  }, [points])

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
      aria-label="Open Heat Map Visualization"
    >
      <div className="absolute inset-0 bg-linear-to-br from-teal-50/70 via-white to-emerald-50/40 opacity-70" />
      <div className="relative p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Outbreak Preview</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-700">
            <Icon name="map" className="h-3.5 w-3.5" /> Open
          </span>
        </div>
        <canvas ref={canvasRef} width={560} height={220} className="h-40 w-full rounded-xl" />
        <p className="mt-2 text-left text-xs text-slate-600">
          Tap to open the full RHU Heat Map Intelligence view.
        </p>
      </div>
    </button>
  )
}

function PriorityPill({ priority }) {
  const p = (priority ?? '').toString().toUpperCase()
  if (p === 'EMERGENCY') return <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">EMERGENCY</span>
  if (p === 'HIGH') return <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">HIGH</span>
  if (p === 'MODERATE') return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">MODERATE</span>
  return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">LOW</span>
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile, role, profileError } = useAuth()
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [pulseKey, setPulseKey] = useState(0)
  const [quickOpen, setQuickOpen] = useState(false)

  const [serviceTypes, setServiceTypes] = useState([])
  const [appointments, setAppointments] = useState([])
  const [queueItems, setQueueItems] = useState([])
  const [records, setRecords] = useState([])
  const [lowStockItems, setLowStockItems] = useState([])
  const [activity, setActivity] = useState([])
  const [activeWorkflowCount, setActiveWorkflowCount] = useState(0)
  const [totalRecordsCount, setTotalRecordsCount] = useState(0)
  const [tbRecords, setTbRecords] = useState([])

  const loadTimerRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const greeting = useMemo(() => {
    const hour = now.getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [now])

  const canReadAppointments = role === ROLES.DOCTOR || role === ROLES.NURSE
  const canReadInventory = role === ROLES.DOCTOR || role === ROLES.NURSE

  const hydrateActivity = useCallback(({ nextAppointments, nextQueue, nextRecords }) => {
    const items = []
    for (const row of nextQueue.slice(0, 10)) {
      const at = row?.created_at ? new Date(row.created_at) : null
      items.push({
        id: `queue-${row.id}`,
        at: at && !Number.isNaN(at.getTime()) ? at : new Date(0),
        label: 'Queue check-in',
        detail: `${row.queue_number ? `#${row.queue_number} · ` : ''}${normalizeLabel(row.patient_name, 'Patient')}`,
        tone: 'teal',
      })
    }
    for (const row of nextAppointments.slice(0, 10)) {
      const at = row?.created_at ? new Date(row.created_at) : null
      items.push({
        id: `appt-${row.id}`,
        at: at && !Number.isNaN(at.getTime()) ? at : new Date(0),
        label: 'Appointment updated',
        detail: normalizeLabel(row.patient_name, 'Patient'),
        tone: 'slate',
      })
    }
    for (const row of nextRecords.slice(0, 10)) {
      const at = row?.created_at ? new Date(row.created_at) : null
      items.push({
        id: `record-${row.id}`,
        at: at && !Number.isNaN(at.getTime()) ? at : new Date(0),
        label: 'Consultation recorded',
        detail: `${normalizeLabel(row.diagnosis, 'Unspecified')} · ${normalizeLabel(row.barangay, 'Barangay')}`,
        tone: 'emerald',
      })
    }
    items.sort((a, b) => b.at.getTime() - a.at.getTime())
    setActivity(items.slice(0, 14))
  }, [])

  const loadDashboard = useCallback(async () => {
    if (!role) return
    setLoading(true)
    setError('')

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const recordsSince = new Date()
    recordsSince.setDate(recordsSince.getDate() - 90)

    const queries = [
      canReadAppointments
        ? supabase
            .from('appointments')
            .select('id, patient_name, appointment_date, status, reason, preferred_schedule, notes, created_at, doctor_queue_status, queue_id, service_type_id')
            .is('archived_at', null)
            .order('appointment_date', { ascending: true })
            .limit(300)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('queue')
        .select('id, queue_number, patient_name, reason, status, created_at, appointment_id, patient_id')
        .is('archived_at', null)
        .gte('created_at', startOfToday.toISOString())
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('patient_records')
        .select('id, diagnosis, notes, barangay, sex, age, temp, spo2, bp, created_at, date_of_consultation, latitude, longitude, tb_classification')
        .is('archived_at', null)
        .gte('created_at', recordsSince.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000),
      canReadInventory
        ? supabase
            .from('inventory_items')
            .select('id, item_name, stock_quantity, unit, updated_at')
            .order('stock_quantity', { ascending: true })
            .limit(120)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('service_types').select('id, name').order('name', { ascending: true }),
      supabase
        .from('service_requests')
        .select('id, status, current_status')
        .is('archived_at', null)
        .not('status', 'eq', 'Completed')
        .not('status', 'eq', 'Cancelled')
        .limit(200),
      supabase.from('patient_records').select('*', { count: 'exact', head: true }),
    ]

    const [appointmentsRes, queueRes, recordsRes, inventoryRes, serviceTypesRes, activeRequestsRes, totalRecordsRes] = await Promise.all(queries)
    const firstError = [appointmentsRes.error, queueRes.error, recordsRes.error, inventoryRes.error, serviceTypesRes.error].find(Boolean)
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const nextAppointments = Array.isArray(appointmentsRes.data) ? appointmentsRes.data : []
    const nextQueue = Array.isArray(queueRes.data) ? queueRes.data : []
    const nextRecords = Array.isArray(recordsRes.data) ? recordsRes.data : []
    const nextInventory = Array.isArray(inventoryRes.data) ? inventoryRes.data : []
    const nextServiceTypes = Array.isArray(serviceTypesRes.data) ? serviceTypesRes.data : []
    const activeRequests = Array.isArray(activeRequestsRes.data) ? activeRequestsRes.data : []

    setAppointments(nextAppointments)
    setQueueItems(nextQueue)
    setRecords(nextRecords)
    setServiceTypes(nextServiceTypes)
    setLowStockItems(nextInventory.filter((row) => Number(row.stock_quantity) <= 5).slice(0, 10))
    // We can store active requests count directly or add a new state, let's use a state.
    setActiveWorkflowCount(activeRequests.length)
    setTotalRecordsCount(totalRecordsRes.count || nextRecords.length)
    const derivedTb = nextRecords
      .filter((row) => {
        const dx = (row.diagnosis ?? '').toString()
        const notes = (row.notes ?? '').toString()
        return (
          Boolean(row.tb_classification) ||
          notes.includes('[TB Treatment Record]') ||
          /tuberculosis|\btb\b/i.test(dx)
        )
      })
      .map((row) => ({
        ...row,
        tb_diagnosis: row.diagnosis,
        tb_classification: row.tb_classification || 'Unclassified',
      }))
    setTbRecords(derivedTb)

    hydrateActivity({ nextAppointments, nextQueue, nextRecords })

    setLastSyncAt(new Date())
    setPulseKey((k) => k + 1)
    setLoading(false)
  }, [canReadAppointments, canReadInventory, hydrateActivity, role])

  useEffect(() => {
    if (!role) return
    const raf = requestAnimationFrame(() => {
      void loadDashboard()
    })
    return () => cancelAnimationFrame(raf)
  }, [loadDashboard, role])

  useEffect(() => {
    if (!role) return

    const scheduleReload = () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current)
      }
      loadTimerRef.current = setTimeout(() => {
        void loadDashboard()
      }, 350)
    }

    const channel = supabase
      .channel('doctor-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, (payload) => {
        const who = normalizeLabel(payload?.new?.patient_name, 'Patient')
        const num = payload?.new?.queue_number ? `#${payload.new.queue_number}` : ''
        setActivity((prev) => {
          const next = [
            {
              id: `evt-queue-${payload.commit_timestamp ?? Date.now()}-${Math.random().toString(16).slice(2)}`,
              at: payload.commit_timestamp ? new Date(payload.commit_timestamp) : new Date(),
              label: 'Queue update',
              detail: `${num ? `${num} · ` : ''}${who}`,
              tone: 'teal',
            },
            ...(Array.isArray(prev) ? prev : []),
          ]
          return next.slice(0, 14)
        })
        scheduleReload()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
        const who = normalizeLabel(payload?.new?.patient_name, 'Patient')
        setActivity((prev) => {
          const next = [
            {
              id: `evt-appt-${payload.commit_timestamp ?? Date.now()}-${Math.random().toString(16).slice(2)}`,
              at: payload.commit_timestamp ? new Date(payload.commit_timestamp) : new Date(),
              label: 'Appointment update',
              detail: who,
              tone: 'slate',
            },
            ...(Array.isArray(prev) ? prev : []),
          ]
          return next.slice(0, 14)
        })
        scheduleReload()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_records' }, (payload) => {
        const dx = normalizeLabel(payload?.new?.diagnosis, 'Unspecified')
        const brgy = normalizeLabel(payload?.new?.barangay, 'Barangay')
        setActivity((prev) => {
          const next = [
            {
              id: `evt-rec-${payload.commit_timestamp ?? Date.now()}-${Math.random().toString(16).slice(2)}`,
              at: payload.commit_timestamp ? new Date(payload.commit_timestamp) : new Date(),
              label: 'Consultation recorded',
              detail: `${dx} · ${brgy}`,
              tone: 'emerald',
            },
            ...(Array.isArray(prev) ? prev : []),
          ]
          return next.slice(0, 14)
        })
        scheduleReload()
      })
      .subscribe()

    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [loadDashboard, role])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = (event.key ?? '').toLowerCase()
      if (!event.shiftKey) return
      if (key === 'n') {
        event.preventDefault()
        navigate('/dashboard/patient-records')
      } else if (key === 'q') {
        event.preventDefault()
        navigate('/dashboard/queue')
      } else if (key === 'a' || key === 'd') {
        event.preventDefault()
        navigate('/dashboard/doctor-consult')
      } else if (key === 'h') {
        event.preventDefault()
        navigate('/dashboard/heat-map')
      } else if (key === 'k') {
        event.preventDefault()
        setQuickOpen((v) => !v)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now])

  const serviceTypeById = useMemo(() => new Map(serviceTypes.map((r) => [r.id, r.name])), [serviceTypes])

  const todayAppointments = useMemo(() => {
    if (!Array.isArray(appointments)) return []
    return appointments.filter((row) => {
      const d = safeDateOnly(row.appointment_date)
      if (!d) return false
      return d.getTime() === today.getTime()
    })
  }, [appointments, today])

  const upcomingAppointments = useMemo(() => {
    return todayAppointments
      .slice()
      .sort((a, b) => (Date.parse(a.appointment_date ?? '') || 0) - (Date.parse(b.appointment_date ?? '') || 0))
      .slice(0, 10)
  }, [todayAppointments])

  const activeQueue = useMemo(() => {
    if (!Array.isArray(queueItems)) return []
    return queueItems
      .filter((row) => {
        const status = (row.status ?? 'waiting').toString().toLowerCase()
        return !['done', 'cancelled', 'completed'].includes(status)
      })
      .slice()
      .sort((a, b) => (Date.parse(a.created_at ?? '') || 0) - (Date.parse(b.created_at ?? '') || 0))
      .slice(0, 12)
  }, [queueItems])

  const waitingQueue = useMemo(() => activeQueue.filter((row) => (row.status ?? 'waiting').toString().toLowerCase() === 'waiting'), [activeQueue])

  const recordsLast14Series = useMemo(() => {
    const trend = buildSeries(14)
    const map = new Map(trend.map((d) => [d.key, d]))
    for (const row of records) {
      const d = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)
      if (!d) continue
      const key = formatDateKey(d)
      const entry = map.get(key)
      if (entry) entry.value += 1
    }
    return trend.map((d) => ({ key: d.key, value: d.value }))
  }, [records])

  const appointmentsLast14Series = useMemo(() => {
    const trend = buildSeries(14)
    const map = new Map(trend.map((d) => [d.key, d]))
    for (const row of appointments) {
      const d = safeDateOnly(row.appointment_date) ?? safeDateOnly(row.created_at)
      if (!d) continue
      const key = formatDateKey(d)
      const entry = map.get(key)
      if (entry) entry.value += 1
    }
    return trend.map((d) => ({ key: d.key, value: d.value }))
  }, [appointments])

  const weekWindows = useMemo(() => {
    const base = new Date(today)
    const startCurrent = new Date(base)
    startCurrent.setDate(base.getDate() - 6)
    const startPrev = new Date(base)
    startPrev.setDate(base.getDate() - 13)
    const endPrev = new Date(base)
    endPrev.setDate(base.getDate() - 7)
    return { startCurrent, startPrev, endPrev }
  }, [today])

  const recordWeekCounts = useMemo(() => {
    let current = 0
    let previous = 0
    for (const row of records) {
      const d = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)
      if (!d) continue
      if (d >= weekWindows.startCurrent && d <= today) current += 1
      else if (d >= weekWindows.startPrev && d <= weekWindows.endPrev) previous += 1
    }
    return { current, previous }
  }, [records, today, weekWindows])

  const appointmentWeekCounts = useMemo(() => {
    let current = 0
    let previous = 0
    for (const row of appointments) {
      const d = safeDateOnly(row.appointment_date) ?? safeDateOnly(row.created_at)
      if (!d) continue
      if (d >= weekWindows.startCurrent && d <= today) current += 1
      else if (d >= weekWindows.startPrev && d <= weekWindows.endPrev) previous += 1
    }
    return { current, previous }
  }, [appointments, today, weekWindows])

  const recordWeekCurrent = recordWeekCounts.current
  const recordWeekPrevious = recordWeekCounts.previous
  const apptWeekCurrent = appointmentWeekCounts.current
  const apptWeekPrevious = appointmentWeekCounts.previous

  const criticalCases = useMemo(() => {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const out = []
    for (const row of records) {
      const at = row.created_at ? new Date(row.created_at) : null
      if (!at || Number.isNaN(at.getTime()) || at < cutoff) continue
      const spo2 = Number(row.spo2)
      const temp = Number(row.temp)
      const bpRaw = (row.bp ?? '').toString()
      let sys = null
      let dia = null
      if (bpRaw.includes('/')) {
        const [a, b] = bpRaw.split('/').map((v) => Number(v))
        if (Number.isFinite(a)) sys = a
        if (Number.isFinite(b)) dia = b
      }
      const dx = (row.diagnosis ?? '').toString().toLowerCase()
      const isCritical =
        (Number.isFinite(spo2) && spo2 > 0 && spo2 <= 92) ||
        (Number.isFinite(temp) && temp >= 39) ||
        (Number.isFinite(sys) && sys >= 180) ||
        (Number.isFinite(dia) && dia >= 120) ||
        dx.includes('severe')
      if (isCritical) out.push(row)
    }
    return out.slice(0, 20)
  }, [now, records])

  const outbreakSummary = useMemo(() => {
    const byDx = new Map()
    const byDxBrgy = new Map()
    for (const row of records) {
      const d = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)
      if (!d) continue
      if (d < weekWindows.startPrev) continue
      const dx = normalizeLabel(row.diagnosis, 'Unspecified')
      const brgy = normalizeLabel(row.barangay, 'Unknown')
      const isCurrent = d >= weekWindows.startCurrent && d <= today
      const key = `${dx}__${brgy}`
      const entryDx = byDx.get(dx) ?? { dx, current: 0, previous: 0 }
      if (isCurrent) entryDx.current += 1
      else entryDx.previous += 1
      byDx.set(dx, entryDx)
      const entryDxBrgy = byDxBrgy.get(key) ?? { dx, brgy, current: 0, previous: 0 }
      if (isCurrent) entryDxBrgy.current += 1
      else entryDxBrgy.previous += 1
      byDxBrgy.set(key, entryDxBrgy)
    }

    const dxList = Array.from(byDx.values())
      .map((row) => ({ ...row, change: pctChange(row.current, row.previous) }))
      .sort((a, b) => b.current - a.current)
      .slice(0, 6)

    const hotspots = Array.from(byDxBrgy.values())
      .map((row) => ({ ...row, change: pctChange(row.current, row.previous) }))
      .sort((a, b) => b.current - a.current)
      .slice(0, 6)

    return { dxList, hotspots }
  }, [records, today, weekWindows])

  const heatmapPoints = useMemo(() => {
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() - 13)
    return records
      .filter((row) => {
        const d = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)
        if (!d || d < cutoff) return false
        return Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      })
      .slice(0, 800)
      .map((row) => ({ latitude: row.latitude, longitude: row.longitude }))
  }, [records, today])

  const topDiagnosesForDonut = useMemo(() => {
    const map = new Map()
    for (const row of records) {
      const d = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)
      if (!d) continue
      if (d < weekWindows.startCurrent) continue
      const dx = normalizeLabel(row.diagnosis, 'Unspecified')
      map.set(dx, (map.get(dx) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [records, weekWindows])

  const topBarangays = useMemo(() => {
    const map = new Map()
    for (const row of records) {
      const d = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)
      if (!d) continue
      if (d < weekWindows.startCurrent) continue
      const brgy = normalizeLabel(row.barangay, 'Unknown')
      map.set(brgy, (map.get(brgy) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [records, weekWindows])

  const dashboardAlerts = useMemo(() => {
    const alerts = []
    const waitingOver = waitingQueue.filter((row) => {
      const created = row.created_at ? new Date(row.created_at) : null
      if (!created || Number.isNaN(created.getTime())) return false
      const mins = (now.getTime() - created.getTime()) / 60000
      return mins >= 45
    })
    if (waitingOver.length > 0) {
      alerts.push({
        id: 'queue-long-wait',
        severity: 'orange',
        title: 'Extended waiting time',
        message: `${waitingOver.length} patient(s) waiting over 45 minutes.`,
      })
    }

    const criticalCount = criticalCases.length
    if (criticalCount > 0) {
      alerts.push({
        id: 'critical-cases',
        severity: criticalCount >= 3 ? 'red' : 'orange',
        title: 'Critical vitals detected',
        message: `${criticalCount} record(s) flagged in the last 24 hours.`,
      })
    }

    const noShowToday = todayAppointments.filter((row) => (row.status ?? '').toString().toLowerCase() === 'no_show').length
    if (noShowToday > 0) {
      alerts.push({
        id: 'no-show',
        severity: noShowToday >= 3 ? 'orange' : 'yellow',
        title: 'Missed consultations',
        message: `${noShowToday} appointment(s) marked as no-show today.`,
      })
    }

    if (lowStockItems.length > 0) {
      alerts.push({
        id: 'low-stock',
        severity: lowStockItems.length >= 3 ? 'yellow' : 'green',
        title: 'Medicine / supply low stock',
        message: `${lowStockItems.length} item(s) at low stock threshold.`,
      })
    }

    const dengue = outbreakSummary.dxList.find((row) => row.dx.toLowerCase().includes('dengue'))
    if (dengue && (dengue.current >= 3 || dengue.change >= 30)) {
      alerts.push({
        id: 'dengue-spike',
        severity: dengue.current >= 6 || dengue.change >= 60 ? 'red' : 'orange',
        title: 'Dengue signal detected',
        message: `${dengue.current} case(s) in the last 7 days (${dengue.change >= 0 ? `+${dengue.change}` : dengue.change}% vs prior week).`,
      })
    }

    const respiratory = outbreakSummary.dxList.find((row) => row.dx.toLowerCase().includes('resp') || row.dx.toLowerCase().includes('cough'))
    if (respiratory && (respiratory.current >= 6 || respiratory.change >= 35)) {
      alerts.push({
        id: 'respiratory-spike',
        severity: respiratory.change >= 60 ? 'orange' : 'yellow',
        title: 'Respiratory cases increasing',
        message: `${respiratory.current} record(s) this week (${respiratory.change >= 0 ? `+${respiratory.change}` : respiratory.change}%).`,
      })
    }

    return alerts.slice(0, 6)
  }, [criticalCases.length, lowStockItems.length, now, outbreakSummary.dxList, todayAppointments, waitingQueue])

  const aiInsights = useMemo(() => {
    const insights = []
    const recordsDelta = pctChange(recordWeekCurrent, recordWeekPrevious)
    const apptDelta = pctChange(apptWeekCurrent, apptWeekPrevious)

    insights.push({
      id: 'ins-pace',
      title: 'Workload pulse',
      message: `Consultations ${recordsDelta >= 0 ? 'up' : 'down'} ${Math.abs(recordsDelta)}% this week. Appointments ${apptDelta >= 0 ? 'up' : 'down'} ${Math.abs(apptDelta)}%.`,
    })

    const hotspot = outbreakSummary.hotspots[0]
    if (hotspot && (hotspot.current >= 3 || hotspot.change >= 40)) {
      insights.push({
        id: 'ins-hotspot',
        title: 'Cluster watch',
        message: `Potential cluster in ${hotspot.brgy}: ${hotspot.dx} (${hotspot.current} this week, ${hotspot.change >= 0 ? `+${hotspot.change}` : hotspot.change}%).`,
      })
    }

    const seniors = records.filter((row) => {
      const d = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)
      if (!d) return false
      if (d < weekWindows.startCurrent) return false
      const age = Number(row.age)
      return Number.isFinite(age) && age >= 60
    }).length
    if (seniors > 0) {
      insights.push({
        id: 'ins-seniors',
        title: 'High-risk follow-ups',
        message: `${seniors} senior patient record(s) this week. Prioritize follow-up and medication adherence checks.`,
      })
    }

    if (waitingQueue.length >= 8) {
      insights.push({
        id: 'ins-queue',
        title: 'Queue optimization',
        message: `Queue backlog is elevated (${waitingQueue.length} waiting). Consider triage-first flow and fast lanes for refills.`,
      })
    }

    return insights.slice(0, 4)
  }, [apptWeekCurrent, apptWeekPrevious, outbreakSummary.hotspots, recordWeekCurrent, recordWeekPrevious, records, waitingQueue.length, weekWindows.startCurrent])

  const patientsTodayCount = useMemo(() => {
    const map = new Set()
    for (const row of todayAppointments) {
      const name = normalizeLabel(row.patient_name, '').toLowerCase()
      if (name) map.add(name)
    }
    return map.size
  }, [todayAppointments])

  const heatmapAlertCount = useMemo(() => {
    const highSignals = outbreakSummary.dxList.filter((row) => row.change >= 35 && row.current >= 3).length
    return Math.max(0, highSignals)
  }, [outbreakSummary.dxList])

  const criticalCount = criticalCases.length
  const waitingCount = waitingQueue.length
  const apptTodayCount = todayAppointments.length

  // TB Surveillance computed data
  const tbSummary = useMemo(() => {
    const byClassification = new Map()
    const byBarangay = new Map()
    const byDiagnosis = new Map()
    const trend = buildSeries(30)
    const trendMap = new Map(trend.map((d) => [d.key, d]))

    for (const row of tbRecords) {
      const classification = (row.tb_classification ?? 'Unclassified').toString().trim() || 'Unclassified'
      const barangay = (row.barangay ?? '').toString().trim() || 'Unknown'
      const diagnosis = (row.tb_diagnosis ?? 'Unspecified').toString().trim() || 'Unspecified'
      const d = safeDateOnly(row.date_of_consultation) ?? safeDateOnly(row.created_at)

      byClassification.set(classification, (byClassification.get(classification) ?? 0) + 1)
      if (barangay !== 'Unknown') byBarangay.set(barangay, (byBarangay.get(barangay) ?? 0) + 1)
      byDiagnosis.set(diagnosis, (byDiagnosis.get(diagnosis) ?? 0) + 1)

      if (d) {
        const key = formatDateKey(d)
        const entry = trendMap.get(key)
        if (entry) entry.value += 1
      }
    }

    const classificationList = Array.from(byClassification.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)

    const barangayList = Array.from(byBarangay.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    const diagnosisList = Array.from(byDiagnosis.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)

    return {
      total: tbRecords.length,
      classificationList,
      barangayList,
      diagnosisList,
      trend: trend.map((d) => ({ key: d.key, value: d.value })),
    }
  }, [tbRecords])

  const animatedPatientsToday = useAnimatedNumber(patientsTodayCount)
  const animatedWaiting = useAnimatedNumber(waitingCount)
  const animatedAppts = useAnimatedNumber(apptTodayCount)
  const animatedCritical = useAnimatedNumber(criticalCount)
  const animatedHeatAlerts = useAnimatedNumber(heatmapAlertCount)
  const animatedActiveWorkflows = useAnimatedNumber(activeWorkflowCount)
  const animatedTotalRecords = useAnimatedNumber(totalRecordsCount)

  const secondsSinceSync = useMemo(() => {
    if (!lastSyncAt) return null
    const diff = Math.max(0, Math.floor((now.getTime() - lastSyncAt.getTime()) / 1000))
    return diff
  }, [lastSyncAt, now])

  const statCards = useMemo(() => {
    const base = recordsLast14Series.slice(-7)
    return [
      { key: 'patients', label: 'Patients Today', value: animatedPatientsToday, icon: 'users', trend: base, change: recordWeekCurrent, sub: 'Unique patients from today’s schedule' },
      { key: 'queue', label: 'Waiting Queue', value: animatedWaiting, icon: 'queue', trend: base, change: waitingCount, sub: 'Live queue waiting now' },
      { key: 'appt', label: 'In Queue Today', value: animatedAppts, icon: 'calendar', trend: appointmentsLast14Series.slice(-7), change: apptWeekCurrent, sub: 'Scheduled for today' },
      { key: 'workflows', label: 'Active Requests', value: animatedActiveWorkflows, icon: 'stethoscope', trend: base, change: activeWorkflowCount, sub: 'In-progress workflows' },
      { key: 'critical', label: 'Critical Cases', value: animatedCritical, icon: 'alert', trend: base, change: criticalCount, sub: 'Flagged in last 24 hours' },
      { key: 'heat', label: 'Heatmap Alerts', value: animatedHeatAlerts, icon: 'map', trend: base, change: heatmapAlertCount, sub: 'Signals vs prior week' },
    ]
  }, [
    animatedActiveWorkflows,
    animatedAppts,
    animatedCritical,
    animatedHeatAlerts,
    animatedPatientsToday,
    animatedWaiting,
    apptWeekCurrent,
    appointmentsLast14Series,
    criticalCount,
    heatmapAlertCount,
    activeWorkflowCount,
    recordWeekCurrent,
    recordsLast14Series,
    waitingCount,
  ])

  return (
    <section className="staff-dash space-y-4 sm:space-y-6">
      <Motion.div
        layout
        className="staff-dash-hero"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-teal-200/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-100/90">Doctor station · RHU Pila</p>
            <h1 className="staff-dash-hero-title mt-2">
              {greeting}, {formatDoctorName(profile?.name)}
            </h1>
            <p className="staff-dash-hero-lead">
              {waitingCount > 0 ? `${waitingCount} patient(s) waiting` : 'No patients waiting'} ·{' '}
              {criticalCount > 0 ? `${criticalCount} critical case(s)` : 'No critical alerts'} · consults, queue, and records in one place.
            </p>
            <div className="staff-dash-hero-meta">
              <Motion.span
                key={pulseKey}
                className="staff-dash-hero-dot"
                initial={{ opacity: 0.35, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              />
              <span>Live</span>
              <span>·</span>
              <span>{formatClock(now)}</span>
              <span>·</span>
              <span>
                {secondsSinceSync == null ? 'Sync: —' : secondsSinceSync < 2 ? 'Synced now' : `Synced ${secondsSinceSync}s ago`}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/dashboard/doctor-consult"
                className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-teal-900 transition hover:bg-teal-50"
              >
                Doctor Consult
              </Link>
              <Link
                to="/dashboard/queue"
                className="inline-flex items-center rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                Open Queue
              </Link>
              <Link
                to="/dashboard/patient-records"
                className="inline-flex items-center rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                Patient Records
              </Link>
            </div>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm lg:max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-100/80">Clinic activity</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                <p className="text-xs text-teal-100/75">In queue today</p>
                <p className="mt-1 font-[Fraunces] text-xl font-bold text-white" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
                  {animatedAppts}
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                <p className="text-xs text-teal-100/75">Waiting now</p>
                <p className="mt-1 font-[Fraunces] text-xl font-bold text-white" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
                  {animatedWaiting}
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                <p className="text-xs text-teal-100/75">Total records</p>
                <p className="mt-1 font-[Fraunces] text-xl font-bold text-white" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
                  {animatedTotalRecords}
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                <p className="text-xs text-teal-100/75">Heat signals</p>
                <p className="mt-1 font-[Fraunces] text-xl font-bold text-white" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
                  {animatedHeatAlerts}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-teal-100/70">
              Shortcuts: Shift+N · Shift+Q · Shift+H · Shift+K
            </p>
          </div>
        </div>
      </Motion.div>

      {profileError ? <p className="error-banner">Profile error: {profileError}</p> : null}
      {error ? <p className="error-banner">Dashboard error: {error}</p> : null}
      {loading ? <p className="info-banner">Syncing live dashboard…</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {statCards.map((card) => {
          const iconColor =
            card.key === 'critical'
              ? 'text-rose-700 bg-rose-50 border-rose-200'
              : card.key === 'heat'
                ? 'text-sky-700 bg-sky-50 border-sky-200'
                : card.key === 'active'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-teal-700 bg-teal-50 border-teal-200'

          const delta = card.key === 'appt' ? pctChange(apptWeekCurrent, apptWeekPrevious) : pctChange(recordWeekCurrent, recordWeekPrevious)
          const deltaLabel = `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs last week`
          const deltaColor = delta >= 0 ? 'text-emerald-700' : 'text-rose-700'
          const chartColor = card.key === 'critical' ? '#e11d48' : card.key === 'heat' ? '#0284c7' : '#0f766e'

          return (
            <Motion.article
              key={card.key}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md sm:rounded-2xl sm:p-4"
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <div className="absolute inset-0 bg-linear-to-br from-teal-50/70 via-white to-emerald-50/30 opacity-60" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold ${iconColor}`}>
                    <Icon name={card.icon} className="h-4 w-4" />
                  </span>
                  <span className={`text-xs font-semibold ${deltaColor}`}>{deltaLabel}</span>
                </div>

                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{card.label}</p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
                    {card.value}
                  </p>
                  <div className="flex-1">
                    <TinyArea data={card.trend} color={chartColor} />
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-600">{card.sub}</p>
              </div>
            </Motion.article>
          )
        })}
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        <div className="space-y-4 sm:space-y-5 lg:col-span-7">
          <Motion.section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.04 }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="m-0 text-base font-bold text-slate-900 sm:text-lg">Today’s Appointments</h3>
                <p className="mt-1 text-sm text-slate-600">Timeline view with quick context and priority indicators.</p>
              </div>
              <Link className="secondary-btn mt-0! bg-slate-900 hover:bg-slate-800" to="/dashboard/queue">
                Open Schedule
              </Link>
            </div>

            {upcomingAppointments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">No appointments scheduled for today.</p>
                <p className="mt-1 text-sm text-slate-600">Start by checking the queue or reviewing consultation records.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="secondary-btn mt-0!" to="/dashboard/queue">
                    Open Queue
                  </Link>
                  <Link className="secondary-btn mt-0! bg-slate-900 hover:bg-slate-800" to="/dashboard/patient-records">
                    Open Patient Records
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.map((appt) => {
                  const status = (appt.status ?? 'scheduled').toString().toLowerCase()
                  const statusClasses =
                    status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : status === 'in_queue'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : status === 'checked_in'
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : status === 'cancelled' || status === 'no_show'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-slate-50 text-slate-700 border-slate-200'

                  const priority = computePriority({ reason: appt.reason || appt.notes, patientName: appt.patient_name })
                  const service = appt.service_type_id ? serviceTypeById.get(appt.service_type_id) : null

                  return (
                    <Motion.article
                      key={appt.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      whileHover={{ y: -2 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {formatTime(appt.appointment_date)} · {service ? service : 'Consultation'}
                          </p>
                          <p className="mt-1 truncate text-base font-bold text-slate-900">{normalizeLabel(appt.patient_name, 'Patient')}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{normalizeLabel(appt.reason || appt.notes, 'No reason provided')}</p>
                          {appt.preferred_schedule ? (
                            <p className="mt-1 text-xs text-slate-500">Preferred: {appt.preferred_schedule}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <PriorityPill priority={priority} />
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClasses}`}>
                            {status.replaceAll('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </Motion.article>
                  )
                })}
              </div>
            )}
          </Motion.section>

          <Motion.section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.08 }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="m-0 text-base font-bold text-slate-900 sm:text-lg">Analytics</h3>
                <p className="mt-1 text-sm text-slate-600">Real-time consultation trend and case mix snapshot (last 14 days).</p>
              </div>
              <Link className="secondary-btn mt-0! bg-teal-600 hover:bg-teal-500" to="/dashboard/reports">
                Open Reports
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Consultations Trend</p>
                <div className="mt-3 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={recordsLast14Series}>
                      <defs>
                        <linearGradient id="grad-consults" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f766e" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#0f766e" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="key" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
                        labelStyle={{ fontWeight: 700 }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} fill="url(#grad-consults)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Case Mix</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={topDiagnosesForDonut} dataKey="value" nameKey="label" innerRadius={42} outerRadius={74} paddingAngle={3}>
                          {topDiagnosesForDonut.map((_, idx) => {
                            const colors = ['#0f766e', '#10b981', '#0284c7', '#f59e0b', '#e11d48', '#64748b']
                            return <Cell key={idx} fill={colors[idx % colors.length]} />
                          })}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {topDiagnosesForDonut.length === 0 ? (
                      <p className="text-sm text-slate-600">No diagnoses recorded yet this week.</p>
                    ) : (
                      topDiagnosesForDonut.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-900">{row.label}</p>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                            {row.value}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Top Barangays (This Week)</p>
                <Link className="text-xs font-semibold text-teal-700 hover:text-teal-600" to="/dashboard/heat-map">
                  View Heatmap
                </Link>
              </div>
              <div className="mt-3 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topBarangays}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                    <Bar dataKey="value" fill="#0f766e" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Motion.section>

          {/* TB Surveillance Section */}
          <Motion.section
            className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.12 }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                    </svg>
                    TB SURVEILLANCE
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {tbSummary.total} total case{tbSummary.total !== 1 ? 's' : ''}
                  </span>
                </div>
                <h3 className="m-0 mt-2 text-base font-bold text-slate-900 sm:text-lg">Tuberculosis Case Breakdown</h3>
                <p className="mt-1 text-sm text-slate-600">All TB records from Pila — by classification, diagnosis outcome, and barangay distribution.</p>
              </div>
              <Link className="secondary-btn mt-0! bg-amber-600 hover:bg-amber-500" to="/dashboard/heat-map">
                View on Map
              </Link>
            </div>

            {tbSummary.total === 0 ? (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 p-5">
                <p className="text-sm font-semibold text-slate-900">No TB records found.</p>
                <p className="mt-1 text-sm text-slate-600">TB cases will appear here once records are added via Patient Records → TB Treatment Services.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">30-Day Case Trend</p>
                  <div className="mt-3 h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={tbSummary.trend}>
                        <defs>
                          <linearGradient id="grad-tb" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#d97706" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#d97706" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="key" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={6} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                        <Area type="monotone" dataKey="value" stroke="#d97706" strokeWidth={2} fill="url(#grad-tb)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Diagnosis Outcome</p>
                    <div className="space-y-2">
                      {tbSummary.diagnosisList.length === 0 ? (
                        <p className="text-sm text-slate-500">No diagnosis data.</p>
                      ) : tbSummary.diagnosisList.map((row) => {
                        const pct = tbSummary.total > 0 ? Math.round((row.value / tbSummary.total) * 100) : 0
                        const isDisease = row.label.toLowerCase().includes('disease')
                        const barColor = isDisease ? 'bg-rose-500' : 'bg-amber-400'
                        const textColor = isDisease ? 'text-rose-700' : 'text-amber-700'
                        return (
                          <div key={row.label}>
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm font-semibold ${textColor}`}>{row.label}</p>
                              <span className="text-xs font-bold text-slate-700">{row.value} <span className="font-normal text-slate-500">({pct}%)</span></span>
                            </div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Registration Group</p>
                    <div className="space-y-2">
                      {tbSummary.classificationList.length === 0 ? (
                        <p className="text-sm text-slate-500">No classification data.</p>
                      ) : tbSummary.classificationList.map((row, idx) => {
                        const pct = tbSummary.total > 0 ? Math.round((row.value / tbSummary.total) * 100) : 0
                        const colors = ['bg-teal-500', 'bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-400', 'bg-rose-400']
                        return (
                          <div key={row.label}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-slate-700">{row.label}</p>
                              <span className="text-xs font-bold text-slate-700">{row.value} <span className="font-normal text-slate-500">({pct}%)</span></span>
                            </div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                              <div className={`h-full rounded-full ${colors[idx % colors.length]}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cases by Barangay</p>
                    <Link className="text-xs font-semibold text-amber-700 hover:text-amber-600" to="/dashboard/heat-map">
                      View Heatmap →
                    </Link>
                  </div>
                  <div className="mt-3 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tbSummary.barangayList} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={120} />
                        <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                        <Bar dataKey="value" fill="#d97706" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </Motion.section>
        </div>

        <div className="space-y-4 sm:space-y-5 lg:col-span-5">
          <Motion.section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.06 }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="m-0 text-base font-bold text-slate-900 sm:text-lg">Realtime Queue Monitor</h3>
                <p className="mt-1 text-sm text-slate-600">Live queue feed with priority and waiting time.</p>
              </div>
              <Link className="secondary-btn !mt-0" to="/dashboard/queue">
                Manage
              </Link>
            </div>

            {activeQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">No active queue entries.</p>
                <p className="mt-1 text-sm text-slate-600">Queue submissions from the mobile app will appear here in real time.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeQueue.map((item, idx) => {
                  const createdAt = item.created_at ? new Date(item.created_at) : null
                  const waitingMins = createdAt && !Number.isNaN(createdAt.getTime()) ? (now.getTime() - createdAt.getTime()) / 60000 : 0
                  const priority = computePriority({ reason: item.reason, patientName: item.patient_name })
                  const est = formatMinutes(Math.max(0, (idx + 1) * 12))
                  const isNext = idx === 0

                  return (
                    <Motion.article
                      key={item.id}
                      className={`rounded-2xl border bg-slate-50 p-4 ${isNext ? 'border-teal-200 shadow-sm' : 'border-slate-200'}`}
                      animate={isNext ? { boxShadow: ['0 0 0 rgba(20,184,166,0.0)', '0 0 0.8rem rgba(20,184,166,0.18)', '0 0 0 rgba(20,184,166,0.0)'] } : {}}
                      transition={isNext ? { duration: 2.1, repeat: Infinity, ease: 'easeInOut' } : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {item.queue_number ? `#${item.queue_number}` : 'Queue'} · Waiting {formatMinutes(waitingMins)}
                          </p>
                          <p className="mt-1 truncate text-base font-bold text-slate-900">{normalizeLabel(item.patient_name, 'Patient')}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{normalizeLabel(item.reason, 'No reason provided')}</p>
                          <p className="mt-1 text-xs text-slate-500">Estimated: {est}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <PriorityPill priority={priority} />
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
                            {(item.status ?? 'waiting').toString().replaceAll('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </Motion.article>
                  )
                })}
              </div>
            )}
          </Motion.section>

          <Motion.section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.1 }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="m-0 text-base font-bold text-slate-900 sm:text-lg">Heatmap Summary</h3>
                <p className="mt-1 text-sm text-slate-600">Hotspot summary and quick access to RHU outbreak intelligence.</p>
              </div>
              <Link className="secondary-btn mt-0! bg-sky-600 hover:bg-sky-500" to="/dashboard/heat-map">
                Open Heatmap
              </Link>
            </div>

            <MiniOutbreakCanvas points={heatmapPoints} onOpen={() => navigate('/dashboard/heat-map')} />

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Hotspots</p>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                  {outbreakSummary.hotspots.length}
                </span>
              </div>
              <div className="mt-2 space-y-2">
                {outbreakSummary.hotspots.length === 0 ? (
                  <p className="text-sm text-slate-600">No hotspot signals yet. Records with coordinates will surface here.</p>
                ) : (
                  outbreakSummary.hotspots.slice(0, 3).map((row) => (
                    <div key={`${row.dx}-${row.brgy}`} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{row.brgy}</p>
                        <p className="truncate text-xs text-slate-600">{row.dx}</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                        {row.current} ({row.change >= 0 ? `+${row.change}` : row.change}%)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Motion.section>

          <Motion.section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.14 }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="m-0 text-base font-bold text-slate-900 sm:text-lg">Critical Health Alerts</h3>
                <p className="mt-1 text-sm text-slate-600">Outbreak signals, critical vitals, and operational issues.</p>
              </div>
              <button
                type="button"
                className="secondary-btn mt-0! bg-slate-900 hover:bg-slate-800"
                onClick={() => void loadDashboard()}
              >
                Refresh
              </button>
            </div>

            {dashboardAlerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">No active alerts.</p>
                <p className="mt-1 text-sm text-slate-600">The system will surface outbreak spikes, long waits, and critical vitals here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardAlerts.map((a) => {
                  const meta = severityMeta(a.severity)
                  const pulse = a.severity === 'red'
                  return (
                    <Motion.article
                      key={a.id}
                      className={`rounded-2xl border p-4 ${meta.classes}`}
                      animate={pulse ? { scale: [1, 1.01, 1] } : undefined}
                      transition={pulse ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">{a.title}</p>
                          <p className="mt-1 text-sm opacity-90">{a.message}</p>
                        </div>
                        <span className="rounded-full border border-current/20 bg-white/60 px-2 py-1 text-[11px] font-semibold">
                          {meta.label}
                        </span>
                      </div>
                    </Motion.article>
                  )
                })}
              </div>
            )}
          </Motion.section>

          <Motion.section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.18 }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="m-0 text-base font-bold text-slate-900 sm:text-lg">AI Clinical Insights</h3>
                <p className="mt-1 text-sm text-slate-600">Proactive, clinically useful signals from live data patterns.</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                <Icon name="spark" className="h-4 w-4" />
                Intelligence
              </span>
            </div>

            <div className="space-y-3">
              {aiInsights.map((ins) => (
                <article key={ins.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-900">{ins.title}</p>
                  <p className="mt-1 text-sm text-slate-700">{ins.message}</p>
                </article>
              ))}
            </div>
          </Motion.section>

          <Motion.section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.22 }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="m-0 text-base font-bold text-slate-900 sm:text-lg">Recent Activity</h3>
                <p className="mt-1 text-sm text-slate-600">Realtime feed from queue, appointments, and consultations.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                Live
              </span>
            </div>

            {activity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">No activity yet.</p>
                <p className="mt-1 text-sm text-slate-600">New check-ins, appointments, and records will stream here automatically.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activity.map((evt) => (
                  <div key={evt.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{evt.label}</p>
                      <p className="mt-0.5 truncate text-sm text-slate-600">{evt.detail}</p>
                    </div>
                    <p className="whitespace-nowrap text-xs font-semibold text-slate-500">
                      {evt.at ? formatTime(evt.at.toISOString()) : '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Motion.section>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-40">
        <AnimatePresence>
          {quickOpen ? (
            <Motion.div
              key="qa-panel"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="w-[min(360px,calc(100vw-3rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-2xl shadow-slate-900/20 backdrop-blur-xl"
            >
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-900">Quick Actions</p>
                  <button
                    type="button"
                    onClick={() => setQuickOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-600">Keyboard: Shift+N, Shift+Q, Shift+A, Shift+H</p>
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/doctor-consult')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-white"
                >
                  <p className="text-sm font-bold text-slate-900">Doctor Consult</p>
                  <p className="mt-1 text-xs text-slate-600">Review forms and add diagnosis</p>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/queue')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-white"
                >
                  <p className="text-sm font-bold text-slate-900">Open Queue</p>
                  <p className="mt-1 text-xs text-slate-600">Triage and manage waiting</p>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/patient-records')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-white"
                >
                  <p className="text-sm font-bold text-slate-900">All Patient Records</p>
                  <p className="mt-1 text-xs text-slate-600">View and manage all encoded records</p>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/heat-map')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-white"
                >
                  <p className="text-sm font-bold text-slate-900">View Heatmap</p>
                  <p className="mt-1 text-xs text-slate-600">Outbreak intelligence</p>
                </button>
              </div>
            </Motion.div>
          ) : null}
        </AnimatePresence>

        <Motion.button
          type="button"
          onClick={() => setQuickOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-700/20 hover:bg-teal-500"
          whileTap={{ scale: 0.98 }}
        >
          <Icon name="spark" className="h-5 w-5" />
          Quick Actions
        </Motion.button>
      </div>
    </section>
  )
}
