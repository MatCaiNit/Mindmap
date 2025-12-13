// Realtime/server.js
import http from 'http';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import axios from 'axios';
import { createAwareness } from './utils/awareness.js';
import { CONFIG } from './config.js';
import { verifyToken } from './utils/jwt.js';
import { loadSnapshot, saveSnapshot } from './utils/persist.js';

// Map lưu trữ các Yjs documents đang active
const docs = new Map();

// Debounce timers cho mỗi document
const saveTimers = new Map();

// Helper: Đọc body JSON
const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}); } 
    catch (e) { reject(e); }
  });
  req.on('error', reject);
});

// Lấy hoặc tạo Yjs document
async function getYDoc(docName) {
  if (!docs.has(docName)) {
    const ydoc = new Y.Doc();
    
    // Load snapshot từ DB
    const snapshot = await loadSnapshot(docName);
    if (snapshot) {
      Y.applyUpdate(ydoc, snapshot);
    }
    if (!snapshot) {
      console.log(`[Persist] ℹ️  No snapshot found for ${docName}`);
    }
    const awareness = createAwareness(ydoc);

    // Lắng nghe thay đổi để auto-save
    ydoc.on('update', () => {
      debouncedSave(docName, ydoc);
    });

    docs.set(docName, {ydoc, awareness});
    console.log(`[YDoc] Created new document: ${docName}`);
  }
  return docs.get(docName);
}

// Debounced save với throttle
function debouncedSave(docName, ydoc) {
  const MAX_DOC_SIZE = 5 * 1024 * 1024; // 5MB
  const currentSize = Y.encodeStateAsUpdate(ydoc).length;

  if (currentSize > MAX_DOC_SIZE) {
    console.warn(`[Security] Doc too large: ${docName} (${currentSize} bytes)`);
    return;
  }
  const timer = saveTimers.get(docName);
  
  if (timer) {
    clearTimeout(timer.timeoutId);
  }

  const now = Date.now();
  const lastSaved = timer?.lastSaved || 0;
  const MIN_INTERVAL = 5000; // 5 giây

  // Force save nếu đã quá MIN_INTERVAL
  if (now - lastSaved > MIN_INTERVAL) {
    saveSnapshot(docName, ydoc);
    saveTimers.set(docName, { lastSaved: now, timeoutId: null });
    return;
  }

  // Debounce thông thường
  const timeoutId = setTimeout(() => {
    saveSnapshot(docName, ydoc);
    saveTimers.set(docName, { lastSaved: Date.now(), timeoutId: null });
  }, CONFIG.DEBOUNCE_MS);

  saveTimers.set(docName, { lastSaved, timeoutId });
}

// Cleanup document khi không còn connection
function cleanupDoc(docName) {
  const entry = docs.get(docName);
  if (!entry) return;

  const { ydoc } = entry;

  saveSnapshot(docName, ydoc);

  const timer = saveTimers.get(docName);
  if (timer?.timeoutId) clearTimeout(timer.timeoutId);
  saveTimers.delete(docName);

  ydoc.destroy();
  docs.delete(docName);

  console.log(`[YDoc] Cleaned up document: ${docName}`);
}


// Track số connections cho mỗi document
const connectionCounts = new Map();

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-service-token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); 
    res.end(); 
    return;
  }

  // API: Health Check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'Realtime Server',
      activeRooms: docs.size,
      rooms: Array.from(docs.keys())
    }));
    return;
  }

  // API: Restore Snapshot (Hot Reload)
  if (req.url === '/apply-snapshot' && req.method === 'POST') {
    try {
      const token = req.headers['x-service-token'];
      if (token !== CONFIG.SERVICE_TOKEN) {
        console.warn(`[Security] Unauthorized restore attempt from ${req.socket.remoteAddress}`);
        res.writeHead(403);
        res.end(JSON.stringify({ message: 'Forbidden: Invalid Service Token' }));
        return;
      }

      const { ydocId, snapshot } = await readBody(req);
      if (!ydocId || !snapshot) {
        res.writeHead(400);
        res.end(JSON.stringify({ message: 'Missing ydocId or snapshot' }));
        return;
      }

      const entry = docs.get(ydocId);

      if (entry) {
        const { ydoc } = entry;
        const binary = Uint8Array.from(Buffer.from(snapshot, 'base64'));

        ydoc.transact(() => {
          Object.keys(ydoc.share).forEach(key => {
            const type = ydoc.get(key);
            if (type instanceof Y.Map) type.clear();
            else if (type instanceof Y.Array) type.delete(0, type.length);
            else if (type instanceof Y.Text) type.delete(0, type.length);
            else if (type instanceof Y.XmlFragment) type.delete(0, type.length);
          });

          Y.applyUpdate(ydoc, binary);
        });

        console.log(`[Restore] ✅ Hot restored active room: ${ydocId}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, status: 'hot_restored' }));
      } else {
        // Cold restore: Room không active, DB đã được update
        console.log(`[Restore] ℹ️  Room inactive, DB updated: ${ydocId}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, status: 'cold_restored' }));
      }
    } catch (err) {
      console.error('[Restore Error]', err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404 Not Found
  res.writeHead(404);
  res.end(JSON.stringify({ message: 'Not Found' }));
});

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

