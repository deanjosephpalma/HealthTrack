import { mean } from 'd3'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import CommandCenterMap from '../../components/gis/CommandCenterMap'
import pilaGeojson from '../../data/pila.geojson'
import pilaBarangaysGeojson from '../../data/pila-barangays.geojson'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabaseClient'
import { generateCommandCenterInsights } from '../../lib/ai'
import {
  buildBarangayCentersFromGeoJson,
  buildBarangayFeatureIndex,
  completePilaBarangayGeoJson,
  expandCasesToHeatSamples,
  normalizeBarangayName,
  PILA_BARANGAYS,
} from '../../lib/gis/barangayHeat'
import { isHeatMapClinicalRecord } from '../../lib/heatmapClinicalFilter'

const DEFAULT_CENTER = [14.2338, 121.3644]
const REFRESH_MS = 30000
const PILA_BOUNDS = [
  [14.1946802, 121.3243388],
  [14.2938285, 121.388095],
]

const INTENSITY_STEPS = [
  { max: 2, color: '#10B981', label: 'LOW', level: 'low' },
  { max: 6, color: '#F59E0B', label: 'MODERATE', level: 'moderate' },
  { max: 12, color: '#F97316', label: 'HIGH', level: 'high' },
  { max: Infinity, color: '#EF4444', label: 'CRITICAL', level: 'critical' },
]

function normalizeText(value) {
  return (value ?? '').toString().trim().toLowerCase()
}

function getIntensity(count) {
  return INTENSITY_STEPS.find((step) => count <= step.max) ?? INTENSITY_STEPS.at(-1)
}

