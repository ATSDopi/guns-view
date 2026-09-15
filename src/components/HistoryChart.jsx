import { useMemo } from "react"
import { Icon } from "./Icon"

export function HistoryChart({ history }) {
  const points = history.flatMap((h) => h.series)
  const maxRate = useMemo(
    () => Math.max(10, ...points.map((p) => p.rate)),
    [points],
  )

  return (
    <section className="rounded-2xl border border-line bg-panel/60 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="chart" size={16} className="text-violet" />
          <h2 className="text-[13px] font-semibold tracking-wide text-white uppercase">
            Historique
          </h2>
        </div>
        <span className="text-[11px] font-mono text-text-faint">
          {history.length} session{history.length > 1 ? "s" : ""}
        </span>
      </div>

      {history.length === 0 ? (
        <div className="grid place-items-center h-40 text-[12px] text-text-faint font-mono">
          aucune session terminée
        </div>
      ) : (
        <>
          <AreaChart series={history[0].series} maxRate={maxRate} />

          {/* session list */}
          <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-lg border border-line-soft bg-ink-2/40 px-3 py-2 text-[11px] font-mono"
              >
                <span className="text-text-faint">#{h.id}</span>
                <span className="text-violet">{h.profile}</span>
                <span className="text-white tabular-nums">
                  {h.sent.toLocaleString("fr-FR")}
                </span>
                <span className="text-text-dim">{h.duration}</span>
                <span className={`tabular-nums ${h.fail ? "text-bad" : "text-good"}`}>
                  {h.fail ? `${h.fail} err` : "ok"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function AreaChart({ series, maxRate }) {
  const W = 560
  const H = 140
  const pad = 6
  if (series.length < 2) {
    return (
      <div className="grid place-items-center h-[140px] text-[12px] text-text-faint font-mono">
        pas assez de données
      </div>
    )
  }
  const step = (W - pad * 2) / (series.length - 1)
  const xy = series.map((p, i) => {
    const x = pad + i * step
    const y = H - pad - (p.rate / maxRate) * (H - pad * 2)
    return [x, y]
  })
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H - pad} L${xy[0][0].toFixed(1)} ${H - pad} Z`

  return (
    <div className="rounded-xl border border-line-soft bg-ink-2/40 p-2 overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[140px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={pad}
            x2={W - pad}
            y1={pad + g * (H - pad * 2)}
            y2={pad + g * (H - pad * 2)}
            stroke="#221a33"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}
        <path d={area} fill="url(#vg)" />
        <path
          d={line}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {xy.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="#c4b5fd" />
        ))}
      </svg>
      <div className="flex justify-between px-1 pt-1 text-[10px] font-mono text-text-faint">
        <span>0s</span>
        <span>pic {maxRate.toFixed(0)}/s</span>
        <span>{series.length} pts</span>
      </div>
    </div>
  )
}
