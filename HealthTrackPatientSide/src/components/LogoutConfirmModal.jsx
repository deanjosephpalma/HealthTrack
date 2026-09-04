export default function LogoutConfirmModal({ open, onCancel, onConfirm, busy = false }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/55 px-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-desc"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 id="logout-confirm-title" className="text-lg font-semibold text-slate-900">
          Sign out?
        </h2>
        <p id="logout-confirm-desc" className="mt-2 text-sm leading-relaxed text-slate-600">
          You will leave the patient portal on this device. Anyone using this browser will need to sign in again to view
          your records.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="secondary-btn !mt-0" onClick={onCancel} disabled={busy}>
            Stay signed in
          </button>
          <button
            type="button"
            className="primary-btn !mt-0 bg-rose-700 hover:bg-rose-800"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}
