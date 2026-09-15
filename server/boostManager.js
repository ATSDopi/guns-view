// Boost manager — orchestrates view sessions based on mode:
//   instant: send N views with C threads, stop when done
//   daily:   send 1 view every (86400/perDay) seconds, indefinitely
//   custom:  send at perSec rate with C threads, indefinitely

import { sendView, closeBrowser } from "./viewEngine.js"

class BoostManager {
  constructor(proxyPool) {
    this.pool = proxyPool
    this.state = "idle"
    this.session = null
    this.stats = { sessionId: 0, sent: 0, ok: 0, fail: 0, rate: 0, startTime: 0 }
    this.series = []
    this._timers = []
    this._workers = new Set()
    this._stopFlag = false
    this.onUpdate = null
  }

  _emit() {
    this.onUpdate?.({ ...this.stats }, [...this.series])
  }

  _recordSeries() {
    const now = Date.now()
    const elapsed = (now - this.stats.startTime) / 1000
    const rate = elapsed > 0 ? this.stats.ok / elapsed : 0
    this.stats.rate = rate
    this.series.push({ t: now, rate, sent: this.stats.sent })
    if (this.series.length > 120) this.series.shift()
  }

  async start(config, profile) {
    if (this.state === "running") return
    this._stopFlag = false
    this.state = "running"
    this.session = { config, profile }
    this.stats = {
      sessionId: this.stats.sessionId + 1,
      sent: 0, ok: 0, fail: 0, rate: 0,
      startTime: Date.now(),
    }
    this.series = []
    this._emit()

    // build the proxy strategy:
    //   1. if the pool has proxies, rotate through them (1 view per proxy per day)
    //   2. else if config.proxyUrl is set (residential gateway with {session}), use it
    //   3. else direct (same IP every time — views will be deduplicated)
    this._proxy = config.proxyUrl ? { url: config.proxyUrl } : null
    this._proxyCountry = config.proxyCountry || null

    if (config.mode === "instant") this._runInstant(config, profile)
    else if (config.mode === "daily") this._runDaily(config, profile)
    else if (config.mode === "custom") this._runCustom(config, profile)
  }

  stop() {
    this.state = "paused"
    this._stopFlag = true
    this._timers.forEach((t) => clearTimeout(t))
    this._timers = []
    this._emit()
  }

  reset() {
    if (this.state === "running") return
    this.state = "idle"
    this.stats = { sessionId: this.stats.sessionId, sent: 0, ok: 0, fail: 0, rate: 0, startTime: 0 }
    this.series = []
    this._emit()
  }

  _pickProxy() {
    // priority: pool proxy (different IP each view) > residential gateway > direct
    const pooled = this.pool?.next?.(this._proxyCountry)
    if (pooled) return pooled
    return this._proxy
  }

  _handleResult(proxy, result) {
    if (result.ok) {
      this.stats.ok++
      if (proxy?.key) this.pool?.markUsed?.(proxy)
    } else {
      this.stats.fail++
      const err = String(result.error || "")
      // proxy is dead/MITM/unreachable → mark it so it's never retried
      if (proxy?.key && (err.startsWith("proxy_error") || err.includes("proxy") || err.includes("timeout") || err.includes("tunnel"))) {
        this.pool?.markDead?.(proxy)
      } else if (proxy?.key) {
        this.pool?.markUsed?.(proxy)
      }
    }
  }

  async _runInstant(config, profile) {
    const { total, concurrency } = config
    let sent = 0

    const worker = async () => {
      while (!this._stopFlag && sent < total) {
        const proxy = this._pickProxy()
        sent++
        this.stats.sent = sent
        const result = await sendView(profile, proxy)
        this._handleResult(proxy, result)
        this._recordSeries()
        this._emit()
      }
    }

    const workers = []
    for (let i = 0; i < Math.min(concurrency, total); i++) {
      const w = worker()
      this._workers.add(w)
      workers.push(w)
    }
    await Promise.all(workers)
    this._workers.clear()

    if (this.state === "running") {
      this.state = "paused"
      this._emit()
    }
  }

  _runDaily(config, profile) {
    const intervalMs = (86400 / config.perDay) * 1000

    const tick = async () => {
      if (this._stopFlag) return
      const proxy = this._pickProxy()
      this.stats.sent++
      this._emit()
      const result = await sendView(profile, proxy)
      this._handleResult(proxy, result)
      this._recordSeries()
      this._emit()
      this._timers.push(setTimeout(tick, intervalMs))
    }
    tick()
  }

  async _runCustom(config, profile) {
    const { perSec, concurrency } = config
    const intervalMs = (concurrency / perSec) * 1000

    const worker = async () => {
      while (!this._stopFlag) {
        const proxy = this._pickProxy()
        this.stats.sent++
        this._emit()
        const result = await sendView(profile, proxy)
        this._handleResult(proxy, result)
        this._recordSeries()
        this._emit()
        await sleep(intervalMs)
      }
    }

    const workers = []
    for (let i = 0; i < concurrency; i++) {
      const w = worker()
      this._workers.add(w)
      workers.push(w)
    }
    await Promise.all(workers)
    this._workers.clear()

    if (this.state === "running") {
      this.state = "paused"
      this._emit()
    }
  }

  async shutdown() {
    this.stop()
    await closeBrowser()
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export { BoostManager }
