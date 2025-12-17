// Frontend/src/pages/editor/EditorPage.jsx - FIXED VERSION
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ReactFlowProvider } from 'reactflow'
import { mindmapService } from '../../services/mindmapService'
import { useAuthStore } from '../../stores/authStore'
import { createYjsProvider } from '../../lib/yjs'
import { createUndoManager, useUndoShortcuts } from '../../lib/undoManager'
import MindmapCanvas from '../../components/mindmap/MindmapCanvas'
import EditorToolbar from '../../components/mindmap/EditorToolbar'
import CollaboratorsList from '../../components/mindmap/CollaboratorsList'

export default function EditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  
  const [yjsProvider, setYjsProvider] = useState(null)
  const [undoManager, setUndoManager] = useState(null)
  const [synced, setSynced] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  const { data: mindmap, isLoading } = useQuery({
    queryKey: ['mindmap', id],
    queryFn: () => mindmapService.get(id),
  })

  // Setup Yjs Provider
  useEffect(() => {
    if (!mindmap || !accessToken) return

    console.log('🔌 Setting up Yjs Provider for:', mindmap.ydocId)

    const provider = createYjsProvider(mindmap.ydocId, accessToken)
    
    // 🔥 FIX: Better sync handling
    provider.wsProvider.on('sync', (isSynced) => {
      console.log('📡 Yjs sync event:', isSynced)
      setSynced(isSynced)
      
      if (isSynced) {
        console.log('✅ Document fully synced')
        setReconnectAttempts(0)
      }
    })

    provider.wsProvider.on('status', ({ status }) => {
      console.log('🔌 WebSocket status:', status)
      
      if (status === 'connected') {
        console.log('✅ WebSocket connected')
      } else if (status === 'disconnected') {
        console.log('⚠️  WebSocket disconnected, will retry...')
        setReconnectAttempts(prev => prev + 1)
      }
    })

    provider.wsProvider.on('connection-close', ({ event }) => {
      console.log('❌ WebSocket closed:', event.code, event.reason)
      
      // If closed by restore operation, reload page
      if (event.reason === 'Restore complete') {
        console.log('🔄 Restore detected, reloading...')
        setTimeout(() => window.location.reload(), 1000)
      }
    })

    provider.wsProvider.on('connection-error', ({ event }) => {
      console.error('❌ WebSocket error:', event)
    })

    setYjsProvider(provider)

    // Setup Undo Manager
    const undo = createUndoManager(provider.ydoc)
    setUndoManager(undo)

    return () => {
      console.log('🔌 Cleaning up provider')
      provider.destroy()
    }
  }, [mindmap, accessToken])

  // Bind keyboard shortcuts
  useEffect(() => {
    if (!undoManager) return
    return useUndoShortcuts(undoManager)
  }, [undoManager])

  // 🔥 NEW: Auto-reload if stuck disconnected
  useEffect(() => {
    if (reconnectAttempts > 5) {
      console.log('⚠️  Too many reconnect attempts, reloading page...')
      window.location.reload()
    }
  }, [reconnectAttempts])

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading mindmap...</p>
        </div>
      </div>
    )
  }

  if (!mindmap) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Mindmap not found
          </h2>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <EditorToolbar 
        mindmap={mindmap} 
        synced={synced}
        undoManager={undoManager}
        onBack={() => navigate('/dashboard')}
      />

      <div className="flex-1 relative">
        {yjsProvider ? (
          <ReactFlowProvider>
            <MindmapCanvas 
              ydoc={yjsProvider.ydoc}
              awareness={yjsProvider.awareness}
              mindmap={mindmap}
            />
          </ReactFlowProvider>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Connecting...</p>
              {reconnectAttempts > 0 && (
                <p className="text-sm text-yellow-600 mt-2">
                  Reconnect attempt {reconnectAttempts}/5
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {mindmap && (
        <CollaboratorsList 
          mindmapId={mindmap._id} 
          isOwner={mindmap.access === 'owner'}
        />
      )}
    </div>
  )
}