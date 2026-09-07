import { useEffect } from 'react'
import OutpatientLegacyForm from './OutpatientLegacyForm'
import AnimalBiteLegacyForm from './AnimalBiteLegacyForm'
import TbLegacyForm from './TbLegacyForm'

/**
 * Floating encode modal (same chrome as Historical Data Encoder).
 * Pass `children` for a custom form body; otherwise renders OPD / Animal Bite / TB forms.
 */
export default function EncodeServiceFormModal({
  open,
  onClose,
  title = 'Encode Service Details',
  subtitle = '',
  serviceKind = null,
  serviceName = '',
  status = '',
  joinReason = '',
  formData = {},
  onFormChange,
  children = null,
  error = '',
  message = '',
  saving = false,
  issuing = false,
  onSave,
  onIssueQueue,
  saveLabel = 'Save encoding',
  issueLabel = 'Get Queue Number',
  canIssueQueue = false,
  encodedByName = '',
  encodedAt = '',
}) {
  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const defaultForm =
    serviceKind === 'animal_bite' ? (
      <AnimalBiteLegacyForm data={formData} onChange={onFormChange} />
    ) : serviceKind === 'tb' ? (
      <TbLegacyForm data={formData} onChange={onFormChange} />
    ) : (
      <OutpatientLegacyForm data={formData} onChange={onFormChange} />
    )

  const form = children ?? defaultForm

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-12 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="encode-service-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close encode form"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5 sm:p-6">
          <div className="min-w-0">
            <h2 id="encode-service-modal-title" className="text-xl font-bold text-indigo-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {serviceName ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {serviceName}
                </span>
              ) : null}
              {status ? (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    status === 'Encoded'
                      ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                      : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                  }`}
                >
                  {status}
                </span>
              ) : null}
            </div>
            {encodedByName || encodedAt ? (
              <p className="mt-2 text-xs text-slate-500">
                Encoded by {encodedByName || 'staff'}
                {encodedAt ? ` · ${encodedAt}` : ''}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {error ? <p className="error-banner mb-4">{error}</p> : null}
          {message ? <p className="info-banner mb-4">{message}</p> : null}
          {joinReason ? (
            <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Patient note: {joinReason}
            </p>
          ) : null}
          {form}
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white p-5 sm:p-6">
          <button type="button" className="secondary-btn !mt-0" onClick={onClose} disabled={saving || issuing}>
            Cancel
          </button>
          <button type="button" className="primary-btn !mt-0 px-6" onClick={onSave} disabled={saving || issuing}>
            {saving ? 'Saving…' : saveLabel}
          </button>
          {onIssueQueue ? (
            <button
              type="button"
              className="secondary-btn !mt-0 !bg-teal-700 !text-white hover:!bg-teal-800 disabled:!opacity-50"
              onClick={onIssueQueue}
              disabled={issuing || saving || !canIssueQueue}
            >
              {issuing ? 'Issuing…' : issueLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
