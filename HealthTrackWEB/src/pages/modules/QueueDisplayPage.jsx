import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { listLocalQueue } from '../../lib/offline/queueService'
import { startAutoSync, subscribeSyncStatus } from '../../lib/offline/syncEngine'
import { useOnlineStatus } from '../../lib/offline/connectivity'
import { displayTickets, ticketLabel } from '../../lib/queueDisplay'

export default function QueueDisplayPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState('')
  const [voice, setVoice] = useState(false)
  const [room, setRoom] = useState('')
  const [clock, setClock] = useState(() => Date.now())
  const panel = useRef(null)
  const announced = useRef(new Set())
  const online = useOnlineStatus()
  const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window
  const tickets = displayTickets(rows, new Date(clock), room)
  const called = tickets.filter((row) => row.status === 'called')
  const next = tickets.filter((row) => row.status === 'next')
  const waiting = tickets.filter((row) => row.status === 'waiting')
  const rooms = [...new Set(rows.map((row) => row.counter_room).filter(Boolean))].sort()

  useEffect(() => {
    const subscription = liveQuery(listLocalQueue).subscribe({
      next: (items) => { setRows(items); setLoading(false) },
      error: () => { setError('Hindi mabasa ang pila. I-reload ang page.'); setLoading(false) },
    })
    const unsubscribe = subscribeSyncStatus((status) => {
      if (status.error) setError('Hindi ma-update ang pila. Huling naka-save na impormasyon ang ipinapakita.')
      else if (status.lastSyncAt) { setLastSync(status.lastSyncAt); setError('') }
    })
    const stop = startAutoSync({ intervalMs: 10000 })
    const timer = setInterval(() => setClock(Date.now()), 10000)
    return () => {
      subscription.unsubscribe(); unsubscribe(); stop(); clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!voice || !speechAvailable || !online || error || !lastSync) return
    for (const row of called) {
      const key = `${row.id}:${row.updated_at || row.created_at}`
      if (announced.current.has(key)) continue
      announced.current.add(key)
      const message = new SpeechSynthesisUtterance(`Numero ${ticketLabel(row)}. Pumunta po sa ${row.counter_room || 'nurse desk'}.`)
      message.lang = 'fil-PH'
      message.rate = 0.85
      window.speechSynthesis.speak(message)
    }
  }, [called, voice, speechAvailable, online, error, lastSync])

  useEffect(() => () => { if (speechAvailable) window.speechSynthesis.cancel() }, [speechAvailable])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await panel.current.requestFullscreen()
    } catch { setError('Hindi available ang fullscreen sa browser na ito.') }
  }

  const renderTickets = (items, large = false) => items.map((row) => (
    <div key={row.id} className="rounded-2xl border border-teal-200 bg-white p-6 text-slate-950">
      <p className={`break-words font-black ${large ? 'text-6xl md:text-8xl' : 'text-4xl'}`}>{ticketLabel(row)}</p>
      <p className="mt-3 text-2xl font-semibold">{row.counter_room || 'Nurse desk'}</p>
    </div>
  ))

  return (
    <section ref={panel} className="min-h-screen overflow-auto bg-slate-50 p-4 text-slate-950 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xl font-semibold">HealthTrack · RHU Pila</p><h1 className="text-3xl font-bold">Queue Display</h1></div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="font-semibold">Desk <select className="min-h-12 rounded-lg border p-2" value={room} onChange={(e) => { setRoom(e.target.value); window.speechSynthesis?.cancel() }}><option value="">Lahat ng desk</option>{rooms.map((value) => <option key={value}>{value}</option>)}</select></label>
          <button type="button" disabled={!speechAvailable} aria-pressed={voice} className="min-h-12 rounded-xl border px-4 font-semibold disabled:opacity-50" onClick={() => { if (voice) window.speechSynthesis.cancel(); setVoice(!voice) }}>{voice ? 'Voice: On' : 'Voice: Off'}</button>
          <button type="button" className="min-h-12 rounded-xl bg-teal-800 px-4 font-semibold text-white" onClick={toggleFullscreen}>Fullscreen / Exit</button>
        </div>
      </div>
      <p role="status" className="mb-5 text-lg font-semibold">{!online ? 'Offline — huling naka-save na pila. Magtanong po sa staff.' : error || (lastSync ? `Huling update: ${new Date(lastSync).toLocaleTimeString('en-PH')}` : 'Kinukuha ang pinakabagong pila…')}</p>
      {!speechAvailable && <p>Hindi available ang voice announcement sa browser na ito.</p>}
      {loading ? <p role="status">Binabasa ang pila…</p> : <>
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl bg-teal-900 p-6 text-white"><h2 className="mb-4 text-3xl font-bold">Tinatawag ngayon</h2><div className="grid gap-4" aria-live="polite" aria-atomic="true">{called.length ? renderTickets(called, true) : <p className="text-2xl">Wala pang tinatawag.</p>}</div></section>
          <section className="rounded-3xl border-2 border-blue-200 bg-blue-50 p-6"><h2 className="mb-4 text-3xl font-bold">Susunod — maghanda po</h2><div className="grid gap-4">{next.length ? renderTickets(next) : <p className="text-2xl">Hintayin po ang tawag ng staff.</p>}</div></section>
        </div>
        <section className="mt-6"><h2 className="mb-4 text-2xl font-bold">Naghihintay ({waiting.length})</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{renderTickets(waiting)}</div>{!waiting.length && <p className="text-xl">Wala pang naghihintay.</p>}</section>
      </>}
      <p className="mt-6 text-xl">Tingnan ang inyong ticket number at desk. Lumapit po sa staff kung kailangan ng tulong.</p>
    </section>
  )
}
