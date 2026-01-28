// Realtime/server.js - FIXED: Add bindState() to trigger auto-save

const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const mapUtils = require('y-websocket/bin/utils')
const { setupWSConnection } = mapUtils

const { authenticate } = require('./utils/auth')
const { persistence } = require('./utils/persist')
const { CONFIG } = require('./config')

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

// 🔥 CRITICAL FIX: Setup persistence khi client connect
function setupWSConnectionWithTracking(ws, req, options) {
  const docName = options.docName
  
  setupWSConnection(ws, req, options)

  const room = mapUtils.docs.get(docName)
  if (room) {
    activeDocs.set(docName, room)
    console.log(`📡 CONNECTED: ${docName} (${room.conns?.size || 0} total clients)`)
    
    // 🔥 FIX: Setup auto-save khi client đầu tiên connect
    if (room.conns?.size === 1 && !room._persistenceSetup) {
      console.log('🔧 Setting up persistence for first client...')
      
      persistence.bindState(docName, room)
        .then(() => {
          room._persistenceSetup = true
          console.log(' Persistence setup complete')
        })
        .catch(err => {
          console.error(' Persistence setup failed:', err.message)
          // Vẫn setup auto-save listener dù load fail
          persistence.setupAutoSave(docName, room)
          room._persistenceSetup = true
        })
    }
    
    ws.on('close', async () => {
      console.log(`  DISCONNECTING: ${docName}`)
      console.log(`   Remaining clients: ${room.conns?.size || 0}`)
      
      // Force save nếu là client cuối
      if (room.conns?.size === 1) {
        console.log('💾 FORCE SAVE (last client disconnecting)...')
        try {
          await persistence.writeState(docName, room)
          console.log('  Final save completed')
        } catch (err) {
          console.error('  Final save failed:', err.message)
        }
      }
      
      if (room.conns?.size === 0) {
        setTimeout(() => {
          const check = mapUtils.docs.get(docName)
          if (!check || check.conns?.size === 0) {
            activeDocs.delete(docName)
            mapUtils.docs.delete(docName)
            persistence.cleanup(docName)
            console.log(`  GC: ${docName} (no clients for 30s)`)
          }
        }, 30000)
      }
    })
  }
}

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
    console.error(' Upgrade error:', err)
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
  console.log('   Auto-save:', '3 seconds after changes')
  console.log('   Force-save:', 'On last client disconnect')
  console.log('========================================\n')
})