// Hook to connect the frontend to the backend via Socket.io + REST API.
// In dev (Vite) the backend is on the same origin via proxy.
// In prod (Electron, loaded from file://) the backend is on localhost:3001.

import { useEffect, useState, useCallback, useRef } from "react"
import { io } from "socket.io-client"

// Detect if we're in Electron production (file:// origin)
const isElectronProd = typeof window !== "undefined" && window.location.protocol === "file:"
const API_BASE = isElectronProd ? "http://localhost:3001" : ""
const SOCKET_URL = isElectronProd ? "http://localhost:3001" : undefined
const socket = io(SOCKET_URL || "/", { transports: ["websocket", "polling"], autoConnect: false })

export function useBackend() {
  const [connected, setConnected] = useState(false)
  const [boostState, setBoostState] = useState("idle")
  const [stats, setStats] = useState({
    sessionId: 1,
    sent: 0,
    ok: 0,
    fail: 0,
    rate: 0,
  })
  const [series, setSeries] = useState([])
  const [proxyStats, setProxyStats] = useState({
    total: 0,
    fresh: 0,
    ok: 0,
    dead: 0,
    available: 0,
    usedToday: 0,
  })
  const [harvesting, setHarvesting] = useState(false)
  const [harvestProgress, setHarvestProgress] = useState([])
  const [testing, setTesting] = useState(false)
  const [testProgress, setTestProgress] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    socket.connect()
    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    socket.on("boost:update", (data) => {
      if (data.stats) setStats(data.stats)
      if (data.series) setSeries(data.series)
      if (data.state) setBoostState(data.state)
    })

    socket.on("proxies:stats", (data) => setProxyStats(data))

    socket.on("harvest:progress", (data) => {
      setHarvestProgress((p) => {
        const next = [...p]
        const idx = next.findIndex((x) => x.source === data.source)
        if (idx >= 0) next[idx] = data
        else next.push(data)
        return next
      })
    })

    socket.on("test:progress", (data) => {
      setTestProgress(data)
      if (data.stage === "done" || data.stage === "error") setTesting(false)
      else setTesting(true)
    })

    // poll proxy stats
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/proxies/stats`)
        if (res.ok) setProxyStats(await res.json())
      } catch {}
    }, 3000)

    return () => {
      clearInterval(poll)
      socket.disconnect()
    }
  }, [])

  const harvest = useCallback(async () => {
    setHarvesting(true)
    setHarvestProgress([])
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/proxies/harvest`, { method: "POST" })
      const data = await res.json()
      if (!data.ok) setError(data.error)
      else setProxyStats(data.stats)
    } catch (e) {
      setError(e.message)
    } finally {
      setHarvesting(false)
    }
  }, [])

  const addProxies = useCallback(async (text) => {
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/proxies/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxies: text }),
      })
      const data = await res.json()
      if (!data.ok) setError(data.error)
      else setProxyStats(data.stats)
      return data.added
    } catch (e) {
      setError(e.message)
      return 0
    }
  }, [])

  const fetchProxies = useCallback(async ({ country, scheme, status, limit } = {}) => {
    const params = new URLSearchParams()
    if (country) params.set("country", country)
    if (scheme) params.set("scheme", scheme)
    if (status) params.set("status", status)
    if (limit) params.set("limit", limit)
    try {
      const res = await fetch(`${API_BASE}/api/proxies/list?${params}`)
      if (res.ok) return await res.json()
    } catch {}
    return { total: 0, proxies: [], countries: [] }
  }, [])

  const testProxies = useCallback(async () => {
    setTesting(true)
    try {
      await fetch(`${API_BASE}/api/proxies/test`, { method: "POST" })
    } catch {}
  }, [])

  const start = useCallback(async (profile, config) => {
    try {
      const res = await fetch(`${API_BASE}/api/boost/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, config }),
      })
      const data = await res.json()
      if (!data.ok) setError(data.error)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const stop = useCallback(async () => {
    await fetch(`${API_BASE}/api/boost/stop`, { method: "POST" })
  }, [])

  const reset = useCallback(async () => {
    await fetch(`${API_BASE}/api/boost/reset`, { method: "POST" })
  }, [])

  return {
    connected,
    boostState,
    stats,
    series,
    proxyStats,
    harvesting,
    harvestProgress,
    testing,
    testProgress,
    error,
    harvest,
    addProxies,
    fetchProxies,
    testProxies,
    start,
    stop,
    reset,
  }
}