function formatLastUpdated(date) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function toIsoDate(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function startOfWeekIso(dateValue) {
  const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  return toIsoDate(date)
}

function startOfMonthIso(dateValue) {
  const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(1)
  return toIsoDate(date)
}

function startOfYearIso(dateValue) {
  const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  date.setMonth(0, 1)
  return toIsoDate(date)
}

function getBucketKey(granularity, dateValue) {
  if (!dateValue) return ''
  if (granularity === 'Weekly') return startOfWeekIso(dateValue)
  if (granularity === 'Monthly') return startOfMonthIso(dateValue)
  if (granularity === 'Yearly') return startOfYearIso(dateValue)
  return toIsoDate(dateValue)
}

function parseIsoDateOrNull(value) {
  const text = (value ?? '').toString().trim()
  if (!text) return null
  const date = new Date(`${text}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function extractLatLngPairs(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates.flat(1)
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2)
  return []
}

function filterGeoJsonToBounds(geoJson, bounds) {
  const features = geoJson?.features ?? []
  const [[minLat, minLng], [maxLat, maxLng]] = bounds
  const filtered = features.filter((feature) => {
    const pairs = extractLatLngPairs(feature?.geometry)
    for (const pair of pairs) {
      const lng = Number(pair?.[0])
      const lat = Number(pair?.[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) return true
    }
    return false
  })
  return { type: 'FeatureCollection', features: filtered }
}

function getBoundsFromGeoJson(geoJson) {
  const features = geoJson?.features ?? []
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  for (const feature of features) {
    const pairs = extractLatLngPairs(feature?.geometry)
    for (const pair of pairs) {
      const lng = Number(pair?.[0])
      const lat = Number(pair?.[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (lat < minLat) minLat = lat
      if (lng < minLng) minLng = lng
      if (lat > maxLat) maxLat = lat
      if (lng > maxLng) maxLng = lng
    }
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLat) || !Number.isFinite(maxLng)) return null
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

function MiniMap({ boundaryBounds, viewport }) {
  const size = { w: 190, h: 130 }
  const bounds = boundaryBounds ?? PILA_BOUNDS
  const [[minLat, minLng], [maxLat, maxLng]] = bounds

  const project = (lng, lat) => {
    const x = ((lng - minLng) / (maxLng - minLng + 1e-9)) * size.w
    const y = (1 - (lat - minLat) / (maxLat - minLat + 1e-9)) * size.h
    return { x, y }
  }

  let rect = null
  if (viewport?.sw && viewport?.ne) {
    const sw = project(viewport.sw.lng, viewport.sw.lat)
    const ne = project(viewport.ne.lng, viewport.ne.lat)
    const x = Math.min(sw.x, ne.x)
    const y = Math.min(sw.y, ne.y)
    const w = Math.abs(ne.x - sw.x)
    const h = Math.abs(ne.y - sw.y)
    rect = { x, y, w, h }
  }

  return (
    <div className="cc-glass overflow-hidden">
      <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
        <defs>
          <linearGradient id="ccMini" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(45,212,191,0.65)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.40)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={size.w} height={size.h} rx="18" fill="rgba(2, 6, 23, 0.55)" />
        <rect x="10" y="10" width={size.w - 20} height={size.h - 20} rx="14" fill="rgba(15, 23, 42, 0.45)" stroke="rgba(226,232,240,0.10)" />
        {rect ? (
          <rect
            x={10 + rect.x * ((size.w - 20) / size.w)}
            y={10 + rect.y * ((size.h - 20) / size.h)}
            width={rect.w * ((size.w - 20) / size.w)}
            height={rect.h * ((size.h - 20) / size.h)}
            rx="10"
            fill="rgba(45,212,191,0.08)"
            stroke="url(#ccMini)"
            strokeWidth="2"
          />
        ) : null}
      </svg>
    </div>
  )
}

function riskFromSignals({ weeklyDelta, criticalZones, topHotspotCount }) {
  const score = Math.max(0, weeklyDelta) * 10 + criticalZones * 25 + Math.max(0, topHotspotCount - 8) * 8
  if (score >= 70) return { level: 'CRITICAL', tone: 'cc-danger-dot' }
  if (score >= 45) return { level: 'HIGH', tone: 'cc-danger-dot' }
  if (score >= 22) return { level: 'MODERATE', tone: 'cc-live-dot' }
  return { level: 'LOW', tone: 'cc-live-dot' }
}

export default function HeatMapCommandCenterPage() {
  const { profile, role } = useAuth()

  const containerRef = useRef(null)
  const mapInstanceRef = useRef(null)

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const [selectedDisease, setSelectedDisease] = useState('all')
  const [selectedBarangay, setSelectedBarangay] = useState('all')
  const [selectedTBClassification, setSelectedTBClassification] = useState('all')
  const [showBoundaries, setShowBoundaries] = useState(true)
  const [mapMode, setMapMode] = useState('map')
  const [densityMode, setDensityMode] = useState('heat')
  const [overlayMode, setOverlayMode] = useState('none')
  const [realtimeEnabled, setRealtimeEnabled] = useState(true)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)

  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [granularity, setGranularity] = useState('Weekly')
  const [bucketIndex, setBucketIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  const [viewport, setViewport] = useState(null)
  const [selectedHotspotKey, setSelectedHotspotKey] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // AI State
  const [aiInsights, setAiInsights] = useState([])
  const [generatingInsights, setGeneratingInsights] = useState(false)

  // Estimated Cases State
  const [, setEstimatedRecords] = useState([])
  const [showMore, setShowMore] = useState(false)

  const boundaryGeoJson = useMemo(() => {
    const src = pilaGeojson && typeof pilaGeojson === 'object' ? pilaGeojson : null
    return src ? filterGeoJsonToBounds(src, PILA_BOUNDS) : null
  }, [])

  const barangayGeoJson = useMemo(() => {
    const src = pilaBarangaysGeojson && typeof pilaBarangaysGeojson === 'object' ? pilaBarangaysGeojson : null
    const filtered = src ? filterGeoJsonToBounds(src, PILA_BOUNDS) : { type: 'FeatureCollection', features: [] }
    return completePilaBarangayGeoJson(filtered)
  }, [])

  // (normalizeBarangayName imported from barangayHeat)

  const boundaryBounds = useMemo(() => getBoundsFromGeoJson(boundaryGeoJson) ?? PILA_BOUNDS, [boundaryGeoJson])

  const barangayFeatureIndex = useMemo(() => buildBarangayFeatureIndex(barangayGeoJson), [barangayGeoJson])

  const barangayCenters = useMemo(() => {
    const fallback = Object.fromEntries(
      PILA_BARANGAYS.map((b) => [normalizeBarangayName(b.name), { lat: b.lat, lng: b.lng }]),
    )
    // Polygon centroids first so heat/centers match drawn barangay shapes
    return buildBarangayCentersFromGeoJson(barangayGeoJson, fallback)
  }, [barangayGeoJson])

  const resolveResidenceCoords = useCallback(
    (row) => {
      const barangay = (row.barangay ?? '').toString().trim() || 'Unknown'
      const brgyNormalized = normalizeBarangayName(barangay)
      const center = barangayCenters[brgyNormalized]
      const lat = Number(row.latitude)
      const lng = Number(row.longitude)
      const hasValidCoords =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        !(lat === 0 && lng === 0) &&
        !(lat === DEFAULT_CENTER[0] && lng === DEFAULT_CENTER[1])

      if (!hasValidCoords && !center) return null

      const [[minLat, minLng], [maxLat, maxLng]] = PILA_BOUNDS
      const baseLat = hasValidCoords ? lat : center.lat
      const baseLng = hasValidCoords ? lng : center.lng
      return {
        barangay,
        brgyNormalized,
        lat: Math.min(maxLat, Math.max(minLat, baseLat)),
        lng: Math.min(maxLng, Math.max(minLng, baseLng)),
        hasValidCoords,
      }
    },
    [barangayCenters],
  )

  const fetchHeatMapData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const next = []

      // 1) Doctor consults with ICD-10 diagnosis (residence barangay in Pila)
      let patientQuery = supabase
        .from('patient_records')
        .select(
          'id, barangay, municipality, province, diagnosis, notes, latitude, longitude, date_of_consultation, created_at, nurse_completed_at, doctor_completed_at, medcert_pwd, medcert_work, medcert_financial, medcert_4ps, medcert_school, medcert_others',
        )
        .or('municipality.ilike.Pila,municipality.is.null')
        .not('barangay', 'is', null)
        .not('doctor_completed_at', 'is', null)
        .not('diagnosis', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000)

      if (selectedDisease && selectedDisease !== 'all') {
        patientQuery = patientQuery.ilike('diagnosis', `%${selectedDisease}%`)
      }
      if (selectedBarangay && selectedBarangay !== 'all') {
        patientQuery = patientQuery.ilike('barangay', `%${selectedBarangay}%`)
      }

      const { data: patientData, error: patientError } = await patientQuery
      if (patientError) {
        console.warn('[heatmap] patient_records:', patientError.message)
      } else {
        for (const row of patientData ?? []) {
          if (!isHeatMapClinicalRecord(row)) continue
          const diseaseRaw = (row.diagnosis ?? '').toString().trim()
          if (!diseaseRaw) continue
          const municipality = (row.municipality ?? 'Pila').toString().trim()
          if (municipality && !/pila/i.test(municipality) && municipality.toLowerCase() !== 'n/a') continue

          const coords = resolveResidenceCoords(row)
          if (!coords) continue

          const dateValue = row.date_of_consultation ?? row.created_at ?? null
          next.push({
            id: `pr-${row.id}`,
            barangay: coords.barangay,
            disease: diseaseRaw,
            tbClassification: null,
            lat: coords.lat,
            lng: coords.lng,
            date: dateValue ? new Date(dateValue) : null,
            createdAt: row.created_at ? new Date(row.created_at) : null,
            isEstimated: false,
            count: 1,
            source: 'patient_records',
          })
        }
      }

      // 2) TB doctor consults (ICD / classification) — still require doctor completion
      let query = supabase
        .from('patient_records')
        .select(
          'id, barangay, municipality, province, diagnosis, notes, tb_classification, latitude, longitude, date_of_consultation, created_at, nurse_completed_at, doctor_completed_at, medcert_pwd, medcert_work, medcert_financial, medcert_4ps, medcert_school, medcert_others',
        )
        .or('municipality.ilike.Pila,municipality.is.null')
        .not('barangay', 'is', null)
        .not('doctor_completed_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000)

      if (selectedBarangay && selectedBarangay !== 'all') {
        query = query.ilike('barangay', `%${selectedBarangay}%`)
      }

      const { data, error: queryError } = await query
      if (queryError) {
        console.warn('[heatmap] tb patient_records:', queryError.message)
      } else {
        for (const row of data ?? []) {
          if (!isHeatMapClinicalRecord(row)) continue
          const diseaseRaw = (row.diagnosis ?? '').toString().trim()
          const notes = (row.notes ?? '').toString()
          const isTb =
            Boolean(row.tb_classification) ||
            notes.includes('[TB Treatment Record]') ||
            /tuberculosis|\btb\b/i.test(diseaseRaw)
          if (!isTb) continue
          if (
            selectedDisease &&
            selectedDisease !== 'all' &&
            !selectedDisease.toLowerCase().includes('tuberculosis') &&
            !selectedDisease.toLowerCase().includes('tb') &&
            !diseaseRaw.toLowerCase().includes(selectedDisease.toLowerCase()) &&
            !notes.toLowerCase().includes(selectedDisease.toLowerCase())
          ) {
            continue
          }

          const coords = resolveResidenceCoords(row)
          if (!coords) continue

          // Skip if already added from primary diagnosis heat points as Tuberculosis
          if (next.some((p) => p.id === `pr-${row.id}` && p.disease === 'Tuberculosis')) continue

          const dateValue = row.date_of_consultation ?? row.created_at ?? null
          next.push({
            id: `tb-${row.id}`,
            barangay: coords.barangay,
            disease: 'Tuberculosis',
            tbClassification: (row.tb_classification ?? '').toString().trim() || 'Unclassified',
            lat: coords.lat,
            lng: coords.lng,
            date: dateValue ? new Date(dateValue) : null,
            createdAt: row.created_at ? new Date(row.created_at) : null,
            isEstimated: false,
            count: 1,
            source: 'patient_records_tb',
          })
        }
      }

      // 3) Reported Cases (BHW / surveillance clusters) — separate from doctor ICD-10 consults
      let estQuery = supabase
        .from('estimated_cases')
        .select(
          'id, disease, barangay, estimated_count, status, latitude, longitude, report_date, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(2000)
      if (selectedDisease && selectedDisease !== 'all') estQuery = estQuery.ilike('disease', `%${selectedDisease}%`)
      if (selectedBarangay && selectedBarangay !== 'all') estQuery = estQuery.ilike('barangay', `%${selectedBarangay}%`)

      const { data: estData, error: estError } = await estQuery
      if (estError) {
        console.warn('[heatmap] estimated_cases:', estError.message)
        setError((prev) => prev || `Reported cases unavailable: ${estError.message}`)
      } else if (estData) {
        const estNext = []
        for (const row of estData) {
          const diseaseRaw = (row.disease ?? '').toString().trim()
          if (!diseaseRaw) continue
          const coords = resolveResidenceCoords(row)
          if (!coords) continue

          const dateValue = row.report_date ?? row.created_at ?? null
          const item = {
            id: `est-${row.id}`,
            barangay: coords.barangay,
            disease: diseaseRaw,
            lat: coords.lat,
            lng: coords.lng,
            date: dateValue ? new Date(dateValue) : null,
            createdAt: row.created_at ? new Date(row.created_at) : null,
            isEstimated: true,
            status: row.status,
            count: Number(row.estimated_count) || 1,
            source: 'estimated_cases',
          }
          estNext.push(item)
          next.push(item)
        }
        setEstimatedRecords(estNext)
      }

      setRecords(next)
      setLastUpdated(new Date())
      setSelectedHotspotKey('')
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load outbreak data.')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [resolveResidenceCoords, selectedBarangay, selectedDisease])

  useEffect(() => {
    fetchHeatMapData()
  }, [fetchHeatMapData])

  useEffect(() => {
    if (!realtimeEnabled) return undefined
    const channel1 = supabase
      .channel('healthtrack_cc_patient_records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_records' }, () => fetchHeatMapData())
    const channel2 = supabase
      .channel('healthtrack_cc_estimated_cases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimated_cases' }, () => fetchHeatMapData())
    channel1.subscribe()
    channel2.subscribe()
    return () => {
      try {
        supabase.removeChannel(channel1)
        supabase.removeChannel(channel2)
      } catch (_err) {
        void _err
      }
    }
  }, [fetchHeatMapData, realtimeEnabled])

  useEffect(() => {
    if (!autoRefreshEnabled) return undefined
    const id = window.setInterval(fetchHeatMapData, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [autoRefreshEnabled, fetchHeatMapData])

  const diseaseOptions = useMemo(() => {
    const unique = new Set(records.map((r) => r.disease).filter(Boolean))
    return ['all', ...Array.from(unique).sort((a, b) => a.localeCompare(b))]
  }, [records])

  const barangayOptions = useMemo(() => {
    const fromRecords = records.map((r) => r.barangay).filter(Boolean)
    const official = PILA_BARANGAYS.map((b) => b.name)
    return ['all', ...new Set([...official, ...fromRecords])].sort((a, b) => {
      if (a === 'all') return -1
      if (b === 'all') return 1
      return a.localeCompare(b)
    })
  }, [records])

  const tbClassificationOptions = useMemo(() => {
    const unique = new Set(records.map((r) => r.tbClassification).filter(Boolean))
    return ['all', ...Array.from(unique).sort((a, b) => a.localeCompare(b))]
  }, [records])

  const availableDateRange = useMemo(() => {
    let min = null
    let max = null
    for (const item of records) {
      const date = item?.date instanceof Date ? item.date : null
      if (!date || Number.isNaN(date.getTime())) continue
      if (!min || date < min) min = date
      if (!max || date > max) max = date
    }
    return { min, max, minIso: min ? toIsoDate(min) : '', maxIso: max ? toIsoDate(max) : '' }
  }, [records])

  // Apply period presets
  const applyPeriod = useCallback((period) => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const today = `${y}-${m}-${d}`
    setSelectedPeriod(period)
    if (period === 'today') {
      setRangeStart(today)
      setRangeEnd(today)
    } else if (period === 'this_month') {
      setRangeStart(`${y}-${m}-01`)
      setRangeEnd(today)
    } else if (period === 'this_year') {
      setRangeStart(`${y}-01-01`)
      setRangeEnd(today)
    } else if (period === 'last_year') {
      setRangeStart(`${y - 1}-01-01`)
      setRangeEnd(`${y - 1}-12-31`)
    } else {
      // all
      setRangeStart('')
      setRangeEnd('')
    }
  }, [])

  useEffect(() => {
    if (!availableDateRange.minIso || !availableDateRange.maxIso) return
    // Only auto-set range if user hasn't picked a period
    if (selectedPeriod === 'all') {
      setRangeStart('')
      setRangeEnd('')
    }
  }, [availableDateRange.maxIso, availableDateRange.minIso, selectedPeriod])

  useEffect(() => {
    const start = parseIsoDateOrNull(rangeStart)
    const end = parseIsoDateOrNull(rangeEnd)
    if (!start || !end) return
    if (end.getTime() < start.getTime()) setRangeEnd(rangeStart)
  }, [rangeEnd, rangeStart])

  const filteredRecords = useMemo(() => {
    const start = parseIsoDateOrNull(rangeStart)
    const end = parseIsoDateOrNull(rangeEnd)
    if (!start && !end) return records
    const startTime = start ? start.getTime() : -Infinity
    const endTime = end ? end.getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity
    return records.filter((item) => {
      const date = item?.date instanceof Date ? item.date : null
      if (!date || Number.isNaN(date.getTime())) return true
      const time = date.getTime()
      return time >= startTime && time <= endTime
    })
  }, [records, rangeEnd, rangeStart])

  const bucketKeys = useMemo(() => {
    const keys = new Set()
    for (const item of filteredRecords) {
      const key = getBucketKey(granularity, item.date ?? null)
      if (key) keys.add(key)
    }
    return Array.from(keys).sort()
  }, [filteredRecords, granularity])

  useEffect(() => {
    if (bucketKeys.length === 0) {
      setBucketIndex(0)
      return
    }
    setBucketIndex((prev) => {
      if (prev >= 0 && prev < bucketKeys.length) return prev
      return bucketKeys.length - 1
    })
  }, [bucketKeys.length])

  useEffect(() => {
    if (!isPlaying) return undefined
    if (bucketKeys.length <= 1) return undefined
    const intervalMs = Math.max(260, Math.round(900 / Math.max(0.25, speed)))
    const id = window.setInterval(() => setBucketIndex((prev) => (prev + 1) % bucketKeys.length), intervalMs)
    return () => window.clearInterval(id)
  }, [bucketKeys.length, isPlaying, speed])

  const activeBucketKey = bucketKeys.length ? bucketKeys[Math.min(bucketKeys.length - 1, Math.max(0, bucketIndex))] : ''

  const bucketRecords = useMemo(() => {
    if (!activeBucketKey) return []
    return filteredRecords.filter((item) => getBucketKey(granularity, item.date ?? null) === activeBucketKey)
  }, [activeBucketKey, filteredRecords, granularity])

  /** Heat/map uses full date-range data unless timeline playback is running. */
  const mapRecords = useMemo(() => {
    const source = isPlaying ? bucketRecords : filteredRecords
    return source.filter((item) => {
      if (!selectedTBClassification || selectedTBClassification === 'all') return true
      // Reported clusters have no TB clinical classification — keep them visible
      if (item.isEstimated) return true
      return item.tbClassification === selectedTBClassification
    })
  }, [bucketRecords, filteredRecords, isPlaying, selectedTBClassification])

  const clusters = useMemo(() => {
    const map = new Map()
    for (const item of mapRecords) {
      const gridLat = Math.round(item.lat * 2200) / 2200
      const gridLng = Math.round(item.lng * 2200) / 2200
      const key = `${gridLat.toFixed(5)}|${gridLng.toFixed(5)}`
      const existing = map.get(key)
      const count = item.isEstimated ? item.count : 1
      if (existing) {
        existing.count += count
        existing.diseases.add(item.disease)
        existing.barangays.add(item.barangay)
        existing.classifications.add(item.tbClassification)
      } else {
        map.set(key, {
          key,
          lat: gridLat,
          lng: gridLng,
          count,
          diseases: new Set([item.disease]),
          barangays: new Set([item.barangay]),
          classifications: new Set([item.tbClassification]),
        })
      }
    }
    return Array.from(map.values())
      .map((v) => ({
        ...v,
        diseases: Array.from(v.diseases),
        barangays: Array.from(v.barangays),
        classifications: Array.from(v.classifications),
      }))
      .sort((a, b) => b.count - a.count)
  }, [mapRecords])

  const topHotspots = clusters.slice(0, 10)
  const totalCases = mapRecords.reduce((sum, r) => sum + (r.isEstimated ? r.count : 1), 0)
  const reportedCaseCount = mapRecords.reduce((sum, r) => sum + (r.isEstimated ? r.count : 0), 0)
  const clinicalCaseCount = mapRecords.reduce((sum, r) => sum + (r.isEstimated ? 0 : 1), 0)
  const hotspotsCount = clusters.length
  const activeBarangays = new Set(mapRecords.map((r) => r.barangay).filter(Boolean)).size
  const criticalZones = clusters.filter((c) => c.count >= 10).length

  const barangayCounts = useMemo(() => {
    const out = {}
    for (const item of mapRecords) {
      const key = normalizeBarangayName(item?.barangay)
      if (!key) continue
      out[key] = (out[key] ?? 0) + (item.isEstimated ? item.count : 1)
    }
    return out
  }, [mapRecords])

  /** Per-barangay disease breakdown for map hover tooltips */
  const barangayHoverStats = useMemo(() => {
    const map = new Map()
    for (const item of mapRecords) {
      const key = normalizeBarangayName(item?.barangay)
      if (!key) continue
      const label = (item.barangay ?? '').toString().trim() || key
      const disease = (item.disease ?? '').toString().trim() || 'Unspecified'
      const n = item.isEstimated ? Number(item.count) || 1 : 1
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          total: 0,
          clinical: 0,
          estimated: 0,
          diseases: new Map(),
        })
      }
      const row = map.get(key)
      row.total += n
      if (item.isEstimated) row.estimated += n
      else row.clinical += n
      row.diseases.set(disease, (row.diseases.get(disease) ?? 0) + n)
      if (label && label.length >= row.label.length) row.label = label
    }
    const out = {}
    for (const [key, row] of map.entries()) {
      out[key] = {
        key,
        label: row.label,
        total: row.total,
        clinical: row.clinical,
        estimated: row.estimated,
        diseases: Array.from(row.diseases.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      }
    }
    return out
  }, [mapRecords])

  const trendData = useMemo(() => {
    const counts = new Map()
    for (const item of filteredRecords) {
      const key = getBucketKey(granularity, item.date ?? null)
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + (item.isEstimated ? item.count : 1))
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, cases]) => ({ bucket, cases }))
  }, [filteredRecords, granularity])

  const weeklyDelta = useMemo(() => {
    if (bucketKeys.length < 2) return 0
    const prevKey = bucketKeys[Math.max(0, bucketIndex - 1)]
    const prev = trendData.find((d) => d.bucket === prevKey)?.cases ?? 0
    return totalCases - prev
  }, [bucketIndex, bucketKeys, totalCases, trendData])

  const forecast = useMemo(() => {
    const values = trendData.map((d) => d.cases).filter((v) => Number.isFinite(v))
    const recent = values.slice(-6)
    const base = recent.length ? mean(recent) : 0
    const last = values.at(-1) ?? 0
    return Math.round(Math.max(0, last + (last - base) * 0.65))
  }, [trendData])

  const diseaseBreakdown = useMemo(() => {
    const counts = new Map()
    for (const item of mapRecords) {
      const name = (item.disease ?? '').toString().trim()
      if (!name) continue
      const count = item.isEstimated ? item.count : 1
      counts.set(name, (counts.get(name) ?? 0) + count)
    }
    const sorted = Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
    const top = sorted.slice(0, 5)
    const restTotal = sorted.slice(5).reduce((sum, item) => sum + item.value, 0)
    return restTotal > 0 ? [...top, { name: 'Others', value: restTotal }] : top
  }, [mapRecords])

  const mapPoints = useMemo(() => {
    if (densityMode === 'points') {
      return mapRecords.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        disease: r.disease,
        barangay: r.barangay,
        tbClassification: r.tbClassification,
        cases: r.isEstimated ? r.count : 1,
        weight: r.isEstimated ? r.count : 1,
        isEstimated: !!r.isEstimated,
        ts: r.createdAt?.toISOString?.() ?? null,
      }))
    }
    // Density heat: spread samples across each patient's barangay polygon in Pila
    return expandCasesToHeatSamples(mapRecords, {
      featureIndex: barangayFeatureIndex,
      centers: barangayCenters,
      maxSamplesPerCase: 18,
    })
  }, [barangayCenters, barangayFeatureIndex, densityMode, mapRecords])

  const mapHotspots = useMemo(() => {
    return topHotspots.map((h) => {
      const intensity = getIntensity(h.count)
      const label = `${h.barangays?.[0] ?? 'Pila'} · ${intensity.label}`
      return { key: h.key, lat: h.lat, lng: h.lng, count: h.count, label, level: intensity.level, raw: h }
    })
  }, [topHotspots])

  const selectedHotspot = useMemo(() => {
    if (!selectedHotspotKey) return null
    const hotspot = mapHotspots.find((h) => h.key === selectedHotspotKey) ?? null
    if (!hotspot) return null
    const intensity = getIntensity(hotspot.count)
    return {
      key: hotspot.key,
      label: hotspot.label,
      count: hotspot.count,
      intensity,
      barangays: hotspot.raw?.barangays ?? [],
      diseases: hotspot.raw?.diseases ?? [],
      classifications: hotspot.raw?.classifications ?? [],
      lat: hotspot.lat,
      lng: hotspot.lng,
    }
  }, [mapHotspots, selectedHotspotKey])

  const aiRisk = useMemo(() => riskFromSignals({ weeklyDelta, criticalZones, topHotspotCount: mapHotspots?.[0]?.count ?? 0 }), [criticalZones, mapHotspots, weeklyDelta])

  const handleGenerateInsights = async () => {
    setGeneratingInsights(true)
    try {
      const data = {
        totalCases,
        hotspotsCount,
        criticalZones,
        weeklyDelta,
        forecast,
        topHotspots: mapHotspots.slice(0, 3).map(h => ({
          barangay: h.raw.barangays[0],
          cases: h.count,
          diseases: h.raw.diseases
        }))
      }
      const insights = await generateCommandCenterInsights(data)
      setAiInsights(insights)
    } catch (err) {
      console.error(err)
      setAiInsights(['AI analysis failed.'])
    } finally {
      setGeneratingInsights(false)
    }
  }

  const alerts = useMemo(() => {
    const items = []
    if (aiRisk.level === 'CRITICAL' || aiRisk.level === 'HIGH') {
      items.push({ id: 'risk', tone: 'critical', title: `Risk level: ${aiRisk.level}`, message: 'Escalate field validation and triage resources in affected barangays.' })
    }
    if (weeklyDelta >= 3) {
      items.push({ id: 'delta', tone: 'warning', title: 'Acceleration detected', message: `+${weeklyDelta} cases vs previous window.` })
    }
    if (selectedHotspot?.label) {
      items.push({ id: 'focus', tone: 'info', title: 'Focused hotspot', message: `${selectedHotspot.label} • ${selectedHotspot.count} case(s).` })
    }
    return items.slice(0, 4)
  }, [aiRisk.level, selectedHotspot?.count, selectedHotspot?.label, weeklyDelta])

  const caseTicker = useMemo(() => {
    const list = [...records]
      .filter((r) => r.createdAt instanceof Date && !Number.isNaN(r.createdAt.getTime()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 14)
      .map((item) => ({
        id: item.id,
        t: item.createdAt ? new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' }).format(item.createdAt) : '—',
        disease: item.disease,
        barangay: item.barangay,
        tbClassification: item.tbClassification,
      }))
    return list
  }, [records])

  const handleHotspotSelect = useCallback((payload) => {
    if (!payload?.key) return
    setSelectedHotspotKey(payload.key)
  }, [])

  const handleToggleFullscreen = useCallback(async () => {
    const el = containerRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setIsFullscreen(false)
        return
      }
      await el.requestFullscreen()
      setIsFullscreen(true)
    } catch (_err) {
      void _err
    }
  }, [])

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleExport = useCallback(() => {
    const instance = mapInstanceRef.current
    const deckCanvas = instance?.deck?.canvas
    const mapCanvas = instance?.map?.getCanvas?.()
    const canvas = deckCanvas ?? mapCanvas
    if (!canvas?.toDataURL) return
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `rhu-heatmap-${Date.now()}.png`
    link.click()
  }, [])

  const handleMapReady = useCallback(({ map, deck }) => {
    mapInstanceRef.current = { map: map ?? null, deck: deck ?? null }
  }, [])

  const playbackLabel = activeBucketKey ? `${activeBucketKey} · ${granularity}` : `— · ${granularity}`
  const isLive = realtimeEnabled && !isPlaying

  return (
    <div ref={containerRef} className="relative h-screen min-h-0 w-full bg-[#f1f5f9] text-slate-800">
      <div className="absolute inset-0">
        <CommandCenterMap
          points={mapPoints}
          hotspots={mapHotspots}
          boundaryGeoJson={boundaryGeoJson}
          barangayGeoJson={barangayGeoJson}
          barangayCounts={barangayCounts}
          barangayHoverStats={barangayHoverStats}
          showBoundaries={showBoundaries}
          mapMode={mapMode}
          densityMode={densityMode}
          overlayMode={overlayMode}
          onHotspotSelect={handleHotspotSelect}
          onViewportChange={setViewport}
          selectedHotspotKey={selectedHotspotKey}
          onMapReady={handleMapReady}
        />
      </div>

      {/* Top bar — simple */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
        <div className="pointer-events-auto mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur">
          <div className="min-w-0">
            <p className="m-0 text-base font-bold text-slate-900 sm:text-lg">Disease Heat Map · Pila</p>
            <p className="m-0 mt-0.5 text-xs text-slate-500 sm:text-sm">
              Doctor ICD-10 consults + Reported Cases only. Red = more cases.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fetchHeatMapData}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Left summary card */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 w-[min(100%-1.5rem,20rem)] sm:bottom-4 sm:left-4">
        <div className="pointer-events-auto space-y-3 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-lg shadow-slate-900/10 backdrop-blur">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 px-2 py-2">
              <p className="m-0 text-[11px] font-medium text-slate-500">Total</p>
              <p className="m-0 text-xl font-bold text-slate-900">{totalCases}</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-2 py-2">
              <p className="m-0 text-[11px] font-medium text-amber-700">Reported</p>
              <p className="m-0 text-xl font-bold text-amber-800">{reportedCaseCount}</p>
            </div>
            <div className="rounded-xl bg-teal-50 px-2 py-2">
              <p className="m-0 text-[11px] font-medium text-teal-700">Clinic</p>
              <p className="m-0 text-xl font-bold text-teal-800">{clinicalCaseCount}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Color guide</p>
            <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
              <span className="h-3 flex-1 rounded-l-full bg-emerald-400" title="Few" />
              <span className="h-3 flex-1 bg-amber-400" />
              <span className="h-3 flex-1 bg-orange-500" />
              <span className="h-3 flex-1 rounded-r-full bg-rose-500" title="Many" />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>Few cases</span>
              <span>Many cases</span>
            </div>
          </div>

          <div>
            <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Most cases</p>
            <ul className="m-0 max-h-36 space-y-1.5 overflow-y-auto p-0">
              {clusters.slice(0, 5).map((c, i) => (
                <li key={c.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-700">
                    <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                    {c.barangays[0] || 'Unknown'}
                  </span>
                  <span className="shrink-0 font-bold text-slate-900">{c.count}</span>
                </li>
              ))}
              {clusters.length === 0 ? (
                <li className="list-none text-sm text-slate-500">No cases for this filter yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>

      {/* Right filters — only essentials */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-20 w-[min(100%-1.5rem,18.5rem)] sm:bottom-4 sm:right-4 sm:top-24 sm:bottom-auto">
        <div className="pointer-events-auto max-h-[calc(100vh-7rem)] space-y-3 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-lg shadow-slate-900/10 backdrop-blur">
          <p className="m-0 text-sm font-bold text-slate-900">Find cases</p>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Disease</span>
            <select
              value={selectedDisease}
              onChange={(e) => setSelectedDisease(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-teal-500"
            >
              {diseaseOptions.map((d) => (
                <option key={d} value={d}>
                  {d === 'all' ? 'All diseases' : d}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Barangay</span>
            <select
              value={selectedBarangay}
              onChange={(e) => setSelectedBarangay(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-teal-500"
            >
              {barangayOptions.map((b) => (
                <option key={b} value={b}>
                  {b === 'all' ? 'All barangays' : b}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">When</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'today', label: 'Today' },
                { key: 'this_month', label: 'This month' },
                { key: 'this_year', label: 'This year' },
                { key: 'all', label: 'All time' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPeriod(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    selectedPeriod === key
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {showMore ? 'Hide more options' : 'More options…'}
          </button>

          {showMore ? (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Map look</span>
                <select
                  value={mapMode}
                  onChange={(e) => setMapMode(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none"
                >
                  <option value="map">Simple map</option>
                  <option value="dark">Dark map</option>
                  <option value="satellite">Satellite</option>
                  <option value="intel">3D view</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Display</span>
                <select
                  value={densityMode}
                  onChange={(e) => setDensityMode(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none"
                >
                  <option value="heat">Colored barangays (recommended)</option>
                  <option value="points">Dots only</option>
                </select>
              </label>

              {tbClassificationOptions.length > 1 ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">TB type</span>
                  <select
                    value={selectedTBClassification}
                    onChange={(e) => setSelectedTBClassification(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none"
                  >
                    {tbClassificationOptions.map((c) => (
                      <option key={c} value={c}>
                        {c === 'all' ? 'All TB types' : c}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowBoundaries((p) => !p)}
                >
                  {showBoundaries ? 'Hide lines' : 'Show lines'}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={handleExport}
                >
                  Save picture
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={handleToggleFullscreen}
                >
                  {isFullscreen ? 'Exit full screen' : 'Full screen'}
                </button>
              </div>

              <button
                type="button"
                disabled={generatingInsights}
                onClick={handleGenerateInsights}
                className="w-full rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {generatingInsights ? 'Writing summary…' : 'Explain this map'}
              </button>
              {aiInsights.length > 0 ? (
                <ul className="m-0 space-y-2 p-0">
                  {aiInsights.map((text, idx) => (
                    <li key={idx} className="list-none rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                      {text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {loading ? (
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-0 top-28 z-30 flex justify-center"
          >
            <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow">
              Loading map…
            </div>
          </Motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {error ? (
          <Motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="pointer-events-none absolute inset-x-0 top-28 z-30 flex justify-center px-4"
          >
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 shadow">
              {error}
            </div>
          </Motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
