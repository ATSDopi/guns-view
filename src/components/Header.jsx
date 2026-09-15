import { Icon } from "./Icon"

export function Header({ status }) {
  return (
    <header className="flex items-center justify-between px-6 py-5 border-b border-line/70">
      <div className="flex items-center gap-3">
        <div className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-deep to-violet-2 shadow-lg shadow-violet-deep/30">
          <Icon name="bolt" size={20} className="text-white" strokeWidth={1.8} />
        </div>
        <div className="leading-tight">
          <h1 className="text-[15px] font-semibold tracking-tight text-white">
            guns<span className="text-violet">view</span>
          </h1>
          <p className="text-[11px] text-text-faint font-mono">profile view booster</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[12px] font-mono">
        <span
          className={`pulse-dot w-2 h-2 rounded-full ${
            status === "running"
              ? "bg-good shadow-[0_0_8px] shadow-good/60"
              : status === "paused"
                ? "bg-warn"
                : "bg-text-faint"
          }`}
        />
        <span className="text-text-dim">
          {status === "running" ? "active" : status === "paused" ? "paused" : "idle"}
        </span>
      </div>
    </header>
  )
}
