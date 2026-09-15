// Proxy tester — validates that a proxy can actually reach guns.lol.
//
// Stage 1: TCP connect to proxy (kills dead proxies fast)
// Stage 2: tunnel handshake (SOCKS5 CONNECT or HTTP CONNECT) + TLS to
//          guns.lol:443 — proves the proxy can route HTTPS to the target
// Stage 3: batch geolocation via ip-api.com (100 IPs per request, free tier)
//
// Testing runs in bounded concurrency batches with progress callbacks.

import net from "net"
import tls from "tls"

const TARGET_HOST = "guns.lol"
const TARGET_PORT = 443

// ---------- stage 1: TCP connect ----------

function tcpConnect(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const sock = new net.Socket()
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      sock.destroy()
      resolve(ok ? Date.now() - t0 : -1)
    }
    sock.setTimeout(timeoutMs)
    sock.once("connect", () => finish(true))
    sock.once("timeout", () => finish(false))
    sock.once("error", () => finish(false))
    try {
      sock.connect(port, host)
    } catch {
      finish(false)
    }
  })
}

// ---------- stage 2: tunnel + TLS to guns.lol ----------

function socks5Handshake(sock, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socks5 timeout")), timeoutMs)
    const fail = (e) => { clearTimeout(timer); reject(e) }

    sock.once("error", fail)

    // greeting: ver=5, nmethods=1, no-auth
    sock.write(Buffer.from([0x05, 0x01, 0x00]))
    sock.once("data", function onMethod(data) {
      if (data[0] !== 0x05 || data[1] !== 0x00) return fail(new Error("socks5 auth required"))
      // connect request: ver=5, cmd=connect, rsv=0, atyp=domain, addr, port
      const hostBuf = Buffer.from(TARGET_HOST, "utf8")
      const req = Buffer.concat([
        Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
        hostBuf,
        Buffer.from([TARGET_PORT >> 8, TARGET_PORT & 0xff]),
      ])
      sock.write(req)
      sock.once("data", function onReply(rep) {
        clearTimeout(timer)
        if (rep[0] === 0x05 && rep[1] === 0x00) resolve()
        else reject(new Error(`socks5 connect refused (${rep[1]})`))
      })
      sock.once("error", fail)
    })
  })
}

function httpConnect(sock, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("http connect timeout")), timeoutMs)
    const fail = (e) => { clearTimeout(timer); reject(e) }
    sock.once("error", fail)
    sock.write(`CONNECT ${TARGET_HOST}:${TARGET_PORT} HTTP/1.1\r\nHost: ${TARGET_HOST}:${TARGET_PORT}\r\n\r\n`)
    let buf = Buffer.alloc(0)
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const head = buf.toString("latin1").split("\r\n\r\n")[0]
      if (buf.includes("\r\n\r\n") || buf.length > 8192) {
        clearTimeout(timer)
        sock.off("data", onData)
        sock.off("error", fail)
        if (/^HTTP\/\d\.\d\s+2\d\d/.test(head)) resolve()
        else reject(new Error("http connect rejected"))
      }
    }
    sock.on("data", onData)
  })
}

