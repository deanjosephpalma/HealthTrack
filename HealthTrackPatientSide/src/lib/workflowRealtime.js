// Coalesce transaction bursts and catch up after reconnects or a background tab.
export function subscribeWorkflowChanges(client, refresh, { intervalMs = 15000, extraTables = [] } = {}) {
  let stopped = false
  let running = false
  let pending = false
  let timer
  const run = async () => {
    if (stopped) return
    if (running) { pending = true; return }
    running = true
    try {
      await refresh()
    } catch {
      // The page reports errors; the fallback retries transient failures.
    } finally {
      running = false
      if (pending && !stopped) { pending = false; schedule() }
    }
  }
  const schedule = () => {
    if (stopped || timer) return
    timer = window.setTimeout(() => { timer = null; void run() }, 150)
  }
  const visible = () => { if (document.visibilityState === 'visible') schedule() }
  const channel = client.channel(`workflow-${crypto.randomUUID()}`)
  for (const table of new Set(['queue', 'service_requests', 'service_request_steps', 'patient_records', ...extraTables])) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule)
  }
  channel.subscribe((status) => { if (status === 'SUBSCRIBED') schedule() })
  const interval = window.setInterval(schedule, intervalMs)
  window.addEventListener('online', schedule)
  window.addEventListener('focus', schedule)
  document.addEventListener('visibilitychange', visible)
  schedule()
  return () => {
    stopped = true
    window.clearTimeout(timer)
    window.clearInterval(interval)
    window.removeEventListener('online', schedule)
    window.removeEventListener('focus', schedule)
    document.removeEventListener('visibilitychange', visible)
    void client.removeChannel(channel)
  }
}
