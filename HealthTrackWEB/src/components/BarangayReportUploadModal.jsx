import { useMemo, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabaseClient'
import {
  downloadBarangayReportTemplate,
  getBarangayCoords,
  parseBarangayReportFile,
} from '../lib/barangayReportImport'
import { PILA_BARANGAYS } from '../lib/gis/barangayHeat'
import useBodyScrollLock from '../hooks/useBodyScrollLock'

export default function BarangayReportUploadModal({ open, onClose, onImported }) {
  const { profile } = useAuth()
  const [barangay, setBarangay] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10))

  useBodyScrollLock(open)

  const totalCases = useMemo(
    () => (preview?.rows ?? []).reduce((sum, r) => sum + Number(r.estimated_count || 0), 0),
    [preview],
  )

  if (!open) return null

  const reset = () => {
    setFileName('')
    setPreview(null)
    setWarnings([])
    setError('')
  }

  const handleClose = () => {
    if (busy) return
    reset()
    setBarangay('')
    onClose?.()
  }

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!barangay) {
      setError('Select the barangay first, then choose the file.')
      return
    }

    setBusy(true)
    setError('')
    setWarnings([])
    setPreview(null)
    try {
      const result = await parseBarangayReportFile(file, { defaultBarangay: barangay })
      setFileName(file.name)
      setPreview(result)
      setWarnings(result.warnings || [])
    } catch (e) {
      setError(e?.message || 'Failed to read the file.')
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    if (!preview?.rows?.length) {
      setError('Nothing to import yet. Upload a CSV or Excel file first.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const payload = preview.rows.map((row) => {
        const coords = getBarangayCoords(row.barangay)
        return {
          disease: row.disease,
          barangay: row.barangay,
          estimated_count: row.estimated_count,
          status: 'community-reported',
          report_date: row.report_date || reportDate || new Date().toISOString().slice(0, 10),
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          reported_by: profile?.id || null,
        }
      })

      const { error: insertError } = await supabase.from('estimated_cases').insert(payload)
      if (insertError) throw new Error(insertError.message)

      onImported?.(payload)
      reset()
      setBarangay('')
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Failed to save reports.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay z-50 flex items-start justify-center overflow-hidden bg-slate-900/50 px-4 py-10 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-bold text-slate-900">Upload barangay report</h2>
              <p className="m-0 mt-1 text-sm text-slate-500">
                1) Choose barangay → 2) Upload CSV/Excel → 3) Review → 4) Save to heat map
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-900">
            Tip: Ask the barangay for a simple file with columns <strong>Disease</strong> and{' '}
            <strong>Cases</strong>. You can also download a template.
            <button
              type="button"
              onClick={downloadBarangayReportTemplate}
              className="ml-2 font-semibold text-teal-800 underline"
            >
              Download template
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              1. Which barangay sent this report?
            </span>
            <select
              value={barangay}
              onChange={(e) => {
                setBarangay(e.target.value)
                reset()
              }}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-teal-500"
            >
              <option value="">Select barangay…</option>
              {PILA_BARANGAYS.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Default report date (if file has no date)
            </span>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-teal-500"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              2. Upload CSV or Excel file
            </span>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                barangay
                  ? 'border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/40'
                  : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
              }`}
            >
              <p className="m-0 text-sm font-semibold text-slate-800">
                {fileName || 'Click to choose .csv / .xlsx / .xls'}
              </p>
              <p className="m-0 mt-1 text-xs text-slate-500">
                {barangay ? `Will be tagged to ${barangay}` : 'Select a barangay first'}
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={!barangay || busy}
                onChange={handleFile}
              />
            </label>
          </div>

          {error ? <p className="m-0 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          {warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="m-0 font-semibold">Notes while reading the file</p>
              <ul className="mb-0 mt-1 list-disc pl-4">
                {warnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
                {warnings.length > 6 ? <li>+{warnings.length - 6} more</li> : null}
              </ul>
            </div>
          ) : null}

          {preview?.rows?.length ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="m-0 text-sm font-bold text-slate-900">3. Review before saving</p>
                <p className="m-0 text-xs text-slate-500">
                  {preview.rows.length} disease line(s) · {totalCases} total cases
                </p>
              </div>
              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Disease</th>
                      <th className="px-3 py-2 font-semibold">Barangay</th>
                      <th className="px-3 py-2 text-right font-semibold">Cases</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.map((row) => (
                      <tr key={`${row.barangay}-${row.disease}-${row.report_date || ''}`}>
                        <td className="px-3 py-2 font-medium text-slate-800">{row.disease}</td>
                        <td className="px-3 py-2 text-slate-600">{row.barangay}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">{row.estimated_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
          <button
            type="button"
            disabled={busy}
            onClick={handleClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !preview?.rows?.length}
            onClick={handleImport}
            className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save to heat map'}
          </button>
        </div>
      </div>
    </div>
  )
}
