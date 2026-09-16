# gunsview

Desktop app (Electron) that automates profile views on [guns.lol](https://guns.lol).

> **⚠️ Educational purposes only.**
> This project is a learning exercise in browser automation, anti-bot systems
> (Cloudflare Turnstile, proof-of-work), proxy management, and desktop app
> packaging. It is **not** intended to abuse or degrade the guns.lol service.
> Using automation tools may violate the target platform's Terms of Service.
> The authors are not responsible for any misuse — use at your own risk.

## What it does

- **Real browser views** — each view drives a real Microsoft Edge instance via
  [nodriver](https://github.com/ultrafunkamsterdam/nodriver). The page's own JS
  solves Cloudflare's proof-of-work and Turnstile natively; the app performs a
  trusted CDP mouse click on the "click to enter" interstitial and verifies the
  `POST /api/analytics/view` response (HTTP 200).
- **Three modes** — instant (N views, C threads), daily (N views/day,
  continuous), custom (rate-limited continuous).
- **Proxy system** — harvests ~12k free proxies from GitHub lists (proxifly,
  TheSpeedX, monosans, …), auto-triages them with a real tunnel+TLS test to
  guns.lol, geolocates survivors, and filters by country/protocol/latency.
  Also supports manual lists and residential gateways with `{session}` IP
  rotation.
- **Live dashboard** — violet/black UI, real-time stats via Socket.io,
  history charts.

## Architecture

```
gunsview.exe (Electron)
 ├─ React/Vite frontend        → dist/ (packaged)
 ├─ Node backend (:3001)       → Express + Socket.io, proxy pool, boost manager
 └─ python-service (:8192)     → nodriver + Edge, trusted CDP click, request capture
```

## Requirements

- Windows 10/11
- Python 3.10+ (`nodriver` auto-installs on first launch via pip)
- Microsoft Edge

## Install

Download `gunsview.Setup.X.Y.Z.exe` from
[Releases](https://github.com/ATSDopi/guns-view/releases) and run it.

## Dev

```bash
npm install
npm run dev:all        # Vite + backend
npm run electron:dev   # + Electron window
npm run build:app      # build installer → release/
```

## Known limits

- guns.lol deduplicates views by IP per day — repeated views from the same IP
  return HTTP 200 but are not counted. Proxies are required for volume.
- Free public proxies: ~5–15% pass the guns.lol compatibility test.
- Edge windows are visible (not headless) — headless is detected by Turnstile.

## License

MIT — see [LICENSE](LICENSE).
