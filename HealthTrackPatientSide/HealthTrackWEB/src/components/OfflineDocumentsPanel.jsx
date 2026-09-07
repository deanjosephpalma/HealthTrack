import { useCallback, useEffect, useState } from 'react'
import { listLocalDocuments, saveDocumentLocal } from '../lib/offline/paperlessService'
import { syncNow } from '../lib/offline/syncEngine'
import { useOnlineStatus } from '../lib/offline/connectivity'

/**
 * Attach/scan documents offline; uploads to Storage when online.
 */
export default function OfflineDocumentsPanel({
  serviceRequestId = null,
  patientAuthId = null,
  patientId = null,
  uploadedBy = null,
  title = 'Documents',
}) {
  const online = useOnlineStatus()
  const [docs, setDocs] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const rows = await listLocalDocuments({ serviceRequestId, patientAuthId })
    setDocs(rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))))
  }, [serviceRequestId, patientAuthId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onPick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { offline } = await saveDocumentLocal({
        file,
        documentName: file.name,
        patientAuthId,
        patientId,
        serviceRequestId,
        uploadedBy,
      })
      if (online) await syncNow()
      setMessage(offline ? 'Saved offline — will upload when you reconnect.' : 'Document queued for upload.')
      await refresh()
    } catch (e) {
      setError(e?.message || 'Failed to save document.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">{title}</h3>
        <label className="secondary-btn !mt-0 cursor-pointer text-sm">
          {busy ? 'Saving…' : 'Attach file'}
          <input type="file" className="hidden" disabled={busy} onChange={onPick} />
        </label>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Files are stored on this device first, then uploaded when the clinic is online (paperless archive).
      </p>
      {message ? <p className="mb-2 text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-2 text-xs text-rose-700">{error}</p> : null}
      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">No documents attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <span className="truncate font-medium text-slate-800">{doc.document_name || doc.file_name}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  doc.synced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                }`}
              >
                {doc.synced ? 'Synced' : 'Pending'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
