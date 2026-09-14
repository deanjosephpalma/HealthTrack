import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import './QueueDisplayPage.css'
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
  const [fullscreen, setFullscreen] = useState(false)
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

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === panel.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await panel.current.requestFullscreen()
    } catch { setError('Hindi available ang fullscreen sa browser na ito.') }
  }

  const renderTickets = (items) => items.map((row) => (
    <article key={row.id} className="qd-ticket">
      <p className="qd-number">{ticketLabel(row)}</p>
      <p className="qd-destination"><span aria-hidden="true">?</span> {row.counter_room || 'Nurse desk'}</p>
    </article>
  ))
  const warning = !online || Boolean(error)

  return (
    <section ref={panel} className="queue-display">
      <header className="qd-header">
        <div className="qd-brand"><span className="qd-brand-icon" aria-hidden="true">+</span><div><p className="qd-eyebrow">HEALTHTRACK ? RHU PILA</p><h1>Queue Display</h1><p className="qd-subtitle">Tingnan ang inyong numero at hintayin ang tawag.</p></div></div>
        <div className="qd-clock"><strong>{new Date(clock).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}</strong><span>{new Date(clock).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
      </header>
      <div className="qd-toolbar">
        <label className="qd-filter">Ipakitang desk<select value={room} onChange={(e) => { setRoom(e.target.value); window.speechSynthesis?.cancel() }}><option value="">Lahat ng desk</option>{rooms.map((value) => <option key={value}>{value}</option>)}</select></label>
        <div className="qd-actions">
          <button type="button" disabled={!speechAvailable} aria-pressed={voice} className={`qd-button ${voice ? 'qd-button-active' : ''}`} onClick={() => { if (voice) window.speechSynthesis.cancel(); setVoice(!voice) }}><span aria-hidden="true">?</span> Voice {voice ? 'on' : 'off'}</button>
          <button type="button" className="qd-button qd-button-primary" onClick={toggleFullscreen}><span aria-hidden="true">?</span> {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
        </div>
      </div>
      <div className={`qd-status ${warning ? 'qd-status-warning' : ''}`} role="status"><span className="qd-status-dot" aria-hidden="true" />{!online ? 'Offline ? huling naka-save na pila. Magtanong po sa staff.' : error || (lastSync ? `Huling update: ${new Date(lastSync).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })}` : 'Kinukuha ang pinakabagong pila?')}</div>
      {!speechAvailable && <p className="qd-note">Hindi available ang voice announcement sa browser na ito.</p>}
      {loading ? <div className="qd-loading" role="status">Binabasa ang pila?</div> : <>
        <div className="qd-board">
          <section className="qd-serving"><div className="qd-panel-heading"><div><p className="qd-eyebrow">NOW CALLING</p><h2>Tinatawag ngayon</h2></div><span className="qd-count">{called.length}</span></div><p className="qd-panel-instruction">Pumunta po sa nakasaad na desk.</p><div className="qd-ticket-list" aria-live="polite" aria-atomic="true">{called.length ? renderTickets(called) : <div className="qd-empty"><span aria-hidden="true">?</span><h3>Wala pang tinatawag</h3><p>Manatili po sa waiting area.</p></div>}</div></section>
          <section className="qd-next"><div className="qd-panel-heading"><div><p className="qd-eyebrow">UP NEXT</p><h2>Susunod sa pila</h2></div><span className="qd-count">{next.length}</span></div><p className="qd-panel-instruction">Maghanda po at hintaying tawagin.</p><div className="qd-ticket-list">{next.length ? renderTickets(next) : <div className="qd-empty"><span aria-hidden="true">?</span><h3>Hintayin ang susunod na tawag</h3><p>Staff ang magtatalaga ng susunod.</p></div>}</div></section>
        </div>
        <section className="qd-waiting"><div className="qd-waiting-heading"><div><p className="qd-eyebrow">WAITING AREA</p><h2>Naghihintay <span className="qd-count">{waiting.length}</span></h2></div><p>Hintayin pong lumabas ang inyong numero sa itaas.</p></div>{waiting.length ? <div className="qd-waiting-grid">{renderTickets(waiting)}</div> : <p className="qd-waiting-empty">Wala pang naghihintay sa pilang ito.</p>}</section>
      </>}
      <footer className="qd-footer"><span className="qd-help-icon" aria-hidden="true">?</span><p><strong>Kailangan ng tulong?</strong> Lumapit po sa nurse o staff.</p><span className="qd-footer-brand">Rural Health Unit of Pila</span></footer>
    </section>
  )
}
