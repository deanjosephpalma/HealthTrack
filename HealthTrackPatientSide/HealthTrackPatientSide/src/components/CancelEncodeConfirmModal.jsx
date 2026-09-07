export default function CancelEncodeConfirmModal({
  open,
  serviceName = 'this service',
  variant = 'encode',
  onCancel,
  onConfirm,
  busy = false,
}) {
  if (!open) return null

  const isEncode = variant === 'encode'
  const title = isEncode ? 'Leave the encode line?' : 'Remove this service?'
  const description = isEncode
    ? `You are still waiting for BHW / Volunteer encoding for ${serviceName}. If you cancel now, you will leave the line and can get in line again later if needed.`
    : `"${serviceName}" was selected but not used yet. Removing it cancels this request. You can select the service again later if you need it.`
  const confirmLabel = isEncode ? 'Yes, cancel encode line' : 'Yes, remove'
  const busyLabel = isEncode ? 'Cancelling…' : 'Removing…'
  const stayLabel = isEncode ? 'Keep waiting' : 'Keep service'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/55 px-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-encode-title"
        aria-describedby="cancel-encode-desc"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-2xl"
      >
        <div className="border-b border-rose-100 bg-gradient-to-br from-rose-50 via-amber-50 to-white px-6 pb-5 pt-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 ring-1 ring-rose-200">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 id="cancel-encode-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <p id="cancel-encode-desc" className="mt-2 text-sm leading-relaxed text-slate-600">
            {description}
          </p>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            {isEncode ? (
              <>
                <span className="font-semibold">Note:</span> You can only cancel while waiting for encoding. After staff
                encodes your visit, this option will no longer be available.
              </>
            ) : (
              <>
                <span className="font-semibold">Note:</span> This only removes unused requests. Active queue tickets
                cannot be cancelled here.
              </>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" className="secondary-btn !mt-0" onClick={onCancel} disabled={busy}>
              {stayLabel}
            </button>
            <button
              type="button"
              className="primary-btn !mt-0 bg-rose-700 hover:bg-rose-800"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
