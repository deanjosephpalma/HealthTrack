import { createContext, useState, useContext, useCallback } from 'react'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    type: 'info', // 'info' | 'danger' | 'warning' | 'success'
    isAlert: false,
    resolve: null,
  })

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        title: options.title || 'Are you sure?',
        message: options.message || 'Please confirm this action.',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        type: options.type || 'info',
        isAlert: false,
        resolve,
      })
    })
  }, [])

  const alert = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        title: options.title || 'Notice',
        message: typeof options === 'string' ? options : options.message || '',
        confirmLabel: options.confirmLabel || 'OK',
        cancelLabel: '',
        type: options.type || 'info',
        isAlert: true,
        resolve,
      })
    })
  }, [])

  const handleConfirm = () => {
    if (modalState.resolve) modalState.resolve(true)
    setModalState(prev => ({ ...prev, isOpen: false }))
  }

  const handleCancel = () => {
    if (modalState.resolve) modalState.resolve(false)
    setModalState(prev => ({ ...prev, isOpen: false }))
  }

  // Define Icon based on type
  const renderIcon = () => {
    switch (modalState.type) {
      case 'danger':
        return (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-inner">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
        )
      case 'warning':
        return (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-inner">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        )
      case 'success':
        return (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-inner">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
      default: // 'info'
        return (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-inner">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
    }
  }

  // Get confirm button class based on type
  const getConfirmButtonClass = () => {
    switch (modalState.type) {
      case 'danger':
        return 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-lg shadow-rose-500/20 hover:shadow-rose-600/30 focus:ring-rose-500/30'
      case 'warning':
        return 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-600/30 focus:ring-amber-500/30'
      case 'success':
        return 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-600/30 focus:ring-emerald-500/30'
      default:
        return 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-600/30 focus:ring-indigo-500/30'
    }
  }

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}

      {/* Floating Dialog Modal Portal-equivalent */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          
          {/* backdrop blur */}
          <div 
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm transition-all duration-300 animate-in fade-in"
            onClick={modalState.isAlert ? handleConfirm : handleCancel}
          />
          
          {/* floating dialog card */}
          <div className="relative w-full max-w-md transform overflow-hidden rounded-[28px] border border-slate-100 bg-white p-6 shadow-2xl transition-all duration-300 ease-out animate-in zoom-in-95 fade-in slide-in-from-bottom-8">
            <div className="flex flex-col items-center text-center">
              
              {/* Type-based Icon with soft glow */}
              <div className="mb-5 flex justify-center">
                {renderIcon()}
              </div>

              {/* Title */}
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mb-2 px-2">
                {modalState.title}
              </h3>

              {/* Message */}
              <p className="text-sm font-semibold text-slate-500 leading-relaxed px-4 mb-6">
                {modalState.message}
              </p>

              {/* Buttons Grid */}
              <div className={`flex w-full items-center justify-center gap-3 ${modalState.isAlert ? 'max-w-[200px]' : ''}`}>
                {!modalState.isAlert && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 rounded-2xl border border-slate-200/80 bg-white px-5 py-3 text-sm font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-100 active:scale-98"
                  >
                    {modalState.cancelLabel}
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={`flex-1 rounded-2xl px-5 py-3 text-sm font-bold transition-all focus:outline-none focus:ring-4 active:scale-98 ${getConfirmButtonClass()}`}
                >
                  {modalState.confirmLabel}
                </button>
              </div>

            </div>
          </div>

        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used inside a ConfirmProvider')
  }
  return context
}
