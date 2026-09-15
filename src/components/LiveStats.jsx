import { Icon } from "./Icon"

export function LiveStats({ status, start, stop, reset, stats, config, profile, hasTotal, targetTotal }) {
  const ready = profile && status !== "running"
  const pct = hasTotal && targetTotal ? Math.min(100, (stats.sent / targetTotal) * 100) : 0

  return (
    <section className="rounded-2xl border border-line bg-panel/60 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="power" size={16} className="text-violet" />
          <h2 className="text-[13px] font-semibold tracking-wide text-white uppercase">
            Contrôle
          </h2>
        </div>
        <span className="text-[11px] font-mono text-text-faint">
          session #{stats.sessionId}
        </span>
      </div>

      {/* big counter */}
      <div className="rounded-2xl border border-line-soft bg-ink-2/50 p-5 mb-4">
        <div className="text-[11px] text-text-faint font-mono mb-1">vues envoyées</div>
        <div className="text-4xl font-semibold text-white tabular-nums tracking-tight">
          {stats.sent.toLocaleString("fr-FR")}
        </div>
        {hasTotal ? (
          <>
            <div className="mt-3 h-1.5 rounded-full bg-line-soft overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-deep to-violet-glow transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-text-faint">
              <span>{pct.toFixed(1)}%</span>
              <span>{targetTotal.toLocaleString("fr-FR")} cible</span>
            </div>
          </>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-text-faint">
            <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-violet"></span>
            <span>en continu — pas de cible</span>
          </div>
        )}
      </div>

      {/* stat grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="vitesse" value={stats.rate.toFixed(1)} unit="/s" />
        <Stat label="réussies" value={stats.ok.toLocaleString("fr-FR")} unit="" tone="good" />
        <Stat label="échouées" value={stats.fail.toLocaleString("fr-FR")} unit="" tone="bad" />
      </div>

      {/* proxy pool info */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="proxies dispo" value={stats.proxyPool.toLocaleString("fr-FR")} unit="" />
        <Stat label="proxies utilisés" value={stats.proxiesUsed.toLocaleString("fr-FR")} unit="" tone="violet" />
      </div>

      {/* buttons */}
      <div className="flex gap-2">
        {status !== "running" ? (
          <button
            onClick={start}
            disabled={!ready}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              enabled:bg-gradient-to-r enabled:from-violet-deep enabled:to-violet-2
              enabled:text-white enabled:shadow-lg enabled:shadow-violet-deep/30 enabled:hover:brightness-110"
          >
            <Icon name="play" size={16} />
            {status === "paused" ? "Reprendre" : "Démarrer"}
          </button>
        ) : (
          <button
            onClick={stop}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold
              border border-warn/40 text-warn bg-warn/10 hover:bg-warn/20 transition-colors"
          >
            <Icon name="stop" size={16} />
            Arrêter
          </button>
        )}
        <button
          onClick={reset}
          disabled={status === "running"}
          className="grid place-items-center w-12 rounded-xl border border-line text-text-dim
            hover:text-white hover:border-line transition-colors disabled:opacity-30"
          title="Réinitialiser"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>

      {!profile && (
        <p className="mt-3 text-[11px] text-text-faint font-mono text-center">
          renseigne un profil pour activer le démarrage
        </p>
      )}
    </section>
  )
}

function Stat({ label, value, unit, tone }) {
  const color =
    tone === "good" ? "text-good"
    : tone === "bad" ? "text-bad"
    : tone === "violet" ? "text-violet"
    : "text-white"
  return (
    <div className="rounded-xl border border-line-soft bg-ink-2/40 px-3 py-2.5">
      <div className="text-[10px] text-text-faint font-mono">{label}</div>
      <div className={`text-[16px] font-semibold tabular-nums ${color}`}>
        {value}
        <span className="text-[10px] text-text-faint ml-0.5">{unit}</span>
      </div>
    </div>
  )
}
