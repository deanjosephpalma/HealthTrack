import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BarangayReportUploadModal from '../../components/BarangayReportUploadModal'
import { supabase } from '../../lib/supabaseClient'

function DeleteConfirmModal({ caseItem, onConfirm, onCancel, loading }) {
  if (!caseItem) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-900/60 backdrop-blur-sm px-4">
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        style={{ animation: 'fadeSlideDown 0.2s ease' }}
      >
        <div className="h-1 w-full bg-gradient-to-r from-rose-400 to-red-500" />

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-50 border border-rose-100">
              <svg className="h-6 w-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Delete Reported Case</h3>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                This will permanently remove the report for{' '}
                <span className="font-semibold text-slate-700">{caseItem.disease}</span> in{' '}
                <span className="font-semibold text-slate-700">{caseItem.barangay}</span> and it will no longer
                appear on the Heat Map.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
              {caseItem.estimated_count} case{caseItem.estimated_count !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
              {caseItem.report_date
                ? new Date(caseItem.report_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'N/A'}
            </span>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onCancel} disabled={loading} className="secondary-btn">
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-60"
            >
              {loading ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

function statusLabel(status) {
  if (status === 'community-reported') return 'Barangay file'
  if (status === 'suspected') return 'Suspected'
  if (status === 'estimated') return 'Estimated cluster'
  return status || 'Reported'
}

function statusClass(status) {
  if (status === 'community-reported') return 'bg-teal-50 text-teal-800 ring-teal-600/20'
  if (status === 'suspected') return 'bg-amber-50 text-amber-800 ring-amber-600/20'
  return 'bg-slate-100 text-slate-700 ring-slate-500/10'
}

export default function ReportedCasesPage() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    fetchCases()
  }, [])

  const fetchCases = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await supabase
        .from('estimated_cases')
        .select('*')
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (queryError) throw queryError
      setCases(data || [])
    } catch (err) {
      console.error('Error fetching reported cases:', err)
      setError('Failed to load reported cases.')
    } finally {
      setLoading(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const { error: deleteError } = await supabase.from('estimated_cases').delete().eq('id', pendingDelete.id)
      if (deleteError) throw deleteError
      setCases((prev) => prev.filter((c) => c.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch (err) {
      console.error('Error deleting report:', err)
      setError('Failed to delete report: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <DeleteConfirmModal
        caseItem={pendingDelete}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
        loading={deleting}
      />

      <BarangayReportUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onImported={(rows) => {
          setSuccess(
            `Saved ${rows.length} disease line(s) from ${rows[0]?.barangay || 'barangay'} — now visible on the Heat Map.`,
          )
          void fetchCases()
        }}
      />

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="module-title">Reported Cases</h2>
          <p className="module-subtitle mb-0">
            Upload barangay CSV/Excel reports or manage cases that appear on the Heat Map.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowUpload(true)} className="primary-btn !mt-0">
            Upload barangay file
          </button>
          <Link to="/dashboard/heat-map" className="secondary-btn !mt-0 inline-flex items-center">
            Open heat map
          </Link>
          <button type="button" onClick={fetchCases} disabled={loading} className="secondary-btn !mt-0">
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="m-0 text-sm font-semibold text-slate-900">How barangay upload works</p>
        <ol className="mb-0 mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Select which barangay sent the report</li>
          <li>Upload their CSV or Excel file (Disease + Cases columns)</li>
          <li>Review the list, then save — cases go to this table and the Heat Map</li>
        </ol>
      </div>

      {success ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p> : null}
      {error ? <p className="error-banner mb-6">{error}</p> : null}

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Report Date</th>
                <th className="px-6 py-4 font-semibold">Disease</th>
                <th className="px-6 py-4 font-semibold">Barangay</th>
                <th className="px-6 py-4 text-center font-semibold">Cases</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Loading reported cases...
                  </td>
                </tr>
              ) : cases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No reported cases yet. Upload a barangay CSV/Excel file to get started.
                  </td>
                </tr>
              ) : (
                cases.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {c.report_date
                        ? new Date(c.report_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        {c.disease}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{c.barangay}</td>
                    <td className="px-6 py-4 text-center font-bold text-slate-900">{c.estimated_count}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass(c.status)}`}
                      >
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setPendingDelete(c)}
                        className="text-slate-400 transition-colors hover:text-rose-600"
                        title="Delete this report"
                      >
                        <svg className="inline-block h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
