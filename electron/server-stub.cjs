// Bridge to start the ESM backend server from the CJS Electron main process.
// Uses dynamic import() which works across the CJS/ESM boundary.

let serverModule = null
let io = null

async function startServer() {
  // Import the ESM server module. We refactor index.js to export start/stop
  // instead of auto-starting, so we control it from here.
  serverModule = await import("../server/index.js")
  if (serverModule.start) {
    const result = await serverModule.start()
    io = result?.io
    console.log("[electron] backend started")
  }
}

async function stopServer() {
  if (serverModule?.stop) {
    await serverModule.stop()
    console.log("[electron] backend stopped")
  }
}

module.exports = { startServer, stopServer }
