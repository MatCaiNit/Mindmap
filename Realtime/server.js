const http = require('http')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')
const { authenticate } = require('./utils/auth')
const { persistence } = require('./utils/persist')
const { CONFIG } = require('./config')

const server = http.createServer()
const wss = new WebSocket.Server({ noServer: true })

server.on('upgrade', async (req, socket, head) => {
  try {
    const ctx = await authenticate(req)

    if (!ctx.hasAccess) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, ws => {
      ws.user = ctx.user
      ws.role = ctx.role

      setupWSConnection(ws, req, {
        docName: ctx.docName,
        gc: true,
        persistence
      })
    })
  } catch (err) {
    console.error('❌ Realtime auth error:', err.message)
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
})

server.listen(CONFIG.PORT, () => {
  console.log(`🚀 Realtime Server running at ws://localhost:${CONFIG.PORT}`)
})
