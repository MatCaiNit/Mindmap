// Realtime/server.js - FIXED RESTORE WITH LOCK
const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const mapUtils = require('y-websocket/bin/utils')
const { setupWSConnection } = mapUtils

const { authenticate } = require('./utils/auth')
const { persistence } = require('./utils/persist')
const { CONFIG } = require('./config')

// Global Map để bridge giữa API và WebSocket
if (!global.mindmapDocs) {
  global.mindmapDocs = new Map()
}
const activeDocs = global.mindmapDocs

// 🔥 NEW: Track documents being restored to prevent auto-save conflicts
const restoringDocs = new Set()

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-service-token')
  
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.method === 'POST' && req.url === '/apply-snapshot') return handleApplySnapshot(req, res)
  if (req.method === 'GET' && req.url.startsWith('/api/internal/mindmaps/')) return handleGetSnapshot(req, res)

  res.writeHead(404); res.end('Not Found')
})

const wss = new WebSocket.Server({ noServer: true })

// ==========================================
// 1. API GET SNAPSHOT
// ==========================================
async function handleGetSnapshot(req, res) {
  const headerToken = req.headers['x-service-token']
  if (!headerToken || headerToken !== CONFIG.SERVICE_TOKEN) return sendError(res, 403, 'Forbidden')

  try {
    const ydocId = req.url.split('/')[4]
    if (!ydocId) return sendError(res, 400, 'Missing ydocId')

    console.log(`\n📦 GET SNAPSHOT: ${ydocId}`)
    
    // Check if document is being restored
    if (restoringDocs.has(ydocId)) {
      console.log('⚠️ Document is being restored, returning minimal snapshot')
      // Return empty snapshot to avoid serving stale data
      return res.writeHead(404, { 'Content-Type': 'application/json' }) && res.end(JSON.stringify({ message: 'Document is being restored' }))
    }
    
    // Find in Global Map
    let ydoc = activeDocs.get(ydocId)
    
    // Fallback: Find in Library Map
    if (!ydoc && mapUtils.docs.has(ydocId)) {
       console.log(`   Found in Library Map (Fallback)`)
       ydoc = mapUtils.docs.get(ydocId)
       activeDocs.set(ydocId, ydoc)
    }

    // Persistence
    if (!ydoc) {
      console.log(`⚠️ Doc not found in RAM`)
      ydoc = new Y.Doc()
      try {
        await persistence.bindState(ydocId, ydoc)
      } catch (e) {}
    } else {
       console.log(`✅ Found active session!`)
    }

    const update = Y.encodeStateAsUpdate(ydoc)
    const encodedState = Buffer.from(update).toString('base64')
    const nodeCount = ydoc.getMap('nodes').size

    console.log(`✅ Result: ${nodeCount} nodes`)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      snapshot: {
        schemaVersion: 1,
        encodedState,
        meta: { createdBy: 'realtime', clientCount: 0 },
        stats: { nodes: nodeCount },
        createdAt: new Date().toISOString()
      }
    }))

  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
}

