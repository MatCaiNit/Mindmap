// Frontend/src/pages/editor/EditorPage.jsx - FIXED AUTO LAYOUT
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ReactFlowProvider } from 'reactflow'
import { mindmapService } from '../../services/mindmapService'
import { useAuthStore } from '../../stores/authStore'
import { createYjsProvider } from '../../lib/yjs'
import { createUndoManager, useUndoShortcuts } from '../../lib/undoManager'
import MindMeisterCanvas from '../../components/mindmap/MindMeisterCanvas'
import EditorToolbar from '../../components/mindmap/EditorToolbar'
import { calculateBalancedLayout } from '../../lib/treeLayout'

export default function EditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  const currentUser = useAuthStore((state) => state.user)
  
  const [providerReady, setProviderReady] = useState(false)
  const [undoManager, setUndoManager] = useState(null)
  const [synced, setSynced] = useState(false)
  const [layoutApplied, setLayoutApplied] = useState(false)
  
  const providerRef = useRef(null)
  const setupInProgress = useRef(false)

  const { data: mindmap, isLoading } = useQuery({
    queryKey: ['mindmap', id],
    queryFn: () => mindmapService.get(id),
  })

  const userRole = mindmap?.access || 'viewer'
  const isViewer = userRole === 'viewer'

  useEffect(() => {
    if (!mindmap || !accessToken || providerRef.current || setupInProgress.current) {
      return
    }

    setupInProgress.current = true

    async function setupProvider() {
      console.log('🔌 Setting up Yjs Provider')

      try {
        const provider = await createYjsProvider(mindmap.ydocId, accessToken)
        
        providerRef.current = provider
        setProviderReady(true)

        provider.wsProvider.on('sync', (isSynced) => {
          setSynced(isSynced)
          
          if (isSynced) {
            const yNodes = provider.ydoc.getMap('nodes')
            console.log('✅ Synced with', yNodes.size, 'nodes')
            
            // 🔥 AUTO LAYOUT: Apply layout after sync if nodes exist and not yet applied
            if (!layoutApplied && yNodes.size > 1) {
              console.log('🎨 Applying auto-layout after sync...')
              
              setTimeout(() => {
                try {
                  const positions = calculateBalancedLayout(yNodes)
                  
                  let updatedCount = 0
                  positions.forEach((pos, nodeId) => {
                    const node = yNodes.get(nodeId)
                    if (node && node.autoAlign !== false && !node.isFree) {
                      yNodes.set(nodeId, { ...node, position: pos })
                      updatedCount++
                    }
                  })
                  
                  console.log(`✅ Layout applied to ${updatedCount} nodes`)
                  setLayoutApplied(true)
                  
                } catch (err) {
                  console.error('❌ Auto-layout error:', err)
                }
              }, 500) // Wait 500ms for full sync
            }
          }
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
      setLayoutApplied(false)
    }
  }, [mindmap?.ydocId, accessToken, layoutApplied])

  useEffect(() => {
    if (!undoManager || isViewer) return
    return useUndoShortcuts(undoManager)
  }, [undoManager, isViewer])

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
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
        yNodes={providerRef.current?.ydoc.getMap('nodes')}
        yEdges={providerRef.current?.ydoc.getArray('edges')}
      />

      <div className="flex-1 relative">
        {providerReady && providerRef.current ? (
          <ReactFlowProvider>
            <MindMeisterCanvas 
              ydoc={providerRef.current.ydoc}
              awareness={providerRef.current.awareness}
              mindmap={enhancedMindmap}
              isReadOnly={isViewer}
            />
          </ReactFlowProvider>
        ) : (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
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