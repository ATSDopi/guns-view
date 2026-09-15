// Electron main process — starts the backend server and the gunsview Python
// service (nodriver/Edge), then opens a window that loads the React frontend.
// In dev it points at the Vite dev server; in production it loads the built
// static files from dist/.

const { app, BrowserWindow, shell } = require("electron")
const path = require("node:path")
const { spawn } = require("node:child_process")

// crash log — packaged apps have no console, write errors to a file
const fs = require("node:fs")
const LOG = path.join(process.env.TEMP || "C:\\Temp", "gunsview-error.log")
function logErr(msg) {
  try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}
logErr("boot")
process.on("uncaughtException", (e) => logErr(`uncaught: ${e.stack}`))
process.on("unhandledRejection", (e) => logErr(`rejection: ${e?.stack || e}`))
process.on("exit", (c) => logErr(`exit code=${c}`))

const { startServer, stopServer } = require("./server-stub.cjs")

const isDev = !app.isPackaged

let mainWindow = null
let gunsviewProc = null

// ---- gunsview Python service (nodriver/Edge) ----
function startGunsviewService() {
  // find the python-service directory: in dev it's in the repo, in prod it's bundled
  const candidates = [
    path.resolve(__dirname, "..", "python-service"),
    path.resolve(process.resourcesPath || "", "python-service"),
    path.resolve(__dirname, "..", "..", "EzSolver"),
    path.resolve(process.resourcesPath || "", "EzSolver"),
  ]
  const fs = require("node:fs")
  let ezDir = null
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "gunsview_service.py"))) {
      ezDir = c
      break
    }
  }
  if (!ezDir) {
    console.error("[electron] gunsview_service.py not found in", candidates)
    return
  }

  // make sure nodriver is installed (first-run auto-install)
  ensurePythonDeps(ezDir)

  console.log("[electron] starting gunsview service from", ezDir)
  gunsviewProc = spawn("python", ["gunsview_service.py"], {
    cwd: ezDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GUNSVIEW_PORT: "8192",
      GUNSVIEW_WORKERS: "2",
    },
  })
  gunsviewProc.stdout.on("data", (d) => process.stdout.write(`[gunsview] ${d}`))
  gunsviewProc.stderr.on("data", (d) => process.stderr.write(`[gunsview] ${d}`))
  gunsviewProc.on("exit", (code) => console.log(`[electron] gunsview service exited (${code})`))
}

function stopGunsviewService() {
  if (gunsviewProc) {
    try { gunsviewProc.kill() } catch {}
    gunsviewProc = null
  }
}

// check that python + nodriver are available; auto pip install if missing
function ensurePythonDeps(ezDir) {
  const { spawnSync } = require("node:child_process")
  const check = spawnSync("python", ["-c", "import nodriver"], { stdio: "ignore" })
  if (check.status === 0) return
  console.log("[electron] nodriver missing — running pip install")
  const req = path.join(ezDir, "requirements.txt")
  const args = ["-m", "pip", "install"]
  if (require("node:fs").existsSync(req)) args.push("-r", req)
  else args.push("nodriver")
  const res = spawnSync("python", args, { stdio: "inherit" })
  if (res.status !== 0) console.error("[electron] pip install failed — python/nodriver required")
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0710",
    title: "gunsview",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // open external links in the default browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url)
      return { action: "deny" }
    }
    return { action: "allow" }
  })

  if (isDev) {
    // Vite dev server — scan ports 5173-5179 to find it
    const viteUrl = await findViteDevServer()
    await mainWindow.loadURL(viteUrl)
    mainWindow.webContents.openDevTools({ mode: "detach" })
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"))
  }
}

function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(url)
        if (res.ok) return resolve()
      } catch {}
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout waiting for " + url))
      setTimeout(check, 500)
    }
    check()
  })
}

async function findViteDevServer() {
  for (let port = 5173; port <= 5179; port++) {
    try {
      const res = await fetch(`http://localhost:${port}`)
      if (res.ok) return `http://localhost:${port}`
    } catch {}
  }
  // fallback: wait for 5173 to come up
  await waitForUrl("http://localhost:5173")
  return "http://localhost:5173"
}

app.whenReady().then(async () => {
  // writable data dir for proxy state (app.asar is read-only in production)
  process.env.GUNSVIEW_DATA_DIR = path.join(app.getPath("userData"), "data")
  // start the gunsview Python service (nodriver/Edge for real views)
  startGunsviewService()
  // start the backend server inside this process
  await startServer()
  await createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  stopServer()
  stopGunsviewService()
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", async () => {
  await stopServer()
  stopGunsviewService()
})
