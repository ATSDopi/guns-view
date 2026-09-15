// Preload — minimal. The frontend talks to the backend via HTTP/WebSocket
// on localhost, so no Node APIs need to be exposed to the renderer.

const { contextBridge } = require("electron")

contextBridge.exposeInMainWorld("gunsview", {
  isElectron: true,
  version: process.versions.electron,
})
