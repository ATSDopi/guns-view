// Proxy harvester — pulls public SOCKS5/HTTP proxy lists from the same
// GitHub sources as the Krypt VPN project. Each source is a raw text file
// with one `host:port` per line.

const SOURCES = [
  { url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt", scheme: "socks5", name: "proxifly/socks5" },
  { url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt", scheme: "http", name: "proxifly/http" },
  { url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt", scheme: "socks4", name: "proxifly/socks4" },
  { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt", scheme: "socks5", name: "TheSpeedX/socks5" },
  { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt", scheme: "http", name: "TheSpeedX/http" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt", scheme: "socks5", name: "monosans/socks5" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt", scheme: "http", name: "monosans/http" },
  { url: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt", scheme: "socks5", name: "hookzof/socks5" },
  { url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAT.txt", scheme: "socks5", name: "roosterkid/socks5" },
  { url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAT.txt", scheme: "http", name: "roosterkid/http" },
  { url: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt", scheme: "socks5", name: "ShiftyTR/socks5" },
  { url: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt", scheme: "http", name: "ShiftyTR/http" },
  { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt", scheme: "socks5", name: "jetkai/socks5" },
  { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt", scheme: "http", name: "jetkai/http" },
  { url: "https://raw.githubusercontent.com/saschapeschel/proxylist/master/proxies/socks5.txt", scheme: "socks5", name: "saschapeschel/socks5" },
  { url: "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt", scheme: "http", name: "clarketm/http" },
]

const HOSTPORT = /^\s*([\w.\-]+):(\d{1,5})\s*$/
const FULLURL = /^\s*(socks5|socks4|https?):\/\/([\w.\-]+):(\d{1,5})\s*$/i

async function fetchSource(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function parseLines(text, scheme, sourceName) {
  const out = []
  for (const line of text.split("\n")) {
    // try full URL format first (proxifly): socks5://host:port
    const mUrl = line.match(FULLURL)
    if (mUrl) {
      const port = parseInt(mUrl[3], 10)
      if (port < 1 || port > 65535) continue
      out.push({ host: mUrl[2], port, scheme: mUrl[1].toLowerCase(), url: `${mUrl[1].toLowerCase()}://${mUrl[2]}:${port}`, source: sourceName })
      continue
    }
    // then host:port format
    const m = line.match(HOSTPORT)
    if (!m) continue
    const host = m[1]
    const port = parseInt(m[2], 10)
    if (port < 1 || port > 65535) continue
    out.push({ host, port, scheme, url: `${scheme}://${host}:${port}`, source: sourceName })
  }
  return out
}

async function harvest(onProgress) {
  const results = await Promise.all(
    SOURCES.map(async (src) => {
      const text = await fetchSource(src.url)
      if (!text) {
        onProgress?.(src.name, 0, "failed")
        return []
      }
      const proxies = parseLines(text, src.scheme, src.name)
      onProgress?.(src.name, proxies.length, "ok")
      return proxies
    }),
  )

  // dedupe by host:port (keep first seen)
  const seen = new Map()
  for (const list of results) {
    for (const p of list) {
      const key = `${p.host}:${p.port}`
      if (!seen.has(key)) seen.set(key, p)
    }
  }

  return [...seen.values()]
}

export { harvest, SOURCES }
