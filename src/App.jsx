import { useState } from "react"
import { Header } from "./components/Header"
import { ProfileInput } from "./components/ProfileInput"
import { RateControls } from "./components/RateControls"
import { LiveStats } from "./components/LiveStats"
import { HistoryChart } from "./components/HistoryChart"
import { ProxyPanel } from "./components/ProxyPanel"
import { useBackend } from "./hooks/useBackend"

export default function App() {
  const [profile, setProfile] = useState(null)
  const [proxyUrl, setProxyUrl] = useState("")
  const [proxyCountry, setProxyCountry] = useState("")
  const [config, setConfig] = useState({
    mode: "instant",
    total: 1000,
    perDay: 1000,
    perSec: 10,
    concurrency: 10,
  })

  const {
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
    start: backendStart,
    stop: backendStop,
    reset: backendReset,
  } = useBackend()

  const hasTotal = config.mode === "instant"
  const targetTotal = hasTotal ? config.total : null

  function start() {
    if (!profile) return
    backendStart(profile, {
      ...config,
      proxyUrl: proxyUrl || undefined,
      proxyCountry: proxyCountry || undefined,
    })
  }

  function stop() {
    backendStop()
  }

  function reset() {
    backendReset()
  }

  // build history from series for the chart (single rolling session)
  const history = stats.sent > 0
    ? [{
        id: stats.sessionId,
        profile,
        sent: stats.sent,
        fail: stats.fail,
        duration: "",
        series: series,
      }]
    : []

  return (
    <div className="min-h-screen flex flex-col">
      <Header status={boostState} />

      <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-[12px] text-bad font-mono">
            erreur: {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* left column */}
          <div className="lg:col-span-5 space-y-4">
            <ProfileInput profile={profile} setProfile={setProfile} proxyUrl={proxyUrl} setProxyUrl={setProxyUrl} />
            <RateControls config={config} setConfig={setConfig} />
            <ProxyPanel
              proxyStats={proxyStats}
              harvesting={harvesting}
              harvestProgress={harvestProgress}
              testing={testing}
              testProgress={testProgress}
              onHarvest={harvest}
              onAdd={addProxies}
              onTest={testProxies}
              fetchProxies={fetchProxies}
              onCountryChange={setProxyCountry}
              connected={connected}
            />
          </div>

          {/* right column */}
          <div className="lg:col-span-7 space-y-4">
            <LiveStats
              status={boostState}
              start={start}
              stop={stop}
              reset={reset}
              stats={{ ...stats, proxyPool: proxyStats.available, proxiesUsed: proxyStats.usedToday }}
              config={config}
              profile={profile}
              hasTotal={hasTotal}
              targetTotal={targetTotal}
            />
            <HistoryChart history={history} />
          </div>
        </div>

        <footer className="mt-8 text-center text-[10px] font-mono text-text-faint">
          gunsview · backend {connected ? "connecté" : "hors ligne"} · {proxyStats.available} proxies dispo
        </footer>
      </main>
    </div>
  )
}
