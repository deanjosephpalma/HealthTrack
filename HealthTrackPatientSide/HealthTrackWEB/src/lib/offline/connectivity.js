import { useEffect, useState, useSyncExternalStore } from 'react'

function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

/** Simple banner state hook for offline UI. */
export function useConnectivityBanner() {
  const online = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(0)

  return { online, pendingCount, setPendingCount }
}
