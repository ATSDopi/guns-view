import { Icon } from "./Icon"

const MODES = [
  { id: "instant", label: "Instantané", desc: "Décharge X vues avec Y threads", icon: "bolt" },
  { id: "daily", label: "Réparti / jour", desc: "X vues par jour, en continu", icon: "clock" },
  { id: "custom", label: "Custom", desc: "Vitesse manuelle, en continu", icon: "sliders" },
]

export function RateControls({ config, setConfig }) {
  const set = (patch) => setConfig({ ...config, ...patch })

  return (
    <section className="rounded-2xl border border-line bg-panel/60 backdrop-blur-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="gauge" size={16} className="text-violet" />
        <h2 className="text-[13px] font-semibold tracking-wide text-white uppercase">
          Taux de vues
        </h2>
      </div>

      {/* mode selector */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {MODES.map((m) => {
          const active = config.mode === m.id
          return (
            <button
              key={m.id}
              onClick={() => set({ mode: m.id })}
              className={`group rounded-xl border p-3 text-left transition-all ${
                active
                  ? "border-violet/60 bg-violet-deep/15 shadow-[0_0_0_1px] shadow-violet/20"
                  : "border-line bg-ink-2/40 hover:border-line hover:bg-ink-2/70"
              }`}
            >
              <Icon
                name={m.icon}
                size={16}
                className={active ? "text-violet" : "text-text-faint"}
              />
              <div className={`mt-2 text-[12px] font-semibold ${active ? "text-white" : "text-text-dim"}`}>
                {m.label}
              </div>
              <div className="text-[10px] text-text-faint mt-0.5 leading-tight">
                {m.desc}
              </div>
            </button>
          )
        })}
      </div>

      {/* mode-specific inputs */}
      {config.mode === "instant" && (
        <>
          <NumberInput
            label="Nombre de vues"
            icon="target"
            value={config.total}
            min={1}
            max={500000}
            suffix="vues"
            onChange={(v) => set({ total: v })}
          />
          <NumberInput
            label="Threads parallèles"
            icon="shield"
            value={config.concurrency}
            min={1}
            max={200}
            suffix="threads"
            onChange={(v) => set({ concurrency: v })}
          />
        </>
      )}

      {config.mode === "daily" && (
        <NumberInput
          label="Vues par jour"
          icon="clock"
          value={config.perDay}
          min={1}
          max={50000}
          suffix="vues / jour"
          onChange={(v) => set({ perDay: v })}
        />
      )}

      {config.mode === "custom" && (
        <>
          <NumberInput
            label="Vitesse"
            icon="bolt"
            value={config.perSec}
            min={1}
            max={500}
            step={1}
            suffix="vues / sec"
            onChange={(v) => set({ perSec: v })}
          />
          <NumberInput
            label="Threads parallèles"
            icon="shield"
            value={config.concurrency}
            min={1}
            max={200}
            suffix="threads"
            onChange={(v) => set({ concurrency: v })}
          />
        </>
      )}

      {/* estimated info */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-line-soft bg-ink-2/40 px-3 py-2.5 text-[11px] font-mono">
        <span className="text-text-faint">
          {config.mode === "instant" ? "durée estimée" : "intervalle"}
        </span>
        <span className="text-violet">{estimateInfo(config)}</span>
      </div>
    </section>
  )
}

function NumberInput({ label, icon, value, min, max, step = 1, suffix, onChange }) {
  return (
    <div className="mb-4">
      <label className="flex items-center gap-1.5 text-[11px] text-text-faint font-mono mb-1.5">
        <Icon name={icon} size={13} />
        {label}
      </label>
      <div className="flex items-center rounded-xl border border-line bg-ink-2/70 px-3 focus-within:border-violet/50 transition-colors">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (isNaN(v)) return
            onChange(Math.min(max, Math.max(min, v)))
          }}
          className="flex-1 bg-transparent py-2.5 text-[15px] text-white outline-none font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[11px] text-text-faint font-mono pl-2 border-l border-line ml-2">
          {suffix}
        </span>
      </div>
    </div>
  )
}

function estimateInfo(c) {
  if (c.mode === "instant") {
    const secs = Math.ceil(c.total / Math.max(c.concurrency, 1))
    if (secs < 60) return `${secs}s`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
  }
  if (c.mode === "daily") {
    const interval = 86400 / Math.max(c.perDay, 1)
    if (interval < 60) return `1 vue / ${interval.toFixed(0)}s`
    if (interval < 3600) return `1 vue / ${Math.floor(interval / 60)}m ${Math.floor(interval % 60)}s`
    return `1 vue / ${Math.floor(interval / 3600)}h ${Math.floor((interval % 3600) / 60)}m`
  }
  // custom
  const interval = 1 / Math.max(c.perSec, 1)
  if (interval < 1) return `${c.perSec} vues / sec`
  return `1 vue / ${interval.toFixed(1)}s`
}
