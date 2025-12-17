// Frontend/src/lib/yjs.js - FIXED VERSION
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:1234'

export function createYjsProvider(ydocId, token) {
  const ydoc = new Y.Doc()
  
  // 🔥 CRITICAL FIX: Clear IndexedDB cache before creating provider
  // This ensures we always get fresh data from server after restore
  const dbName = `y-indexeddb-${ydocId}`
  
  // Try to delete old IndexedDB
  if (typeof window !== 'undefined' && window.indexedDB) {
    const deleteRequest = window.indexedDB.deleteDatabase(dbName)
    
    deleteRequest.onsuccess = () => {
      console.log(`🗑️  Cleared IndexedDB cache for ${ydocId}`)
    }
    
    deleteRequest.onerror = () => {
      console.warn(`⚠️  Could not clear IndexedDB cache`)
    }
  }
  
  // Local persistence (will be populated from server)
  const indexeddbProvider = new IndexeddbPersistence(ydocId, ydoc)
  
  // WebSocket provider
  const wsProvider = new WebsocketProvider(
    WS_URL,
    ydocId,
    ydoc,
    {
      params: { token },
      connect: true,
      // 🔥 NEW: More aggressive reconnect
      maxBackoffTime: 2500,
      resyncInterval: 5000
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

// 🔥 NEW: Helper to clear IndexedDB for a specific document
export async function clearIndexedDB(ydocId) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve()
      return
    }

    const dbName = `y-indexeddb-${ydocId}`
    const request = window.indexedDB.deleteDatabase(dbName)
    
    request.onsuccess = () => {
      console.log(`✅ IndexedDB cleared: ${dbName}`)
      resolve()
    }
    
    request.onerror = () => {
      console.error(`❌ Failed to clear IndexedDB: ${dbName}`)
      reject(request.error)
    }
    
    request.onblocked = () => {
      console.warn(`⚠️  IndexedDB delete blocked: ${dbName}`)
      // Force close any open connections
      setTimeout(() => resolve(), 1000)
    }
  })
}