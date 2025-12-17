// Frontend/src/pages/editor/EditorPage.jsx - Stable Provider (No Recreation)

import { useEffect, useState, useRef } from 'react'
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
  
  // 🔥 CRITICAL: Use ref to prevent recreation
  const providerRef = useRef(null)
  const setupInProgress = useRef(false)

  const { data: mindmap, isLoading } = useQuery({
    queryKey: ['mindmap', id],
    queryFn: () => mindmapService.get(id),
  })

  // Setup Yjs Provider - ONLY ONCE!
  useEffect(() => {
    // 🔥 Guard: Only setup if we don't have a provider yet
    if (!mindmap || !accessToken || providerRef.current || setupInProgress.current) {
      return
    }

    setupInProgress.current = true

    async function setupProvider() {
      console.log('\n========================================')
      console.log('🔌 EDITOR: Setup Yjs Provider (ONE TIME)')
      console.log('========================================')
      console.log('Mindmap:', mindmap.ydocId)

      try {
        // Create provider
        const provider = await createYjsProvider(mindmap.ydocId, accessToken)
        
        // Store in ref AND state
        providerRef.current = provider
        setYjsProvider(provider)

        // Setup event listeners
        provider.wsProvider.on('sync', (isSynced) => {
          console.log('🔄 Editor sync status:', isSynced)
          setSynced(isSynced)
          
          if (isSynced) {
            const nodes = provider.ydoc.getMap('nodes')
            console.log('✅ Editor synced with', nodes.size, 'nodes')
          }
        })

        provider.wsProvider.on('status', ({ status }) => {
          console.log('📡 Editor WebSocket status:', status)
        })

        provider.wsProvider.on('connection-error', ({ error }) => {
          console.error('❌ Editor connection error:', error)
        })

        // Setup Undo Manager
        const undo = createUndoManager(provider.ydoc)
        setUndoManager(undo)
        
        console.log('✅ Editor setup complete')
        console.log('========================================\n')

      } catch (err) {
        console.error('❌ Failed to setup provider:', err)
        setupInProgress.current = false
      }
    }

    setupProvider()

    // 🔥 Cleanup ONLY on unmount (not on re-render!)
    return () => {
      console.log('🧹 EditorPage unmounting - cleaning up provider')
      if (providerRef.current) {
        providerRef.current.destroy()
        providerRef.current = null
      }
      setupInProgress.current = false
    }
  }, [mindmap?.ydocId, accessToken]) // Only depend on ydocId and token

  // Bind keyboard shortcuts for undo/redo
  useEffect(() => {
    if (!undoManager) return
    return useUndoShortcuts(undoManager)
  }, [undoManager])

  // Loading state
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

  // Not found state
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

  // Main editor UI
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Toolbar */}
      <EditorToolbar 
        mindmap={mindmap} 
        synced={synced}
        undoManager={undoManager}
        onBack={() => navigate('/dashboard')}
      />

      {/* Canvas */}
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
              <p className="text-gray-600">Connecting to collaboration server...</p>
            </div>
          </div>
        )}
      </div>

      {/* Collaborators list */}
      {mindmap && (
        <CollaboratorsList 
          mindmapId={mindmap._id} 
          isOwner={mindmap.access === 'owner'}
        />
      )}
    </div>
  )
}