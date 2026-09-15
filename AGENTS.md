# gunsview — AGENTS.md

## Description
App desktop Electron pour booster les vues de profils guns.lol. Frontend React + Tailwind, backend Node.js, et service Python (nodriver/Edge) qui ouvre un vrai navigateur pour chaque vue — le JS de la page résout PoW + Turnstile nativement, on clique "click to enter" via un vrai événement souris CDP, et on vérifie le POST `/api/analytics/view` (status 200 + `{"message":"Success"}`).

## Stack
- Frontend: React 19 + Vite 8 + Tailwind v4
- Backend: Express 5 + Socket.io 4
- Vues: service Python `EzSolver/gunsview_service.py` (nodriver + vrai Edge, PAS headless — Turnstile détecte)
- Desktop: Electron 44 + electron-builder
- Proxies: récolte GitHub (proxifly + ~15 sources) + liste manuelle + proxy résidentiel `{session}`

## Commandes

### Dev
```bash
npm run dev:all          # Vite + backend Express
npm run electron:dev     # Vite + Electron
```

### Build / package
```bash
npm run build            # frontend seul
npm run build:app        # frontend + installeur NSIS → release/gunsview Setup X.Y.Z.exe
npx electron-builder --dir  # build rapide sans installeur → release/win-unpacked/gunsview.exe
```

### Service Python seul
```bash
cd ../EzSolver && python gunsview_service.py   # port 8192, GUNSVIEW_WORKERS=2
```

## Structure
```
electron/main.cjs     Démarre backend + service Python, fenêtre
server/index.js       Express + Socket.io (start/stop exports)
server/viewEngine.js  Appelle le service Python (POST /view sur :8192)
server/proxyPool.js   Pool + test triage + tracking 1 vue/IP/jour
server/proxyTester.js Triage: TCP → tunnel+TLS vers guns.lol → géoloc ip-api.com
server/harvester.js   Récolte proxies GitHub
server/boostManager.js Orchestrateur (instant/daily/custom)
../EzSolver/gunsview.py         Vue réelle via nodriver (clic CDP trusted)
../EzSolver/gunsview_service.py Service HTTP :8192 (file d'attente, workers)
```

## Pièges connus
- **`ELECTRON_RUN_AS_NODE=1`**: si défini (env user/shell), Electron tourne en mode Node et l'app se ferme silencieusement. Supprimé des env vars utilisateur — si ça revient, `[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE',$null,'User')`.
- **Port 3001 occupé**: un ancien backend Node qui traîne fait crasher le démarrage packagé. `taskkill //F //IM node.exe` avant de relancer.
- **EPERM sur release/**: gunsview.exe qui tourne verrouille le dossier. Tuer gunsview.exe avant electron-builder.
- **Logs crash app packagée**: `%TEMP%\gunsview-error.log`.
- **Dédup guns.lol**: 1 vue comptée par IP/jour — les vues directes répétées retournent 200 mais ne comptent pas. D'où les proxies.
- **Proxies gratuits**: ~5-15% passent le test tunnel+TLS. Le triage filtre automatiquement.
- **App packagée**: `server/` est asarUnpack'd, l'état proxy s'écrit dans `userData/data` (env GUNSVIEW_DATA_DIR), EzSolver est copié dans `resources/EzSolver`, profils navigateur dans `%TEMP%\gunsview_profile_*`.

## Dépendances machine
- Python 3 + `pip install -r EzSolver/requirements.txt` (nodriver) — auto-install au 1er lancement
- Microsoft Edge installé
