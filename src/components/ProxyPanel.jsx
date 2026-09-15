import { useState, useEffect, useCallback } from "react"
import { Icon } from "./Icon"

export function ProxyPanel({
  proxyStats,
  harvesting,
  harvestProgress,
  testing,
  testProgress,
  onHarvest,
  onAdd,
  onTest,
  fetchProxies,
  onCountryChange,
  connected,
}) {
  const [list, setList] = useState("")
  const [adding, setAdding] = useState(false)
  const [lastAdded, setLastAdded] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const [proxies, setProxies] = useState([])
  const [listTotal, setListTotal] = useState(0)
  const [countries, setCountries] = useState([])
  const [filterCountry, setFilterCountry] = useState("")
  const [filterScheme, setFilterScheme] = useState("")
  const [filterStatus, setFilterStatus] = useState("ok")

  const listCount = list.split("\n").filter((l) => l.trim()).length

  const refresh = useCallback(async () => {
    const data = await fetchProxies({
      country: filterCountry || undefined,
      scheme: filterScheme || undefined,
      status: filterStatus || undefined,
      limit: 300,
    })
    setProxies(data.proxies)
    setListTotal(data.total)
    setCountries(data.countries)
  }, [fetchProxies, filterCountry, filterScheme, filterStatus])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  async function handleAdd() {
    if (!list.trim()) return
    setAdding(true)
    const added = await onAdd(list)
    setAdding(false)
    setLastAdded(added)
    if (added > 0) setList("")
    refresh()
  }

  const stageLabel = {
    start: "démarrage du triage…",
    tcp: "test connexion TCP",
    reach: "test guns.lol (tunnel+TLS)",
    geo: "géolocalisation",
    done: "triage terminé",
    error: "erreur",
  }

  return (
    <section className="rounded-2xl border border-line bg-panel/60 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="shield" size={16} className="text-violet" />
          <h2 className="text-[13px] font-semibold tracking-wide text-white uppercase">
            Proxies
          </h2>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? "bg-good pulse-dot" : "bg-bad"
            }`}
          />
          <span className={connected ? "text-good" : "text-bad"}>
            {connected ? "backend connecté" : "hors ligne"}
          </span>
        </span>
      </div>

      {/* stats grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <MiniStat label="total" value={proxyStats.total} />
        <MiniStat label="valides" value={proxyStats.ok} tone="good" />
        <MiniStat label="utilisés" value={proxyStats.usedToday} />
        <MiniStat label="morts" value={proxyStats.dead} tone="bad" />
      </div>

      {/* actions */}
      <div className="flex gap-2">
        <button
          onClick={onHarvest}
          disabled={harvesting || testing}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold transition-all
            border border-violet/40 text-violet bg-violet-deep/10 hover:bg-violet-deep/20
            disabled:opacity-50 disabled:cursor-wait"
        >
          <Icon name="flame" size={14} />
          {harvesting ? "récolte…" : "importer les gratuits"}
        </button>
        <button
          onClick={onTest}
          disabled={testing || harvesting}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold transition-all
            border border-violet/40 text-violet bg-violet-deep/10 hover:bg-violet-deep/20
            disabled:opacity-50 disabled:cursor-wait"
        >
          <Icon name="check" size={14} />
          {testing ? "triage…" : "tester le pool"}
        </button>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-3 rounded-xl border border-line text-text-faint hover:text-white hover:border-violet/40 transition-colors"
          title="ajouter manuellement"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      {/* manual add (collapsible) */}
      {showAdd && (
        <div className="mt-3">
          <textarea
            value={list}
            onChange={(e) => setList(e.target.value)}
            placeholder={"socks5://1.2.3.4:1080\nhttp://5.6.7.8:8080\n9.10.11.12:3128"}
            rows={4}
            spellCheck={false}
            className="w-full rounded-xl border border-line bg-ink-2/70 px-3 py-2.5 text-[11px] text-white placeholder:text-text-faint outline-none font-mono resize-y focus:border-violet/50 transition-colors"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || listCount === 0}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-[12px] font-semibold transition-all
                border border-violet/40 text-violet bg-violet-deep/10 hover:bg-violet-deep/20
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? "ajout…" : `ajouter ${listCount > 0 ? `(${listCount})` : ""}`}
            </button>
            {lastAdded !== null && (
              <span className="text-[10px] text-good font-mono">+{lastAdded} ajoutés</span>
            )}
          </div>
        </div>
      )}

      {/* harvest progress */}
      {harvesting && harvestProgress.length > 0 && (
        <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
          {harvestProgress.map((p) => (
            <div
              key={p.source}
              className="flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded bg-ink-2/40"
            >
              <span className="text-text-faint">{p.source}</span>
              <span className={p.status === "ok" ? "text-violet" : "text-bad"}>
                {p.status === "ok" ? `${p.count}` : "échec"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* test progress */}
      {testProgress && testing && (
        <div className="mt-3 rounded-xl border border-violet/30 bg-violet-deep/10 px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-violet">{stageLabel[testProgress.stage] || testProgress.stage}</span>
            <span className="text-text-faint">
              {testProgress.done != null && `${testProgress.done}/${testProgress.total}`}
            </span>
          </div>
          {testProgress.total > 0 && (
            <div className="mt-2 h-1 rounded-full bg-ink-2/60 overflow-hidden">
              <div
                className="h-full bg-violet transition-all duration-300"
                style={{ width: `${Math.round((testProgress.done / testProgress.total) * 100)}%` }}
              />
            </div>
          )}
          {testProgress.stage === "tcp" && (
            <div className="mt-1.5 text-[10px] font-mono text-text-faint">
              vivants: {testProgress.alive ?? 0}
            </div>
          )}
          {testProgress.stage === "reach" && (
            <div className="mt-1.5 text-[10px] font-mono text-good">
              compatibles guns.lol: {testProgress.working ?? 0}
            </div>
          )}
        </div>
      )}
      {testProgress?.stage === "done" && !testing && (
        <p className="mt-2 text-[10px] text-good font-mono">
          triage terminé — {testProgress.working} proxies compatibles sur {testProgress.tested} testés
        </p>
      )}

      {/* filters */}
      <div className="mt-4 flex gap-2">
        <select
          value={filterCountry}
          onChange={(e) => {
            setFilterCountry(e.target.value)
            onCountryChange?.(e.target.value)
          }}
          className="flex-1 rounded-lg border border-line bg-ink-2/70 px-2 py-1.5 text-[11px] text-white font-mono outline-none focus:border-violet/50"
        >
          <option value="">tous pays (vues)</option>
          {countries.map((c) => (
            <option key={c.countryCode} value={c.countryCode}>
              {c.country} ({c.count})
            </option>
          ))}
        </select>
        <select
          value={filterScheme}
          onChange={(e) => setFilterScheme(e.target.value)}
          className="rounded-lg border border-line bg-ink-2/70 px-2 py-1.5 text-[11px] text-white font-mono outline-none focus:border-violet/50"
        >
          <option value="">tous protos</option>
          <option value="http">http</option>
          <option value="https">https</option>
          <option value="socks5">socks5</option>
          <option value="socks4">socks4</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-line bg-ink-2/70 px-2 py-1.5 text-[11px] text-white font-mono outline-none focus:border-violet/50"
        >
          <option value="">tous statuts</option>
          <option value="ok">valides</option>
          <option value="fresh">non testés</option>
          <option value="dead">morts</option>
        </select>
      </div>

      {/* proxy table */}
      {proxies.length > 0 ? (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line-soft">
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-panel">
              <tr className="text-text-faint text-left">
                <th className="px-2 py-1.5 font-normal">proxy</th>
                <th className="px-2 py-1.5 font-normal">proto</th>
                <th className="px-2 py-1.5 font-normal">pays</th>
                <th className="px-2 py-1.5 font-normal text-right">latence</th>
                <th className="px-2 py-1.5 font-normal text-right">statut</th>
              </tr>
            </thead>
            <tbody>
              {proxies.map((p) => (
                <tr key={p.key} className="border-t border-line-soft/50">
                  <td className="px-2 py-1 text-white">{p.key}</td>
                  <td className="px-2 py-1 text-violet">{p.scheme}</td>
                  <td className="px-2 py-1 text-text-faint">{p.countryCode || "—"}</td>
                  <td className="px-2 py-1 text-right text-text-faint">
                    {p.latencyMs != null ? `${(p.latencyMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <span
                      className={
                        p.status === "ok"
                          ? "text-good"
                          : p.status === "dead"
                            ? "text-bad"
                            : "text-text-faint"
                      }
                    >
                      {p.status === "ok" ? "valide" : p.status === "dead" ? "mort" : "?"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {listTotal > proxies.length && (
            <div className="px-2 py-1.5 text-center text-[9px] text-text-faint font-mono border-t border-line-soft/50">
              {proxies.length} affichés sur {listTotal.toLocaleString("fr-FR")}
            </div>
          )}
        </div>
      ) : (
        !harvesting &&
        !testing && (
          <p className="mt-3 text-[10px] text-text-faint font-mono text-center py-3">
            aucun proxy — importe la liste gratuite pour commencer
          </p>
        )
      )}

      <p className="mt-3 text-[10px] text-text-faint font-mono leading-tight">
        1 vue par IP par jour (déduplication guns.lol). le triage teste chaque
        proxy en tunnel+TLS réel vers guns.lol — seuls les "valides" sont
        utilisés pour les vues.
      </p>
    </section>
  )
}

function MiniStat({ label, value, tone }) {
  const color =
    tone === "violet" ? "text-violet" : tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "text-white"
  return (
    <div className="rounded-lg border border-line-soft bg-ink-2/40 px-2 py-1.5 text-center">
      <div className="text-[9px] text-text-faint font-mono uppercase">{label}</div>
      <div className={`text-[14px] font-semibold tabular-nums ${color}`}>
        {value.toLocaleString("fr-FR")}
      </div>
    </div>
  )
}