// tunnel to guns.lol:443 then TLS handshake then GET / (checks 200/307/403 all = reachable)
function testProxyReachable(proxy, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const sock = new net.Socket()
    let finished = false
    const finish = (result) => {
      if (finished) return
      finished = true
      sock.destroy()
      resolve(result)
    }

    sock.setTimeout(timeoutMs)
    sock.once("error", () => finish({ ok: false, error: "tcp_error" }))
    sock.once("timeout", () => finish({ ok: false, error: "timeout" }))
    sock.connect(proxy.port, proxy.host, async () => {
      try {
        if (proxy.scheme === "socks5" || proxy.scheme === "socks4") {
          if (proxy.scheme === "socks4") return finish({ ok: false, error: "socks4 unsupported" })
          await socks5Handshake(sock, timeoutMs)
        } else {
          await httpConnect(sock, timeoutMs)
        }
      } catch (e) {
        return finish({ ok: false, error: e.message.slice(0, 60) })
      }

      // tunnel established — TLS handshake with guns.lol
      const tlsSock = tls.connect({
        socket: sock,
        servername: TARGET_HOST,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      })
      tlsSock.once("secureConnect", () => {
        tlsSock.write(
          `GET / HTTP/1.1\r\nHost: ${TARGET_HOST}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\nAccept: */*\r\nConnection: close\r\n\r\n`,
        )
        let buf = Buffer.alloc(0)
        const onData = (chunk) => {
          buf = Buffer.concat([buf, chunk])
          if (buf.includes("\r\n") || buf.length > 8192) {
            const line = buf.toString("latin1").split("\r\n")[0]
            const m = line.match(/^HTTP\/\d\.\d\s+(\d{3})/)
            tlsSock.destroy()
            if (m) finish({ ok: true, httpStatus: parseInt(m[1], 10), latencyMs: Date.now() - t0 })
            else finish({ ok: false, error: "no http response" })
          }
        }
        tlsSock.on("data", onData)
        tlsSock.once("error", () => finish({ ok: false, error: "tls_error" }))
        tlsSock.once("timeout", () => finish({ ok: false, error: "tls_timeout" }))
        setTimeout(() => finish({ ok: false, error: "response_timeout" }), timeoutMs)
      })
      tlsSock.once("error", () => finish({ ok: false, error: "tls_error" }))
    })
  })
}

// ---------- stage 3: geolocation (ip-api.com batch, 100 IPs/req) ----------

async function geolocate(hosts, onProgress) {
  const results = new Map()
  const unique = [...new Set(hosts)]
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    try {
      const res = await fetch("http://ip-api.com/batch?fields=status,query,country,countryCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      })
      if (res.ok) {
        const arr = await res.json()
        for (const item of arr) {
          if (item.status === "success") {
            results.set(item.query, { country: item.country, countryCode: item.countryCode })
          }
        }
      }
    } catch {}
    onProgress?.(Math.min(i + 100, unique.length), unique.length)
    // free tier: 15 req/min → 4s between requests to be safe
    if (i + 100 < unique.length) await new Promise((r) => setTimeout(r, 4200))
  }
  return results
}

// ---------- orchestrator ----------

export async function testProxies(proxies, opts = {}) {
  const {
    tcpConcurrency = 300,
    reachConcurrency = 60,
    tcpTimeout = 5000,
    reachTimeout = 15000,
    maxReach = 400, // cap stage-2 tests so it doesn't take forever
    onProgress = () => {},
    geo = true,
  } = opts

  // stage 1: fast TCP connect on everything
  const alive = []
  let done = 0
  await runPool(proxies, tcpConcurrency, async (p) => {
    const ms = await tcpConnect(p.host, p.port, tcpTimeout)
    done++
    if (ms >= 0) {
      p.tcpMs = ms
      alive.push(p)
    }
    if (done % 100 === 0 || done === proxies.length) {
      onProgress({ stage: "tcp", done, total: proxies.length, alive: alive.length })
    }
  })

  // stage 2: real tunnel+TLS to guns.lol on TCP survivors (capped)
  const toTest = alive.slice(0, maxReach)
  const working = []
  done = 0
  await runPool(toTest, reachConcurrency, async (p) => {
    const r = await testProxyReachable(p, reachTimeout)
    done++
    if (r.ok) {
      p.latencyMs = r.latencyMs
      p.httpStatus = r.httpStatus
      p.status = "ok"
      working.push(p)
    } else {
      p.status = "dead"
      p.failReason = r.error
    }
    if (done % 20 === 0 || done === toTest.length) {
      onProgress({ stage: "reach", done, total: toTest.length, working: working.length })
    }
  })
  // mark untested survivors as fresh (they may still work, just not tested)
  for (const p of alive.slice(maxReach)) p.status = "fresh"

  // stage 3: geolocate working proxies
  if (geo && working.length) {
    const geoMap = await geolocate(
      working.map((p) => p.host),
      (doneGeo, totalGeo) => onProgress({ stage: "geo", done: doneGeo, total: totalGeo }),
    )
    for (const p of working) {
      const g = geoMap.get(p.host)
      if (g) {
        p.country = g.country
        p.countryCode = g.countryCode
      }
    }
  }

  return { alive, working, tested: toTest.length }
}

async function runPool(items, concurrency, fn) {
  let idx = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const item = items[idx++]
      try {
        await fn(item)
      } catch {}
    }
  })
  await Promise.all(workers)
}
