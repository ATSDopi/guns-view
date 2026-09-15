// Express + Socket.io server — exposes the API and pushes live stats to the
// frontend via WebSocket.
//
// Exports start()/stop() so the Electron main process can control the server.
// When run directly (node server/index.js), it auto-starts.

import express from "express"
import cors from "cors"
import http from "http"
import { Server } from "socket.io"
import { fileURLToPath } from "url"
import { ProxyPool } from "./proxyPool.js"
import { BoostManager } from "./boostManager.js"
import { closeBrowser } from "./viewEngine.js"

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: "*" } })

app.use(cors())
app.use(express.json())

const pool = new ProxyPool()
const boost = new BoostManager(pool)

boost.onUpdate = (stats, series) => {
  io.emit("boost:update", { stats, series, state: boost.state })
}

// ---- REST API ----

app.get("/api/proxies/stats", (req, res) => {
  res.json(pool.stats())
})

// filtered proxy list for the UI table
app.get("/api/proxies/list", (req, res) => {
  const { country, scheme, status, limit } = req.query
  res.json({
    ...pool.list({ country, scheme, status, limit: Math.min(parseInt(limit) || 500, 2000) }),
    countries: pool.countries(),
  })
})

// run the auto-triage (TCP → tunnel+TLS to guns.lol → geo) in background
function startTesting() {
  if (pool.testing) return
  io.emit("test:progress", { stage: "start" })
  pool
    .test((p) => io.emit("test:progress", p))
    .then((r) => {
      io.emit("test:progress", { stage: "done", working: r.working, tested: r.tested })
      io.emit("proxies:stats", pool.stats())
    })
    .catch((e) => io.emit("test:progress", { stage: "error", error: e.message }))
}

app.post("/api/proxies/test", (req, res) => {
  startTesting()
  res.json({ ok: true, testing: pool.testing })
})

app.post("/api/proxies/harvest", async (req, res) => {
  try {
    const count = await pool.harvest((name, n, status) => {
      io.emit("harvest:progress", { source: name, count: n, status })
    })
    io.emit("proxies:stats", pool.stats())
    res.json({ ok: true, count, stats: pool.stats() })
    // auto-triage: verify every proxy actually reaches guns.lol
    startTesting()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post("/api/proxies/add", (req, res) => {
  const { proxies } = req.body
  if (typeof proxies !== "string") return res.status(400).json({ ok: false, error: "proxies must be a string (one per line)" })
  const added = pool.addList(proxies)
  io.emit("proxies:stats", pool.stats())
  res.json({ ok: true, added, stats: pool.stats() })
  // auto-triage the newly added proxies
  startTesting()
})

app.get("/api/boost/status", (req, res) => {
  res.json({
    state: boost.state,
    stats: boost.stats,
    series: boost.series,
    proxies: pool.stats(),
  })
})

app.post("/api/boost/start", (req, res) => {
  const { profile, config } = req.body
  if (!profile) return res.status(400).json({ ok: false, error: "no profile" })
  if (boost.state === "running") return res.status(409).json({ ok: false, error: "already running" })
  boost.start(config, profile)
  res.json({ ok: true })
})

app.post("/api/boost/stop", (req, res) => {
  boost.stop()
  res.json({ ok: true })
})

app.post("/api/boost/reset", (req, res) => {
  boost.reset()
  res.json({ ok: true })
})

// ---- WebSocket ----

io.on("connection", (socket) => {
  socket.emit("boost:update", {
    stats: boost.stats,
    series: boost.series,
    state: boost.state,
  })
  socket.emit("proxies:stats", pool.stats())
})

// ---- start/stop for Electron ----

let listening = false

function start(port = process.env.PORT || 3001) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      listening = true
      console.log(`gunsview server on http://localhost:${port}`)
      resolve({ io, server, pool, boost })
    })
  })
}

async function stop() {
  boost.stop()
  await closeBrowser()
  if (listening) {
    await new Promise((r) => server.close(r))
    listening = false
  }
}

export { start, stop, io, pool, boost }

// ---- auto-start when run directly (node server/index.js) ----

const isMain = process.argv[1] && (
  fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, "/") ||
  process.argv[1].endsWith("server/index.js") ||
  process.argv[1].endsWith("server\\index.js")
)
if (isMain) {
  start()
  process.on("SIGINT", async () => {
    console.log("\nshutting down...")
    await stop()
    process.exit(0)
  })
}
