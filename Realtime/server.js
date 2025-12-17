// Realtime/server.js - FIXED: Proper Y.Doc State Replacement

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
  
  // Route handlers
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
// 🔥 FIXED BROADCAST RESTORE
// ==========================================
async function handleBroadcastRestore(req, res) {
  const headerToken = req.headers['x-service-token']
  
  console.log('\n========================================')
  console.log('🔄 BROADCAST RESTORE REQUEST')
  console.log('========================================')
  
  if (!headerToken || headerToken !== CONFIG.SERVICE_TOKEN) {
    console.error('❌ UNAUTHORIZED')
    return sendError(res, 403, 'Forbidden: Invalid service token')
  }

  let body = ''
  req.on('data', chunk => { body += chunk.toString() })

  req.on('end', async () => {
    try {
      const payload = JSON.parse(body)
      const { ydocId, snapshot } = payload
      
      console.log('📋 Payload:')
      console.log('   ydocId:', ydocId)
      console.log('   snapshot.encodedState length:', snapshot?.encodedState?.length || 0)

      // Validation
      if (!ydocId) return sendError(res, 400, 'Missing ydocId')
      if (!snapshot?.encodedState) return sendError(res, 400, 'Missing snapshot.encodedState')

      // 1️⃣ Decode snapshot
      console.log('\n📥 Decoding snapshot...')
      const buffer = Buffer.from(snapshot.encodedState, 'base64')
      const restoreUpdate = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      console.log('✅ Decoded:', restoreUpdate.length, 'bytes')
      
      // 2️⃣ Preview restore content
      console.log('\n🔍 Preview restore content...')
      const previewDoc = new Y.Doc()
      Y.applyUpdate(previewDoc, restoreUpdate)
      const previewNodes = previewDoc.getMap('nodes')
      const previewEdges = previewDoc.getArray('edges')
      
      console.log('📊 Will restore:')
      console.log('   Nodes:', previewNodes.size)
      previewNodes.forEach((value, key) => {
        console.log(`      ${key}: "${value.label || value.data?.label || 'Untitled'}"`)
      })
      console.log('   Edges:', previewEdges.length)

      // 3️⃣ Get or create document
      console.log('\n📚 Getting document...')
      let ydoc = mapUtils.docs.get(ydocId)
      
      if (!ydoc) {
        console.log('⚠️ No active document, creating new one')
        ydoc = new Y.Doc()
        ydoc.conns = new Set()
        mapUtils.docs.set(ydocId, ydoc)
        activeDocs.set(ydocId, ydoc)
      } else {
        console.log('✅ Found active document')
        console.log('   Connected clients:', ydoc.conns?.size || 0)
      }

      // 4️⃣ Log current state
      const nodes = ydoc.getMap('nodes')
      const edges = ydoc.getArray('edges')
      
      console.log('\n📊 Current state (before restore):')
      console.log('   Nodes:', nodes.size)
      nodes.forEach((value, key) => {
        console.log(`      ${key}: "${value.label || value.data?.label || 'Untitled'}"`)
      })
      console.log('   Edges:', edges.length)

      // 5️⃣ 🔥 ALTERNATIVE APPROACH: Manual replacement
      console.log('\n🔥 MANUALLY REPLACING STATE...')
      
      // Decode restore state to get actual data
      const restoreDoc = new Y.Doc()
      Y.applyUpdate(restoreDoc, restoreUpdate)
      const restoreNodes = restoreDoc.getMap('nodes')
      const restoreEdges = restoreDoc.getArray('edges')
      
      console.log('   📦 Restore has:', restoreNodes.size, 'nodes,', restoreEdges.length, 'edges')
      
      // Apply changes in ONE transaction (broadcasts to all clients)
      ydoc.transact(() => {
        console.log('   🗑️ Clearing current nodes...')
        
        // Delete all current nodes
        const currentKeys = Array.from(nodes.keys())
        currentKeys.forEach(key => {
          nodes.delete(key)
        })
        
        // Delete all current edges
        const edgeCount = edges.length
        if (edgeCount > 0) {
          edges.delete(0, edgeCount)
        }
        
        console.log('   ✅ Cleared')
        console.log('   📥 Setting restore nodes...')
        
        // Set all nodes from restore
        restoreNodes.forEach((value, key) => {
          nodes.set(key, value)
          console.log(`      Set ${key}: "${value.label || 'Untitled'}"`)
        })
        
        // Set all edges from restore
        restoreEdges.forEach((edge, index) => {
          edges.push([edge])
        })
        
        console.log('   ✅ Restore data applied')
      })

      // 6️⃣ Verify final state
      console.log('\n✅ RESTORE COMPLETE')
      console.log('📊 Final state:')
      console.log('   Nodes:', nodes.size)
      nodes.forEach((value, key) => {
        console.log(`      ${key}: "${value.label || value.data?.label || 'Untitled'}"`)
      })
      console.log('   Edges:', edges.length)
      console.log('   🌐 Broadcasted to', ydoc.conns?.size || 0, 'clients')
      
      // 🔥 VERIFICATION
      if (nodes.size !== previewNodes.size) {
        console.error('❌ VERIFICATION FAILED!')
        console.error(`   Expected: ${previewNodes.size} nodes, Got: ${nodes.size} nodes`)
        return sendError(res, 500, 'Restore verification failed')
      }

      // 7️⃣ Persist to backend
      try {
        console.log('\n💾 Persisting to backend...')
        await persistence.writeState(ydocId, ydoc)
        console.log('✅ Persisted')
      } catch (persistErr) {
        console.warn('⚠️ Persist failed:', persistErr.message)
      }

      console.log('========================================')
      console.log('✅ BROADCAST RESTORE SUCCESS')
      console.log('========================================\n')

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
      console.error('\n❌ BROADCAST RESTORE ERROR:', err)
      console.error('   Message:', err.message)
      console.error('   Stack:', err.stack)
      sendError(res, 500, 'Internal error: ' + err.message)
    }
  })

  req.on('error', (err) => {
    console.error('❌ Request error:', err)
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

    console.log(`\n📦 GET SNAPSHOT: ${ydocId}`)
    
    let ydoc = activeDocs.get(ydocId) || mapUtils.docs.get(ydocId)

    if (!ydoc) {
      console.log(`⚠️ Doc not in memory, loading from persistence`)
      ydoc = new Y.Doc()
      try {
        await persistence.bindState(ydocId, ydoc)
      } catch (e) {
        console.log('⚠️ Persistence load failed:', e.message)
      }
    }

    const update = Y.encodeStateAsUpdate(ydoc)
    const encodedState = Buffer.from(update).toString('base64')
    const nodeCount = ydoc.getMap('nodes').size

    console.log(`✅ Returning ${nodeCount} nodes`)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      snapshot: {
        schemaVersion: 1,
        encodedState,
        meta: { createdBy: 'realtime', clientCount: ydoc.conns?.size || 0 },
        stats: { nodes: nodeCount },
        createdAt: new Date().toISOString()
      }
    }))

  } catch (err) {
    console.error('❌ Get snapshot error:', err)
    sendError(res, 500, err.message)
  }
}

// ==========================================
// WEBSOCKET CONNECTION
// ==========================================
function setupWSConnectionWithTracking(ws, req, options) {
  const docName = options.docName
  
  setupWSConnection(ws, req, options)

  const room = mapUtils.docs.get(docName)
  if (room) {
    activeDocs.set(docName, room)
    console.log(`📡 CONNECTED: ${docName} (${room.conns?.size || 0} total clients)`)
    
    ws.on('close', () => {
      console.log(`❌ DISCONNECTED: ${docName} (${room.conns?.size || 0} remaining)`)
      
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