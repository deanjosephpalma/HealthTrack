import * as XLSX from 'xlsx'
import { normalizeBarangayName, PILA_BARANGAYS } from './gis/barangayHeat'

const DISEASE_HEADERS = [
  'disease',
  'sakit',
  'illness',
  'diagnosis',
  'condition',
  'case type',
  'casetype',
  'sakit/illness',
  'disease name',
]

const COUNT_HEADERS = [
  'count',
  'cases',
  'patients',
  'estimated_count',
  'estimated cases',
  'bilang',
  'total',
  'number',
  'no of cases',
  'no. of cases',
  'number of cases',
  'patient count',
  'case count',
]

const BARANGAY_HEADERS = ['barangay', 'brgy', 'barangay name', 'location', 'area', 'purok/barangay']

const DATE_HEADERS = ['date', 'report_date', 'report date', 'petsa', 'as of', 'as_of']

function normHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function findColumn(headers, aliases) {
  const normalized = headers.map((h) => ({ raw: h, key: normHeader(h) }))
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.key === alias || h.key.includes(alias))
    if (hit) return hit.raw
  }
  return null
}

function parseCount(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '').trim()
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

function parseDateValue(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const d = new Date(text)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

export function resolveOfficialBarangay(name, fallback = null) {
  const key = normalizeBarangayName(name)
  if (!key) return fallback
  const hit = PILA_BARANGAYS.find((b) => normalizeBarangayName(b.name) === key)
  return hit?.name || fallback
}

export function getBarangayCoords(barangayName) {
  const key = normalizeBarangayName(barangayName)
  return PILA_BARANGAYS.find((b) => normalizeBarangayName(b.name) === key) || null
}

/**
 * Parse a barangay disease report (CSV / XLSX / XLS).
 * @returns {{ rows: Array, warnings: string[], meta: object }}
 */
export async function parseBarangayReportFile(file, { defaultBarangay }) {
  if (!file) throw new Error('Please choose a file.')
  if (!defaultBarangay) throw new Error('Please select the barangay first.')

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('The file has no sheets.')

  const sheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
  if (!rawRows.length) throw new Error('The file is empty. Add disease and case count rows.')

  const headers = Object.keys(rawRows[0] || {})
  const diseaseCol = findColumn(headers, DISEASE_HEADERS)
  const countCol = findColumn(headers, COUNT_HEADERS)
  const barangayCol = findColumn(headers, BARANGAY_HEADERS)
  const dateCol = findColumn(headers, DATE_HEADERS)

  if (!diseaseCol || !countCol) {
    throw new Error(
      'Could not find Disease and Cases columns. Use headers like: Disease, Cases (optional: Barangay, Date).',
    )
  }

  const warnings = []
  const parsed = []

  rawRows.forEach((row, index) => {
    const disease = String(row[diseaseCol] ?? '').trim()
    const count = parseCount(row[countCol])
    if (!disease && (count == null || count === 0)) return
    if (!disease) {
      warnings.push(`Row ${index + 2}: missing disease name — skipped.`)
      return
    }
    if (!count) {
      warnings.push(`Row ${index + 2} (${disease}): invalid case count — skipped.`)
      return
    }

    const fromFile = barangayCol ? resolveOfficialBarangay(row[barangayCol], null) : null
    if (barangayCol && row[barangayCol] && !fromFile) {
      warnings.push(
        `Row ${index + 2}: barangay "${row[barangayCol]}" not recognized — using ${defaultBarangay}.`,
      )
    }

    const barangay = fromFile || defaultBarangay
    const reportDate = dateCol ? parseDateValue(row[dateCol]) : null

    parsed.push({
      disease,
      estimated_count: count,
      barangay,
      report_date: reportDate,
      sourceRow: index + 2,
    })
  })

  if (!parsed.length) {
    throw new Error('No valid disease rows found in the file.')
  }

  // Aggregate same disease + barangay (+ date)
  const map = new Map()
  for (const row of parsed) {
    const key = `${normalizeBarangayName(row.barangay)}|${row.disease.toLowerCase()}|${row.report_date || ''}`
    const existing = map.get(key)
    if (existing) {
      existing.estimated_count += row.estimated_count
      existing.mergedFrom += 1
    } else {
      map.set(key, { ...row, mergedFrom: 1 })
    }
  }

  const rows = Array.from(map.values()).sort((a, b) =>
    a.barangay.localeCompare(b.barangay) || a.disease.localeCompare(b.disease),
  )

  return {
    rows,
    warnings,
    meta: {
      sheetName,
      diseaseCol,
      countCol,
      barangayCol,
      dateCol,
      totalRowsRead: rawRows.length,
      totalCases: rows.reduce((sum, r) => sum + r.estimated_count, 0),
    },
  }
}

/** Download a simple CSV template for barangay secretaries. */
export function downloadBarangayReportTemplate() {
  const csv = [
    'Disease,Cases,Date',
    'Dengue,5,2026-07-01',
    'Tuberculosis,2,2026-07-01',
    'Animal Bite,3,2026-07-01',
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'barangay-disease-report-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
