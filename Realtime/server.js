// Realtime/server.js - FINAL FIX: Proper Awareness Cleanup

const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const mapUtils = require('y-websocket/bin/utils')
const { setupWSConnection } = mapUtils

const { authenticate } = require('./utils/auth')
const { persistence } = require('./utils/persist')
const { CONFIG } = require('./config')

// Global state
if (!global.mindmapDocs) {
  global.mindmapDocs = new Map()
}
const activeDocs = global.mindmapDocs

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-service-token')
  
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  
  if (req.method === 'POST' && req.url === '/broadcast-restore') {
    return handleBroadcastRestore(req, res)
  }
  
  if (req.method === 'GET' && req.url.startsWith('/api/internal/mindmaps/')) {
    return handleGetSnapshot(req, res)
  }

  res.writeHead(404); res.end('Not Found')
})

const wss = new WebSocket.Server({ noServer: true })

// ==========================================
// BROADCAST RESTORE
// ==========================================
async function handleBroadcastRestore(req, res) {
  const headerToken = req.headers['x-service-token']
  
  if (!headerToken || headerToken !== CONFIG.SERVICE_TOKEN) {
    return sendError(res, 403, 'Forbidden: Invalid service token')
  }

  let body = ''
  req.on('data', chunk => { body += chunk.toString() })

  req.on('end', async () => {
    try {
      const payload = JSON.parse(body)
      const { ydocId, snapshot } = payload

      if (!ydocId) return sendError(res, 400, 'Missing ydocId')
      if (!snapshot?.encodedState) return sendError(res, 400, 'Missing snapshot.encodedState')

      const buffer = Buffer.from(snapshot.encodedState, 'base64')
      const restoreUpdate = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      
      let ydoc = mapUtils.docs.get(ydocId)
      
      if (!ydoc) {
        ydoc = new Y.Doc()
        ydoc.conns = new Set()
        mapUtils.docs.set(ydocId, ydoc)
        activeDocs.set(ydocId, ydoc)
      }

      const nodes = ydoc.getMap('nodes')
      const edges = ydoc.getArray('edges')
      
      const restoreDoc = new Y.Doc()
      Y.applyUpdate(restoreDoc, restoreUpdate)
      const restoreNodes = restoreDoc.getMap('nodes')
      const restoreEdges = restoreDoc.getArray('edges')
      
      ydoc.transact(() => {
        const currentKeys = Array.from(nodes.keys())
        currentKeys.forEach(key => nodes.delete(key))
        
        const edgeCount = edges.length
        if (edgeCount > 0) {
          edges.delete(0, edgeCount)
        }
        
        restoreNodes.forEach((value, key) => {
          nodes.set(key, value)
        })
        
        restoreEdges.forEach((edge) => {
          edges.push([edge])
        })
      })

      try {
        await persistence.writeState(ydocId, ydoc)
      } catch (persistErr) {
        console.warn('⚠️ Persist failed:', persistErr.message)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        ok: true,
        clientsNotified: ydoc.conns?.size || 0,
        restored: {
          nodes: nodes.size,
          edges: edges.length
        }
      }))

    } catch (err) {
      console.error('❌ BROADCAST RESTORE ERROR:', err)
      sendError(res, 500, 'Internal error: ' + err.message)
    }
  })
}

// ==========================================
// GET SNAPSHOT
// ==========================================
async function handleGetSnapshot(req, res) {
  const headerToken = req.headers['x-service-token']
  if (!headerToken || headerToken !== CONFIG.SERVICE_TOKEN) {
    return sendError(res, 403, 'Forbidden')
  }

  try {
    const ydocId = req.url.split('/')[4]
    if (!ydocId) return sendError(res, 400, 'Missing ydocId')
    
    let ydoc = activeDocs.get(ydocId) || mapUtils.docs.get(ydocId)

    if (!ydoc) {
      ydoc = new Y.Doc()
      try {
        await persistence.bindState(ydocId, ydoc)
      } catch (e) {
        console.log('⚠️ Persistence load failed:', e.message)
      }
    }

    const update = Y.encodeStateAsUpdate(ydoc)
    const encodedState = Buffer.from(update).toString('base64')

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      snapshot: {
        schemaVersion: 1,
        encodedState,
        meta: { createdBy: 'realtime', clientCount: ydoc.conns?.size || 0 },
        createdAt: new Date().toISOString()
      }
    }))

  } catch (err) {
    console.error('❌ Get snapshot error:', err)
    sendError(res, 500, err.message)
  }
}

// ==========================================
// 🔥 WEBSOCKET CONNECTION - SIMPLIFIED AWARENESS
// ==========================================
function setupWSConnectionWithTracking(ws, req, options) {
  const docName = options.docName
  
  setupWSConnection(ws, req, options)

  const room = mapUtils.docs.get(docName)
  if (room) {
    activeDocs.set(docName, room)
    console.log(`📡 CONNECTED: ${docName} (${room.conns?.size || 0} total clients)`)
    
    ws.on('close', () => {
      console.log(`❌ DISCONNECTING: ${docName}`)
      console.log(`   Remaining clients: ${room.conns?.size || 0}`)
      
      // Let y-websocket handle awareness cleanup automatically
      // No manual intervention needed
      
      if (room.conns?.size === 0) {
        setTimeout(() => {
          const check = mapUtils.docs.get(docName)
          if (!check || check.conns?.size === 0) {
            activeDocs.delete(docName)
            mapUtils.docs.delete(docName)
            console.log(`🗑️ GC: ${docName} (no clients for 30s)`)
          }
        }, 30000)
      }
    })
  }
}

// ==========================================
// SERVER INIT
// ==========================================
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
      setupWSConnectionWithTracking(ws, req, { 
        docName: ctx.docName, 
        gc: true, 
        persistence 
      })
    })
  } catch (err) {
    console.error('❌ Upgrade error:', err)
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
})

function sendError(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, message: msg }))
}

server.listen(CONFIG.PORT, () => {
  console.log('\n========================================')
  console.log('🚀 Realtime Server Started')
  console.log('========================================')
  console.log('   URL:', `ws://localhost:${CONFIG.PORT}`)
  console.log('   Backend:', CONFIG.BACKEND_URL)
  console.log('   Service Token:', CONFIG.SERVICE_TOKEN ? '✅ SET' : '❌ NOT SET')
  console.log('========================================\n')
})