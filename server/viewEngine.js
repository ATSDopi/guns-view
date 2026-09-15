// View engine — calls the gunsview Python service (nodriver/Edge) to send
// real views to guns.lol profiles. The browser's JS solves PoW + Turnstile
// natively; we just click "click to enter".

import http from "http"

const GUNSVIEW_URL = "http://127.0.0.1:8192"

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u = new URL(`${GUNSVIEW_URL}${path}`)
    const req = http.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()))
          } catch (err) {
            reject(new Error(`invalid JSON from gunsview: ${Buffer.concat(chunks).toString().slice(0, 200)}`))
          }
        })
      },
    )
    req.on("error", reject)
    req.write(data)
    req.end()
  })
}

function get(path) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${GUNSVIEW_URL}${path}`)
    http.get(u, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()))
        } catch (err) {
          reject(new Error(`invalid JSON from gunsview`))
        }
      })
    }).on("error", reject)
  })
}

// workerId counter — each call uses a different browser profile
let workerCounter = 0

async function sendView(username, proxy) {
  const start = Date.now()
  const workerId = workerCounter++ % 4 // rotate through 4 browser profiles

  const body = { username, worker_id: workerId, timeout: 90 }
  if (proxy && proxy.url) body.proxy = proxy.url

  try {
    const result = await post("/view", body)
    return {
      ok: !!result.ok,
      error: result.ok ? null : (result.error || "unknown error"),
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      ok: false,
      error: err.message.slice(0, 120),
      durationMs: Date.now() - start,
    }
  }
}

async function closeBrowser() {
  // no-op — the Python service manages its own browsers
}

async function getBrowser() {
  // check if the service is running
  try {
    const health = await get("/health")
    return { connected: health.status === "ok", ...health }
  } catch {
    return { connected: false }
  }
}

export { sendView, closeBrowser, getBrowser }
