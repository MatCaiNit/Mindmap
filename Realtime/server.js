const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const { setupWSConnection } = require('y-websocket/bin/utils')
const { authenticate } = require('./utils/auth')
const { persistence } = require('./utils/persist')
const { CONFIG } = require('./config')
const syncProtocol = require('y-protocols/sync')
const awarenessProtocol = require('y-protocols/awareness')
const encoding = require('lib0/encoding')
const decoding = require('lib0/decoding')

// CRITICAL: Track all Y.Docs manually
const docs = new Map()

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/apply-snapshot') {
    return handleApplySnapshot(req, res)
  }

  if (req.method === 'GET' && req.url.startsWith('/api/internal/mindmaps/')) {
    return handleGetSnapshot(req, res)
  }

  res.writeHead(404)
  res.end('Not Found')
})

const wss = new WebSocket.Server({ noServer: true })

// Get snapshot handler
async function handleGetSnapshot(req, res) {
  const headerToken = req.headers['x-service-token']
  if (!headerToken || headerToken !== CONFIG.SERVICE_TOKEN) {
    console.warn(`[Security] Unauthorized get-snapshot attempt`)
    res.writeHead(403)
    res.end(JSON.stringify({ message: 'Forbidden: Invalid Service Token' }))
    return
  }

  try {
    const parts = req.url.split('/')
    const ydocId = parts[4]

    if (!ydocId) {
      res.writeHead(400)
      res.end(JSON.stringify({ message: 'Missing ydocId' }))
      return
    }

    console.log(`📦 Get snapshot request for: ${ydocId}`)

    const room = docs.get(ydocId)
    
    if (!room || !room.doc) {
      console.log(`⚠️  No active Y.Doc found for: ${ydocId}`)
      
      const ydoc = new Y.Doc()
      try {
        await persistence.bindState(ydocId, ydoc)
        
        const update = Y.encodeStateAsUpdate(ydoc)
        const encodedState = Buffer.from(update).toString('base64')
        
        const snapshot = {
          schemaVersion: 1,
          encodedState,
          meta: {
            createdBy: 'realtime',
            reason: 'manual-save',
            clientCount: 0
          },
          createdAt: new Date().toISOString()
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ snapshot }))
        return
        
      } catch (err) {
        console.error('❌ Failed to load from persistence:', err.message)
        res.writeHead(404)
        res.end(JSON.stringify({ message: 'No snapshot found' }))
        return
      }
    }

    const update = Y.encodeStateAsUpdate(room.doc)
    const encodedState = Buffer.from(update).toString('base64')
    
    const snapshot = {
      schemaVersion: 1,
      encodedState,
      meta: {
        createdBy: 'realtime',
        reason: 'manual-save',
        clientCount: room.conns ? room.conns.size : 0
      },
      createdAt: new Date().toISOString()
    }

    console.log(`✅ Snapshot created (${encodedState.length} chars, ${room.conns?.size || 0} clients)`)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ snapshot }))

  } catch (err) {
    console.error('❌ get-snapshot error:', err)
    res.writeHead(500)
    res.end(JSON.stringify({ message: err.message }))
  }
}

// Realtime/server.js - apply-snapshot with FULL DEBUG