// Xử lý Upgrade HTTP -> WebSocket
server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  // URL format: ws://host:1234/my-doc-id?token=...
  const docName = url.pathname.slice(1);
  const token = url.searchParams.get('token');

  if (!docName || !token) {
    console.warn(`[Auth] Missing docName or token from ${socket.remoteAddress}`);
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  // Validate JWT Token
  const user = verifyToken(token);
  if (!user) {
    console.warn(`[Auth] Invalid token for doc: ${docName}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Verify quyền truy cập mindmap
  let role = 'viewer';
  try {
    console.log(`${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/verify-access`);
    const response = await axios.post(
      `${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/verify-access`,
      { action: 'write' } ,
      {
        headers: {
          'x-service-token': CONFIG.SERVICE_TOKEN,
          'x-user-id': user.id || user._id || user.sub,
          'Authorization': `Bearer ${token}` 
        },
        timeout: 3000
      }
    );

    if (!response.data.hasAccess) {
      console.warn(`[Access] User ${user.email} denied access to ${docName}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    role = response.data.role;
    console.log(`[Access] ✅ User ${user.email} granted ${response.data.role} access to ${docName}`);
  } catch (err) {
    console.error(`[Access Check Failed] ${docName}:`, err.message);
    console.error(`[Access Check Failed] ${docName}:`, err.response?.status, err.response?.data);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
    return;
  }

  // Chấp nhận kết nối
  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.user = user;
    ws.docName = docName;
    ws.role = role;
    ws.clientId = Math.floor(Math.random() * 1e9); // ADD
    wss.emit('connection', ws, request);
  });
});

// Xử lý WebSocket connection
wss.on('connection', async (ws, req) => {
  const docName = ws.docName;
  const user = ws.user;

  console.log(`[Conn] ✅ User: ${user?.email || 'Anonymous'} -> Room: ${docName}`);

  // Tăng connection count
  connectionCounts.set(docName, (connectionCounts.get(docName) || 0) + 1);

  // Lấy hoặc tạo Yjs document
  const {ydoc, awareness} = await getYDoc(docName);
  let lastAwarenessTime = 0;

  // Gửi full sync khi client kết nối
  const syncMessage = Y.encodeStateAsUpdate(ydoc);
  ws.send(createSyncMessage(syncMessage));

  // Lắng nghe tin nhắn từ client
  ws.on('message', (data) => {
    try {
      const message = new Uint8Array(data);
      
      // Kiểm tra message type (Yjs protocol)
      const messageType = message[0];
      
      if (messageType === 0) {
        // Sync Step 1: Client gửi state vector
        const stateVector = Y.decodeStateVector(message.slice(1));
        const update = Y.encodeStateAsUpdate(ydoc, stateVector);
        ws.send(createSyncMessage(update));
      } else if (messageType === 1) {
        // Sync Step 2: Apply update từ client
        const update = message.slice(1);
        Y.applyUpdate(ydoc, update);
        
        // Broadcast tới các clients khác
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === 1 && client.docName === docName) {
            client.send(createUpdateMessage(update));
          }
        });
      } else if (messageType === 2) {
        // Awareness update (cursor position, user presence, etc.)
        // Broadcast awareness tới tất cả clients trong room
        if (ws.role === 'viewer') return;
        const now = Date.now();
        if (now - lastAwarenessTime < 50) return; // rate limit 20fps
        lastAwarenessTime = now;
        awareness.applyUpdate(message.slice(1), ws.clientId);
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === 1 && client.docName === docName) {
            client.send(data);
          }
        });
      }
    } catch (err) {
      console.error('[Message Error]', err);
    }
  });

  // Xử lý disconnect
  ws.on('close', () => {
    console.log(`[Disconn] User: ${user?.email} <- Room: ${docName}`);
    awareness.removeStates([ws.clientId], null);
    // Giảm connection count
    const count = (connectionCounts.get(docName) || 1) - 1;
    
    if (count <= 0) {
      connectionCounts.delete(docName);
      // Cleanup document sau 30s không có connection
      setTimeout(() => {
        if (!connectionCounts.has(docName)) {
          cleanupDoc(docName);
        }
      }, 30000);
    } else {
      connectionCounts.set(docName, count);
    }
  });

  ws.on('error', (err) => {
    console.error('[WebSocket Error]', err);
  });
});

// Helper: Tạo sync message (message type 0)
function createSyncMessage(update) {
  const message = new Uint8Array(update.length + 1);
  message[0] = 0; // Message type: Sync
  message.set(update, 1);
  return message;
}

// Helper: Tạo update message (message type 1)
function createUpdateMessage(update) {
  const message = new Uint8Array(update.length + 1);
  message[0] = 1; // Message type: Update
  message.set(update, 1);
  return message;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Saving all documents...');
  
  // Save all active documents
  const savePromises = Array.from(docs.entries()).map(([docName, {ydoc}]) => 
    saveSnapshot(docName, ydoc)
  );
  
  await Promise.all(savePromises);
  console.log('[Shutdown] All documents saved. Exiting...');
  process.exit(0);
});

// Start Server
server.listen(CONFIG.PORT, () => {
  console.log(`🚀 Realtime Server running on port ${CONFIG.PORT}`);
  console.log(`🔗 Backend: ${CONFIG.BACKEND_URL}`);
  console.log(`🔐 Service Token: ${CONFIG.SERVICE_TOKEN ? '✅ Configured' : '❌ MISSING'}`);
  console.log(`📦 Using Yjs v2+ (manual implementation)`);
  console.log('JWT_SECRET =', process.env.JWT_SECRET);
  console.log('REALTIME_SERVICE_TOKEN is set =', process.env.REALTIME_SERVICE_TOKEN);
});