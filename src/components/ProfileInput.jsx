import { useState } from "react"
import { Icon } from "./Icon"

function parseProfile(value) {
  const v = value.trim()
  if (!v) return null
  // accept https://guns.lol/user, guns.lol/user, or just "user"
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?guns\.lol\/([A-Za-z0-9_.-]+)\/?$/i)
  if (m) return m[1]
  if (/^[A-Za-z0-9_.-]+$/.test(v) && !v.includes("/")) return v
  return null
}

export function ProfileInput({ profile, setProfile, proxyUrl, setProxyUrl }) {
  const [raw, setRaw] = useState(profile ? `guns.lol/${profile}` : "")
  const [touched, setTouched] = useState(false)

  const parsed = parseProfile(raw)
  const valid = parsed !== null
  const showErr = touched && raw && !valid

  function commit(v) {
    setRaw(v)
    const p = parseProfile(v)
    setProfile(p)
  }

  return (
    <section className="rounded-2xl border border-line bg-panel/60 backdrop-blur-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="user" size={16} className="text-violet" />
        <h2 className="text-[13px] font-semibold tracking-wide text-white uppercase">
          Profil cible
        </h2>
      </div>

      <label className="block text-[11px] text-text-faint font-mono mb-2">
        guns.lol username ou URL complète
      </label>

      <div
        className={`flex items-center gap-2 rounded-xl border bg-ink-2/70 px-3 transition-colors ${
          showErr
            ? "border-bad/60"
            : valid
              ? "border-violet/50 focus-within:border-violet"
              : "border-line focus-within:border-violet/50"
        }`}
      >
        <Icon name="link" size={16} className="text-text-faint shrink-0" />
        <input
          value={raw}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="ex: guns.lol/username"
          className="flex-1 bg-transparent py-3 text-[14px] text-white placeholder:text-text-faint outline-none font-mono"
          spellCheck={false}
          autoCapitalize="off"
        />
        {valid && (
          <span className="flex items-center gap-1 text-[11px] text-good font-mono">
            <Icon name="check" size={14} /> ok
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] font-mono">
        {parsed ? (
          <span className="text-text-dim">
            cible → <span className="text-violet">guns.lol/{parsed}</span>
          </span>
        ) : showErr ? (
          <span className="text-bad">format invalide</span>
        ) : (
          <span className="text-text-faint">en attente d'un username…</span>
        )}
        {parsed && (
          <a
            href={`https://guns.lol/${parsed}`}
            target="_blank"
            rel="noreferrer"
            className="text-text-faint hover:text-violet transition-colors"
          >
            ouvrir ↗
          </a>
        )}
      </div>

      {/* Proxy résidentiel (optionnel) */}
      <label className="block text-[11px] text-text-faint font-mono mt-5 mb-2">
        proxy résidentiel (optionnel — utilise {"{session}"} pour rotation d'IP)
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-2/70 px-3 focus-within:border-violet/50 transition-colors">
        <Icon name="globe" size={16} className="text-text-faint shrink-0" />
        <input
          value={proxyUrl || ""}
          onChange={(e) => setProxyUrl?.(e.target.value)}
          placeholder="http://user:pass_{session}@geo.iproyal.com:12321"
          className="flex-1 bg-transparent py-3 text-[13px] text-white placeholder:text-text-faint outline-none font-mono"
          spellCheck={false}
          autoCapitalize="off"
        />
        {proxyUrl ? (
          <span className="text-[11px] text-good font-mono">rotation</span>
        ) : (
          <span className="text-[11px] text-text-faint font-mono">direct</span>
        )}
      </div>
      <p className="mt-1.5 text-[10px] text-text-faint font-mono">
        sans proxy: 1 vue/IP · avec proxy résidentiel: 1 vue/IP différente à chaque fois
      </p>
    </section>
  )
}
