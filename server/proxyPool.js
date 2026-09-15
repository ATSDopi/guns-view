// Proxy pool — harvest public proxies, test them against guns.lol, track
// daily usage (1 view per IP per day). Testing is done eagerly via testProxies()
// (TCP connect → real tunnel+TLS to guns.lol → geolocation); a proxy that
// fails during a view attempt is also marked dead lazily.

import { harvest } from "./harvester.js"
import { testProxies } from "./proxyTester.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// GUNSVIEW_DATA_DIR is set by the Electron main process to a writable dir
// (the packaged app's server/ lives inside read-only app.asar)
const DATA_DIR = process.env.GUNSVIEW_DATA_DIR || path.join(__dirname, "..", "data")
const DATA_FILE = path.join(DATA_DIR, "proxy-state.json")

class ProxyPool {
  constructor() {
    this.proxies = []
    this.usedToday = new Set()
    this.today = new Date().toISOString().slice(0, 10)
    this.harvesting = false
    this.testing = false
    this.loadState()
  }

  loadState() {
    try {
      const dir = path.dirname(DATA_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"))
        const today = new Date().toISOString().slice(0, 10)
        if (data.date === today) {
          this.usedToday = new Set(data.usedToday || [])
        }
      }
    } catch {}
  }

  saveState() {
    try {
      const dir = path.dirname(DATA_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({ date: this.today, usedToday: [...this.usedToday] }),
      )
    } catch {}
  }

  _checkDay() {
    const today = new Date().toISOString().slice(0, 10)
    if (today !== this.today) {
      this.today = today
      this.usedToday = new Set()
      for (const p of this.proxies) p.status = "fresh"
      this.saveState()
    }
  }

  get total() {
    return this.proxies.length
  }

  get available() {
    this._checkDay()
    return this.proxies.filter(
      (p) => (p.status === "fresh" || p.status === "ok") && !this.usedToday.has(p.key),
    ).length
  }

  get usedCount() {
    return this.usedToday.size
  }

  async harvest(onProgress) {
    if (this.harvesting) return this.proxies.length
    this.harvesting = true
    try {
      const proxies = await harvest((name, count, status) => {
        onProgress?.(name, count, status)
      })
      const existing = new Map(this.proxies.map((p) => [p.key, p]))
      this.proxies = proxies.map((p) => {
        const key = `${p.host}:${p.port}`
        const prev = existing.get(key)
        return {
          ...p, key,
          status: prev?.status || "fresh",
          country: prev?.country,
          countryCode: prev?.countryCode,
          latencyMs: prev?.latencyMs,
        }
      })
      return this.proxies.length
    } finally {
      this.harvesting = false
    }
  }

  // Test all untested proxies: TCP connect → tunnel+TLS to guns.lol → geo.
  // Only "ok" proxies are kept usable; dead ones are marked. Emits progress.
  async test(onProgress, opts = {}) {
    if (this.testing) return { working: this.proxies.filter((p) => p.status === "ok").length }
    this.testing = true
    try {
      const untested = this.proxies.filter((p) => p.status === "fresh")
      const { working } = await testProxies(untested, { onProgress, ...opts })
      // tested failures are already marked "dead" on the proxy objects
      return { working: working.length, tested: untested.length }
    } finally {
      this.testing = false
    }
  }

  // Filtered listing for the UI table.
  list({ country, scheme, status, limit = 500 } = {}) {
    let out = this.proxies
    if (country) out = out.filter((p) => p.countryCode === country)
    if (scheme) out = out.filter((p) => p.scheme === scheme)
    if (status) out = out.filter((p) => p.status === status)
    // working first, then by latency
    out = [...out].sort((a, b) => {
      const rank = { ok: 0, fresh: 1, dead: 2 }
      const d = (rank[a.status] ?? 3) - (rank[b.status] ?? 3)
      return d !== 0 ? d : (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999)
    })
    return { total: out.length, proxies: out.slice(0, limit) }
  }

  countries() {
    const map = new Map()
    for (const p of this.proxies) {
      if (p.countryCode && p.status === "ok") {
        map.set(p.countryCode, { countryCode: p.countryCode, country: p.country, count: (map.get(p.countryCode)?.count || 0) + 1 })
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }

  // add user-provided proxies (one per line: socks5://host:port, http://host:port, or host:port)
  addList(text) {
    const lines = String(text || "").split(/\r?\n/)
    const existing = new Map(this.proxies.map((p) => [p.key, p]))
    let added = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const mUrl = trimmed.match(/^(socks5|socks4|https?):\/\/(?:[\w.-]+:[\w.-]+@)?([\w.-]+):(\d{1,5})$/i)
      const mHp = trimmed.match(/^([\w.-]+):(\d{1,5})$/)
      let host, port, scheme
      if (mUrl) {
        scheme = mUrl[1].toLowerCase()
        host = mUrl[2]
        port = parseInt(mUrl[3], 10)
      } else if (mHp) {
        scheme = "http"
        host = mHp[1]
        port = parseInt(mHp[2], 10)
      } else {
        continue
      }
      if (port < 1 || port > 65535) continue
      const key = `${host}:${port}`
      if (existing.has(key)) continue
      const proxy = { host, port, scheme, url: `${scheme}://${host}:${port}`, key, status: "fresh", source: "manual" }
      proxy._untested = true
      existing.set(key, proxy)
      this.proxies.push(proxy)
      added++
    }
    return added
  }

  // Pick the next usable proxy. Tested "ok" proxies first, then untested
  // "fresh" ones as fallback. Optional country filter (ISO code, e.g. "FR").
  next(country) {
    this._checkDay()
    let fallback = null
    for (const p of this.proxies) {
      if (this.usedToday.has(p.key)) continue
      if (country && p.countryCode && p.countryCode !== country) continue
      if (p.status === "ok") return p
      if (p.status === "fresh" && !fallback) fallback = p
    }
    return fallback
  }

  markUsed(proxy) {
    this.usedToday.add(proxy.key)
    proxy.status = "ok"
    proxy.lastUsed = Date.now()
    this.saveState()
  }

  markDead(proxy) {
    proxy.status = "dead"
  }

  release(proxy) {
    this.usedToday.delete(proxy.key)
    this.saveState()
  }

  stats() {
    this._checkDay()
    return {
      total: this.proxies.length,
      fresh: this.proxies.filter((p) => p.status === "fresh").length,
      ok: this.proxies.filter((p) => p.status === "ok").length,
      dead: this.proxies.filter((p) => p.status === "dead").length,
      available: this.available,
      usedToday: this.usedToday.size,
    }
  }
}

export { ProxyPool }
