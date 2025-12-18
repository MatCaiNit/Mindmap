// Frontend/src/pages/editor/EditorPage.jsx - FIXED: Stable Provider Reference
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

export default function EditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  const currentUser = useAuthStore((state) => state.user)
  
  // 🔥 FIX: Use refs to keep stable references
  const [providerReady, setProviderReady] = useState(false)
  const [undoManager, setUndoManager] = useState(null)
  const [synced, setSynced] = useState(false)
  
  const providerRef = useRef(null)
  const setupInProgress = useRef(false)

  const { data: mindmap, isLoading } = useQuery({
    queryKey: ['mindmap', id],
    queryFn: () => mindmapService.get(id),
  })

  const userRole = mindmap?.access || 'viewer'
  const isViewer = userRole === 'viewer'

  // Setup Yjs Provider - ONLY ONCE
  useEffect(() => {
    if (!mindmap || !accessToken || providerRef.current || setupInProgress.current) {
      return
    }

    setupInProgress.current = true

    async function setupProvider() {
      console.log('🔌 Setting up Yjs Provider')
      console.log('   User role:', userRole)
      console.log('   Is viewer:', isViewer)

      try {
        const provider = await createYjsProvider(mindmap.ydocId, accessToken)
        
        providerRef.current = provider
        setProviderReady(true) // ← Signal that provider is ready

        provider.wsProvider.on('sync', (isSynced) => {
          setSynced(isSynced)
          if (isSynced) {
            console.log('✅ Synced with', provider.ydoc.getMap('nodes').size, 'nodes')
          }
        })

        provider.wsProvider.on('status', ({ status }) => {
          console.log('📡 WebSocket status:', status)
        })

        const undo = createUndoManager(provider.ydoc)
        setUndoManager(undo)
        
        console.log('✅ Setup complete')

      } catch (err) {
        console.error('❌ Failed to setup provider:', err)
        setupInProgress.current = false
      }
    }

    setupProvider()

    return () => {
      console.log('🧹 Cleaning up provider')
      if (providerRef.current) {
        providerRef.current.destroy()
        providerRef.current = null
      }
      setupInProgress.current = false
      setProviderReady(false)
    }
  }, [mindmap?.ydocId, accessToken])

  useEffect(() => {
    if (!undoManager || isViewer) return
    return useUndoShortcuts(undoManager)
  }, [undoManager, isViewer])

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

  const enhancedMindmap = {
    ...mindmap,
    currentUserId: currentUser?.id || currentUser?._id
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <EditorToolbar 
        mindmap={enhancedMindmap}
        synced={synced}
        undoManager={undoManager}
        onBack={() => navigate('/dashboard')}
        userRole={userRole}
      />

      <div className="flex-1 relative">
        {/* 🔥 FIX: Only render when provider is ready AND use stable ref */}
        {providerReady && providerRef.current ? (
          <ReactFlowProvider>
            <MindmapCanvas 
              ydoc={providerRef.current.ydoc}
              awareness={providerRef.current.awareness}
              mindmap={enhancedMindmap}
              isReadOnly={isViewer}
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
    </div>
  )
}