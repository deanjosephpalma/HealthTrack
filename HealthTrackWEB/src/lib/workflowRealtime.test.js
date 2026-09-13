import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subscribeWorkflowChanges } from './workflowRealtime.js'

test('workflow changes coalesce, catch up during refresh, reconnect, and clean up', async () => {
  const browser = new EventTarget()
  const page = new EventTarget()
  Object.assign(browser, { setTimeout, clearTimeout, setInterval, clearInterval })
  page.visibilityState = 'visible'
  globalThis.window = browser
  globalThis.document = page
  const handlers = new Map()
  let statusHandler
  let removed = false
  const channel = {
    on(_event, filter, handler) { handlers.set(filter.table, handler); return this },
    subscribe(handler) { statusHandler = handler; return this },
  }
  const client = { channel: () => channel, removeChannel: () => { removed = true } }
  let calls = 0
  let release
  let block = false
  const pause = () => new Promise((resolve) => setTimeout(resolve, 220))
  const stop = subscribeWorkflowChanges(client, async () => {
    calls++
    if (block) await new Promise((resolve) => { release = resolve })
  }, { intervalMs: 60000 })
  try {
    assert.deepEqual([...handlers.keys()], ['queue', 'service_requests', 'service_request_steps', 'patient_records'])
    await pause()
    assert.equal(calls, 1)
    block = true
    handlers.get('queue')()
    handlers.get('service_requests')()
    await pause()
    assert.equal(calls, 2)
    handlers.get('queue')()
    await pause()
    assert.equal(calls, 2, 'no concurrent refresh')
    block = false
    release()
    await pause()
    assert.equal(calls, 3, 'event during refresh gets a follow-up')
    statusHandler('SUBSCRIBED')
    browser.dispatchEvent(new Event('online'))
    page.dispatchEvent(new Event('visibilitychange'))
    await pause()
    assert.equal(calls, 4, 'reconnect and visibility changes catch up')
    handlers.get('queue')()
    stop()
    browser.dispatchEvent(new Event('focus'))
    await pause()
    assert.equal(calls, 4, 'cleanup cancels queued refreshes and listeners')
    assert.equal(removed, true)
  } finally {
    stop()
    delete globalThis.window
    delete globalThis.document
  }
})

test('fallback refresh retries after a failure without websocket events', async () => {
  const browser = new EventTarget()
  Object.assign(browser, { setTimeout, clearTimeout, setInterval, clearInterval })
  globalThis.window = browser
  globalThis.document = new EventTarget()
  const channel = { on() { return this }, subscribe() { return this } }
  let calls = 0
  const stop = subscribeWorkflowChanges({ channel: () => channel, removeChannel() {} }, async () => {
    calls++
    if (calls === 1) throw new Error('Transient connection failure')
  }, { intervalMs: 200 })
  try {
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert.ok(calls >= 2)
  } finally {
    stop()
    delete globalThis.window
    delete globalThis.document
  }
})
