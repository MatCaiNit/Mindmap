// ==========================================
// FILE: Frontend/src/lib/yjs.js
// ==========================================
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:1234'

export function createYjsProvider(ydocId, token) {
  const ydoc = new Y.Doc()
  
  // Local persistence
  const indexeddbProvider = new IndexeddbPersistence(ydocId, ydoc)
  
  // WebSocket provider
  const wsProvider = new WebsocketProvider(
    WS_URL,
    ydocId,
    ydoc,
    {
      params: { token },
      connect: true,
    }
  )

  // Export awareness for cursor tracking
  const awareness = wsProvider.awareness

  return {
    ydoc,
    wsProvider,
    awareness,
    indexeddbProvider,
    destroy: () => {
      wsProvider.destroy()
      indexeddbProvider.destroy()
    }
  }
}