// Frontend/src/lib/yjs.js - FIXED VERSION
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:1234'

/**
 * 🔥 CRITICAL FIX: Delete IndexedDB and WAIT before creating providers
 */
async function clearIndexedDBSync(ydocId) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve()
      return
    }

    const dbName = `y-indexeddb-${ydocId}`
    const deleteRequest = window.indexedDB.deleteDatabase(dbName)
    
    deleteRequest.onsuccess = () => {
      console.log(`✅ IndexedDB cleared: ${dbName}`)
      resolve()
    }
    
    deleteRequest.onerror = () => {
      console.warn(`⚠️  Failed to clear IndexedDB: ${dbName}`)
      resolve() // Continue anyway
    }
    
    deleteRequest.onblocked = () => {
      console.warn(`⚠️  IndexedDB delete blocked: ${dbName}`)
      // Force resolve after timeout
      setTimeout(() => resolve(), 1000)
    }
  })
}

/**
 * Create Yjs provider with proper cleanup
 * 🔥 NOW ASYNC to ensure IndexedDB is cleared first
 */
export async function createYjsProvider(ydocId, token) {
  const ydoc = new Y.Doc()
  
  // 🔥 STEP 1: Clear IndexedDB FIRST and WAIT
  console.log('🗑️  Clearing IndexedDB for:', ydocId)
  await clearIndexedDBSync(ydocId)
  console.log('✅ IndexedDB cleared, creating providers...')
  
  // 🔥 STEP 2: NOW create IndexedDB persistence (will be empty)
  const indexeddbProvider = new IndexeddbPersistence(ydocId, ydoc)
  
  // 🔥 STEP 3: Wait for IndexedDB to be ready
  await indexeddbProvider.whenSynced
  console.log('✅ IndexedDB persistence ready')
  
  // 🔥 STEP 4: Create WebSocket provider (will load from server)
  const wsProvider = new WebsocketProvider(
    WS_URL,
    ydocId,
    ydoc,
    {
      params: { token },
      connect: true,
      maxBackoffTime: 2500,
      resyncInterval: 5000
    }
  )

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

/**
 * Helper to clear IndexedDB for a specific document
 */
export async function clearIndexedDB(ydocId) {
  return clearIndexedDBSync(ydocId)
}