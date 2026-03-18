// Frontend/src/pages/editor/EditorPage.jsx
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate }       from 'react-router-dom'
import { ReactFlowProvider }            from 'reactflow'
import { useAuthStore }                 from '../../stores/authStore'
import { mindmapService }               from '../../services/mindmapService'
import { createYjsProvider }            from '../../lib/yjs'
import { createUndoManager }            from '../../lib/undoManager'
import MindMeisterCanvas                from '../../components/mindmap/MindMeisterCanvas'
import EditorToolbar                    from '../../components/mindmap/EditorToolbar'

export default function EditorPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)
  const token    = useAuthStore(s => s.accessToken)

  const [mindmap,  setMindmap]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [synced,   setSynced]   = useState(false)
  const [userRole, setUserRole] = useState('viewer')

  // FIX: useState (not useRef) so React re-renders when provider is ready
  const [ydoc,      setYdoc]      = useState(null)
  const [awareness, setAwareness] = useState(null)

  const undoManagerRef = useRef(null)
  const destroyRef     = useRef(null)

  // ── 1. Load mindmap metadata ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await mindmapService.get(id)
        if (cancelled) return
        setMindmap({ ...data, currentUserId: user?.id || user?._id })
        setUserRole(data.access || 'viewer')
      } catch (err) {
        if (!cancelled)
          setError(err.response?.data?.message || 'Failed to load mindmap')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id, user])

  // ── 2. Set up Yjs / WebSocket ────────────────────────────────────────────
  useEffect(() => {
    if (!mindmap || !token) return

    let cancelled = false

    async function setup() {
      try {
        const provider = await createYjsProvider(mindmap.ydocId, token)
        if (cancelled) { provider.destroy(); return }

        destroyRef.current = provider.destroy

        // setState triggers re-render so canvas mounts with valid ydoc
        setYdoc(provider.ydoc)
        setAwareness(provider.awareness)

        provider.wsProvider.on('sync', (isSynced) => setSynced(isSynced))

        undoManagerRef.current = createUndoManager(provider.ydoc)
        // Sau khi tạo, override để bảo vệ root-node
        const um = undoManagerRef.current
        const originalUndo = um.undo.bind(um)
        um.undo = () => {
          originalUndo()
          // Sau khi undo, nếu root-node bị xóa thì restore lại
          const yNodes = provider.ydoc.getMap('nodes')
          if (!yNodes.get('root-node')) {
            yNodes.set('root-node', {
              label:     mindmap.title || 'Main Topic',
              position:  { x: 600, y: 400 },
              color:     '#3b82f6',
              level:     0, parentId: null, side: null,
              autoAlign: true, isRoot: true,
            })
          }
        }
      } catch (err) {
        console.error('Yjs setup error:', err)
        if (!cancelled) setError('Failed to connect to realtime server')
      }
    }

    setup()

    return () => {
      cancelled = true
      destroyRef.current?.()
      undoManagerRef.current?.destroy?.()
      setYdoc(null)
      setAwareness(null)
    }
  }, [mindmap, token])

  // ── 3. Undo/redo keyboard shortcuts ──────────────────────────────────────
  // FIX: inline the logic here — never call a hook inside another hook/effect
  useEffect(() => {
    const um = undoManagerRef.current
    if (!um) return

    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (um.canUndo()) um.undo()
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        e.preventDefault()
        if (um.canRedo()) um.redo()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [ydoc]) // re-bind once ydoc (and undoManager) is ready

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading mindmap…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // Show spinner while Yjs provider connects (after metadata loads)
  if (!mindmap || !ydoc) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Connecting…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <EditorToolbar
        mindmap={mindmap}
        synced={synced}
        undoManager={undoManagerRef.current}
        onBack={() => navigate('/dashboard')}
        userRole={userRole}
      />

      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <MindMeisterCanvas
            ydoc={ydoc}
            awareness={awareness}
            mindmap={mindmap}
            isReadOnly={userRole === 'viewer'}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}