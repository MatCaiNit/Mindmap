// Frontend/src/lib/yjs.js - NO IndexedDB, WebSocket Only

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:1234'

/**
 * Create Yjs provider WITHOUT IndexedDB
 * Only WebSocket for real-time sync
 */
export async function createYjsProvider(ydocId, token) {
  console.log('\n========================================')
  console.log('🔌 CREATE YJS PROVIDER')
  console.log('========================================')
  console.log('Document ID:', ydocId)
  console.log('Mode: WebSocket ONLY (no IndexedDB)')
  
  // Create Y.Doc
  const ydoc = new Y.Doc()
  console.log('✅ Y.Doc created')
  
  // Create WebSocket provider ONLY
  console.log('🌐 Creating WebSocket provider...')
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

  // Event handlers
  wsProvider.on('status', ({ status }) => {
    console.log(`📡 WebSocket Status: ${status}`)
  })

  wsProvider.on('sync', (isSynced) => {
    console.log(`🔄 WebSocket Sync: ${isSynced}`)
    if (isSynced) {
      const nodes = ydoc.getMap('nodes')
      const edges = ydoc.getArray('edges')
      console.log(`   📊 Synced state: ${nodes.size} nodes, ${edges.length} edges`)
    }
  })

  wsProvider.on('connection-error', ({ error }) => {
    console.error('❌ WebSocket Error:', error)
  })

  wsProvider.on('connection-close', ({ event }) => {
    console.log('🔌 WebSocket Closed:', event?.code, event?.reason || '(no reason)')
  })

  const awareness = wsProvider.awareness

  console.log('✅ Provider created')
  console.log('========================================\n')

  return {
    ydoc,
    wsProvider,
    awareness,
    destroy: () => {
      console.log('🔌 Destroying provider:', ydocId)
      wsProvider.destroy()
    }
  }
}

/**
 * Helper function - no longer needed but kept for compatibility
 */
export async function clearIndexedDB(ydocId) {
  console.log('ℹ️  IndexedDB not used, nothing to clear')
  return Promise.resolve()
}