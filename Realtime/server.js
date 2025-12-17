const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const mapUtils = require('y-websocket/bin/utils')
const { setupWSConnection } = mapUtils

const { authenticate } = require('./utils/auth')
const { persistence } = require('./utils/persist')
const { CONFIG } = require('./config')
const syncProtocol = require('y-protocols/sync')
const awarenessProtocol = require('y-protocols/awareness')
const encoding = require('lib0/encoding')

// Global Map để bridge giữa API và WebSocket
if (!global.mindmapDocs) {
  global.mindmapDocs = new Map()
}
const activeDocs = global.mindmapDocs

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
// 1. API GET SNAPSHOT (FIXED PROPERTY ACCESS)
// ==========================================
async function handleGetSnapshot(req, res) {
  const headerToken = req.headers['x-service-token']
  if (!headerToken || headerToken !== CONFIG.SERVICE_TOKEN) return sendError(res, 403, 'Forbidden')

  try {
    const ydocId = req.url.split('/')[4]
    if (!ydocId) return sendError(res, 400, 'Missing ydocId')

    console.log(`\n📦 GET SNAPSHOT: ${ydocId}`)
    
    // 1. Tìm trong Global Map
    let ydoc = activeDocs.get(ydocId)
    
    // 2. Fallback: Tìm trong thư viện (FIXED: Không gọi .doc nữa)
    if (!ydoc && mapUtils.docs.has(ydocId)) {
       console.log(`   Found in Library Map (Fallback)`)
       ydoc = mapUtils.docs.get(ydocId) // <--- FIX: Bản thân nó là Doc rồi
       activeDocs.set(ydocId, ydoc)
    }

    // 3. Persistence
    if (!ydoc) {
      console.log(`⚠️  Doc not found in RAM. keys: ${Array.from(activeDocs.keys())}`)
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
// 2. API RESTORE (CHIẾN THUẬT: ĐẬP ĐI XÂY LẠI)
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

      // 1. Chuẩn bị data từ Snapshot (Chuyển Base64 -> Uint8Array)
      let binaryData
      try {
        const buffer = Buffer.from(snapshot.encodedState, 'base64')
        binaryData = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      } catch (e) {
        return sendError(res, 400, 'Invalid Base64')
      }

      // 2. 🔥 QUAN TRỌNG: HỦY DIỆT DOC CŨ (Destroy)
      // Không cố merge vào doc cũ vì nó đang bị lỗi "Unexpected case"
      if (mapUtils.docs.has(ydocId)) {
        const oldRoom = mapUtils.docs.get(ydocId)
        console.log(`   ♻️  Destroying old corrupted doc...`)
        
        // Ngắt kết nối toàn bộ client đang vẽ để tránh conflict
        if (oldRoom.conns) {
            oldRoom.conns.forEach(conn => {
                try { conn.close() } catch(e) {}
            })
        }
        
        // Xóa sổ khỏi bộ nhớ thư viện
        mapUtils.docs.delete(ydocId)
      }
      
      // Xóa khỏi Global Map của mình
      activeDocs.delete(ydocId)

      // 3. ✨ TẠO DOC MỚI TINH (Fresh Start)
      const newDoc = new Y.Doc()
      const newRoom = newDoc // Trong thư viện này, Room chính là Doc
      newRoom.conns = new Set()
      
      // 4. Nạp dữ liệu Snapshot vào Doc mới
      try {
        Y.applyUpdate(newDoc, binaryData)
        console.log(`   ✅ Snapshot applied to FRESH doc`)
      } catch (e) {
        console.error('   ❌ Snapshot Data is corrupted:', e.message)
        return sendError(res, 400, 'Snapshot data corrupted')
      }

      // 5. Đăng ký lại vào các Map quản lý
      mapUtils.docs.set(ydocId, newRoom)
      activeDocs.set(ydocId, newRoom)

      // 6. 🔥 GHI ĐÈ XUỐNG DB (Overwrite Persistence)
      // Lúc này newDoc là sạch sẽ, nên writeState sẽ không bị lỗi Unexpected case nữa
      await persistence.writeState(ydocId, newDoc)

      console.log(`   ✅ Restore Complete. Old state wiped.`)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))

    } catch (err) {
      console.error('❌ Restore Fatal Error:', err)
      sendError(res, 500, err.message)
    }
  })
}
// ==========================================
// 3. SETUP CONNECTION (FIXED PROPERTY ACCESS)
// ==========================================
function setupWSConnectionWithTracking(ws, req, options) {
  const docName = options.docName
  setupWSConnection(ws, req, options)

  const room = mapUtils.docs.get(docName)
  if (room) {
    // FIX: room CHÍNH LÀ DOC (WSSharedDoc extends Y.Doc)
    // Không được gọi room.doc
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
    if (!ctx.hasAccess) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return }
    
    wss.handleUpgrade(req, socket, head, ws => {
      ws.user = ctx.user
      setupWSConnectionWithTracking(ws, req, { docName: ctx.docName, gc: true, persistence })
    })
  } catch (err) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy()
  }
})

function sendError(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ message: msg }))
}

server.listen(CONFIG.PORT, () => {
  console.log(`🚀 Realtime Server running at ws://localhost:${CONFIG.PORT}`)
})