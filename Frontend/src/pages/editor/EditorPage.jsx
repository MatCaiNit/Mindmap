// ==========================================
// FILE: Frontend/src/pages/editor/EditorPage.jsx
// ==========================================
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ReactFlowProvider } from 'reactflow'
import { mindmapService } from '../../services/mindmapService'
import { useAuthStore } from '../../stores/authStore'
import { createYjsProvider } from '../../lib/yjs'
import MindmapCanvas from '../../components/mindmap/MindmapCanvas'
import EditorToolbar from '../../components/mindmap/EditorToolbar'
import CollaboratorsList from '../../components/mindmap/CollaboratorsList'

export default function EditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  
  const [yjsProvider, setYjsProvider] = useState(null)
  const [synced, setSynced] = useState(false)

  const { data: mindmap, isLoading } = useQuery({
    queryKey: ['mindmap', id],
    queryFn: () => mindmapService.get(id),
  })

  useEffect(() => {
    if (!mindmap || !accessToken) return

    const provider = createYjsProvider(mindmap.ydocId, accessToken)
    
    provider.wsProvider.on('sync', (isSynced) => {
      setSynced(isSynced)
      console.log('Yjs sync status:', isSynced)
    })

    provider.wsProvider.on('status', ({ status }) => {
      console.log('WebSocket status:', status)
    })

    setYjsProvider(provider)

    return () => {
      provider.destroy()
    }
  }, [mindmap, accessToken])

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
            <p className="text-gray-600">Connecting...</p>
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