async function handleApplySnapshot(req, res) {
  const headerToken = req.headers['x-service-token']
  if (!headerToken || headerToken !== CONFIG.SERVICE_TOKEN) {
    console.warn(`[Security] Unauthorized apply-snapshot attempt`)
    res.writeHead(403)
    res.end(JSON.stringify({ message: 'Forbidden: Invalid Service Token' }))
    return
  }

  let body = ''
  req.on('data', chunk => { body += chunk.toString() })

  req.on('end', async () => {
    try {
      const { ydocId, snapshot } = JSON.parse(body)

      console.log('\n========================================');
      console.log('📦 APPLY SNAPSHOT - START');
      console.log('========================================');
      console.log('ydocId:', ydocId);

      if (!ydocId || !snapshot || !snapshot.encodedState) {
        console.log('❌ Invalid request');
        res.writeHead(400)
        res.end(JSON.stringify({ message: 'Missing ydocId or snapshot' }))
        return
      }

      console.log('   Snapshot size:', snapshot.encodedState.length, 'chars');
      console.log('   Meta:', snapshot.meta);

      // Decode snapshot to log content
      const newUpdate = Buffer.from(snapshot.encodedState, 'base64')
      const previewDoc = new Y.Doc()
      Y.applyUpdate(previewDoc, newUpdate)
      
      console.log('   📊 SNAPSHOT CONTENT:');
      console.log('      Nodes:', previewDoc.getMap('nodes').size);
      previewDoc.getMap('nodes').forEach((value, key) => {
        console.log(`         ${key}: ${value.label}`);
      });
      console.log('      Edges:', previewDoc.getArray('edges').length);

      let room = docs.get(ydocId)
      let ydoc

      if (room && room.doc) {
        ydoc = room.doc
        console.log(`   Using existing Y.Doc (${room.conns?.size || 0} clients)`);
        
        // Log current state before applying
        console.log('   📊 CURRENT STATE (before apply):');
        console.log('      Nodes:', ydoc.getMap('nodes').size);
        ydoc.getMap('nodes').forEach((value, key) => {
          console.log(`         ${key}: ${value.label}`);
        });
        console.log('      Edges:', ydoc.getArray('edges').length);
        
      } else {
        ydoc = new Y.Doc()
        room = { 
          doc: ydoc, 
          conns: new Map(),
          awareness: new awarenessProtocol.Awareness(ydoc)
        }
        docs.set(ydocId, room)
        console.log(`   Created new Y.Doc`);
      }

      console.log('   🔄 Applying snapshot...');

      // 🔥 CRITICAL: Clear and apply in single transaction
      Y.transact(ydoc, () => {
        // 1. Get all existing keys
        const existingKeys = Array.from(ydoc.share.keys())
        console.log(`      Deleting ${existingKeys.length} existing structures:`, existingKeys);
        
        // 2. Delete all
        existingKeys.forEach(key => {
          ydoc.share.delete(key)
        })
        
        // 3. Apply new state
        Y.applyUpdate(ydoc, newUpdate, 'restore')
        console.log(`      New state applied`);
      })

      // Log final state
      const nodesCount = ydoc.getMap('nodes').size
      const edgesCount = ydoc.getArray('edges').length
      
      console.log('   📊 FINAL STATE (after apply):');
      console.log('      Nodes:', nodesCount);
      ydoc.getMap('nodes').forEach((value, key) => {
        console.log(`         ${key}: ${value.label}`);
      });
      console.log('      Edges:', edgesCount);

      // Persist to backend
      try {
        console.log('   💾 Persisting to backend...');
        await persistence.writeState(ydocId, ydoc)
        console.log('   ✅ Persisted');
      } catch (persistErr) {
        console.error('   ❌ Persist failed:', persistErr.message);
      }

      // Broadcast to clients
      if (room && room.conns && room.conns.size > 0) {
        console.log(`   📡 Broadcasting to ${room.conns.size} clients...`);
        
        let successCount = 0
        let failCount = 0

        room.conns.forEach((_, conn) => {
          if (conn.readyState === WebSocket.OPEN) {
            try {
              const encoder = encoding.createEncoder()
              encoding.writeVarUint(encoder, 0) // messageSync
              syncProtocol.writeSyncStep2(encoder, ydoc)
              const syncMessage = encoding.toUint8Array(encoder)
              
              conn.send(syncMessage, { binary: true })
              successCount++
            } catch (err) {
              console.error(`      ❌ Failed to send:`, err.message)
              failCount++
            }
          }
        })
        
        console.log(`      ✅ Sent to ${successCount} clients`);
        if (failCount > 0) {
          console.log(`      ⚠️  Failed: ${failCount} clients`);
        }
      } else {
        console.log(`   ⚠️  No active connections`);
      }

      console.log('========================================');
      console.log('✅ APPLY SNAPSHOT - COMPLETE');
      console.log('========================================\n');

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        ok: true,
        stats: {
          nodes: nodesCount,
          edges: edgesCount,
          clients: room.conns?.size || 0
        }
      }))

    } catch (err) {
      console.error('❌ apply-snapshot error:', err)
      console.error('   Stack:', err.stack);
      res.writeHead(500)
      res.end(JSON.stringify({ message: err.message }))
    }
  })
}

// Custom setupWSConnection wrapper to track docs
function setupWSConnectionWithTracking(ws, req, options) {
  const docName = options.docName
  
  // Get or create room
  if (!docs.has(docName)) {
    const ydoc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(ydoc)
    docs.set(docName, {
      doc: ydoc,
      conns: new Map(),
      awareness
    })
  }
  
  const room = docs.get(docName)
  
  // Setup connection with the existing doc
  setupWSConnection(ws, req, {
    ...options,
    doc: room.doc // Use existing doc instead of creating new one
  })
  
  // Track connection
  room.conns.set(ws, true)
  
  console.log(`📡 Client connected to ${docName} (${room.conns.size} total)`)
  
  // Cleanup on disconnect
  ws.on('close', () => {
    const room = docs.get(docName)
    if (room) {
      room.conns.delete(ws)
      console.log(`📡 Client disconnected from ${docName} (${room.conns.size} remaining)`)
      
      // Cleanup empty rooms after 5 minutes
      if (room.conns.size === 0) {
        setTimeout(() => {
          const room = docs.get(docName)
          if (room && room.conns.size === 0) {
            docs.delete(docName)
            console.log(`🗑️  Cleaned up empty room: ${docName}`)
          }
        }, 5 * 60 * 1000)
      }
    }
  })
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
      ws.role = ctx.role

      setupWSConnectionWithTracking(ws, req, {
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
  console.log(`📡 HTTP API available at http://localhost:${CONFIG.PORT}`)
})