// ==========================================
// 2. API RESTORE (FIXED WITH LOCK)
// ==========================================
async function handleApplySnapshot(req, res) {
  const headerToken = req.headers['x-service-token']
  if (!headerToken || headerToken !== CONFIG.SERVICE_TOKEN) return sendError(res, 403, 'Forbidden')

  let body = ''
  req.on('data', chunk => { body += chunk.toString() })

  req.on('end', async () => {
    try {
      const { ydocId, snapshot } = JSON.parse(body)
      console.log(`\n📦 RESTORE SNAPSHOT: ${ydocId}`)

      if (!snapshot || !snapshot.encodedState) return sendError(res, 400, 'No data')

      // 🔥 STEP 0: SET RESTORE LOCK
      console.log('🔒 Setting restore lock...')
      restoringDocs.add(ydocId)

      // 1. Prepare data from Snapshot
      let binaryData
      try {
        const buffer = Buffer.from(snapshot.encodedState, 'base64')
        binaryData = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      } catch (e) {
        restoringDocs.delete(ydocId)
        return sendError(res, 400, 'Invalid Base64')
      }

      // 2. 🔥 FORCE DISCONNECT ALL OLD CLIENTS
      if (mapUtils.docs.has(ydocId)) {
        const oldRoom = mapUtils.docs.get(ydocId)
        console.log(`   🔌 Disconnecting ${oldRoom.conns?.size || 0} active clients...`)
        
        if (oldRoom.conns) {
          oldRoom.conns.forEach(conn => {
            try {
              if (conn.readyState === 1) { // WebSocket.OPEN
                conn.close(1000, 'Restore complete')
              }
            } catch(e) {
              console.error('   Failed to close connection:', e)
            }
          })
        }
        
        // Remove old doc
        mapUtils.docs.delete(ydocId)
      }
      
      activeDocs.delete(ydocId)

      // 3. ✨ CREATE FRESH DOC
      const newDoc = new Y.Doc()
      const newRoom = newDoc
      newRoom.conns = new Set()
      
      // 4. Apply snapshot
      try {
        Y.applyUpdate(newDoc, binaryData)
        console.log(`   ✅ Snapshot applied to FRESH doc (${newDoc.getMap('nodes').size} nodes)`)
      } catch (e) {
        console.error('   ❌ Snapshot Data is corrupted:', e.message)
        restoringDocs.delete(ydocId)
        return sendError(res, 400, 'Snapshot data corrupted')
      }

      // 5. Register new doc
      mapUtils.docs.set(ydocId, newRoom)
      activeDocs.set(ydocId, newRoom)

      // 6. 🔥 SAVE TO PERSISTENCE (Backend's Mindmap.snapshot is already updated)
      // We save here to ensure Realtime's persistence is also updated
      try {
        await persistence.writeState(ydocId, newDoc)
        console.log('   ✅ Persisted to backend')
      } catch (e) {
        console.warn('   ⚠️ Failed to persist:', e.message)
      }

      // 7. 🔥 RELEASE RESTORE LOCK after delay
      // This gives time for clients to fully disconnect before accepting new connections
      setTimeout(() => {
        restoringDocs.delete(ydocId)
        console.log('🔓 Restore lock released for:', ydocId)
      }, 2000)

      console.log(`   ✅ Restore Complete. Fresh doc ready for new connections.`)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))

    } catch (err) {
      console.error('❌ Restore Fatal Error:', err)
      
      // Clean up lock on error
      const { ydocId } = JSON.parse(body || '{}')
      if (ydocId) restoringDocs.delete(ydocId)
      
      sendError(res, 500, err.message)
    }
  })
}

// ==========================================
// 3. SETUP CONNECTION
// ==========================================
function setupWSConnectionWithTracking(ws, req, options) {
  const docName = options.docName
  
  // 🔥 CHECK RESTORE LOCK
  if (restoringDocs.has(docName)) {
    console.log(`⚠️ Rejecting connection - ${docName} is being restored`)
    ws.close(1013, 'Document is being restored, please reconnect in a moment')
    return
  }
  
  setupWSConnection(ws, req, options)

  const room = mapUtils.docs.get(docName)
  if (room) {
    activeDocs.set(docName, room)
    
    console.log(`📡 CONNECTED: ${docName} (Global map synced)`)
    
    ws.on('close', () => {
      if (room.conns.size === 0) {
        setTimeout(() => {
          const check = mapUtils.docs.get(docName)
          if (!check || check.conns.size === 0) {
             activeDocs.delete(docName)
             mapUtils.docs.delete(docName)
             console.log(`🗑️ GC: ${docName}`)
          }
        }, 30000)
      }
    })
  }
}

// ==========================================
// 4. SERVER INIT
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
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
})

function sendError(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ message: msg }))
}

server.listen(CONFIG.PORT, () => {
  console.log(`🚀 Realtime Server running at ws://localhost:${CONFIG.PORT}`)
})