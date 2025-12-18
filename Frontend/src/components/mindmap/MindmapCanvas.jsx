// Frontend/src/components/mindmap/MindmapCanvas.jsx - FIXED AWARENESS
import { useEffect, useState, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import * as Y from 'yjs'
import { useAuthStore } from '../../stores/authStore'
import { useAwareness } from '../../hooks/useAwareness'
import MindmapNode from './MindmapNode'
import Cursor from './Cursor'
import { LockClosedIcon } from '@heroicons/react/24/outline'

const nodeTypes = {
  mindmapNode: MindmapNode,
}

const USER_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
]

function getRandomColor(userId) {
  const hash = userId.split('').reduce((acc, char) => 
    acc + char.charCodeAt(0), 0
  )
  return USER_COLORS[hash % USER_COLORS.length]
}

export default function MindmapCanvas({ ydoc, awareness, mindmap, isReadOnly = false }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  const user = useAuthStore((state) => state.user)
  const reactFlowInstance = useReactFlow()
  
  const yNodes = ydoc.getMap('nodes')
  const yEdges = ydoc.getArray('edges')

  const awarenessStates = useAwareness(awareness)

  // 🔥 Setup awareness - Simple version (no StrictMode workaround needed)
  useEffect(() => {
    if (!awareness || !user) return

    const userColor = getRandomColor(user.id || user._id)
    const userId = user.id || user._id
    
    console.log('👤 Setting up awareness for:', user.name || user.email)
    console.log('   Client ID:', awareness.clientID)
    
    // Set user info
    awareness.setLocalStateField('user', {
      id: userId,
      name: user.name,
      email: user.email,
      color: userColor,
    })
    
    // Set initial timestamp
    awareness.setLocalStateField('lastUpdated', Date.now())

    console.log('   ✅ Awareness set')

    // Heartbeat to keep awareness alive
    const heartbeatInterval = setInterval(() => {
      awareness.setLocalStateField('lastUpdated', Date.now())
    }, 3000)

    return () => {
      console.log('🧹 Cleaning up awareness for:', user.name || user.email)
      clearInterval(heartbeatInterval)
      awareness.setLocalState(null)
    }
  }, [awareness, user?.id, user?.email, user?.name])

  // 🔥 FIX: Update lastUpdated on mouse move
  const handleMouseMove = useCallback((event) => {
    if (!awareness) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top

    setMousePos({ x, y })
    
    // Update cursor position AND timestamp
    awareness.setLocalStateField('cursor', { x, y })
    awareness.setLocalStateField('lastUpdated', Date.now())
  }, [awareness])

  // Sync Yjs → React Flow
  useEffect(() => {
    const updateFromYjs = () => {
      const nodesData = []
      yNodes.forEach((value, key) => {
        nodesData.push({
          id: key,
          type: 'mindmapNode',
          position: value.position || { x: 0, y: 0 },
          data: { 
            label: value.label || '',
            color: value.color || '#3b82f6',
            yNodes,
            isReadOnly,
          },
          draggable: !isReadOnly,
        })
      })
      
      setNodes(nodesData)

      const edgesData = yEdges.toArray().map((edge, idx) => ({
        id: edge.id || `e-${idx}`,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
      }))
      
      setEdges(edgesData)
    }

    updateFromYjs()

    yNodes.observe(updateFromYjs)
    yEdges.observe(updateFromYjs)

    return () => {
      yNodes.unobserve(updateFromYjs)
      yEdges.unobserve(updateFromYjs)
    }
  }, [yNodes, yEdges, isReadOnly])

  // Handle node drag
  const onNodeDragStop = useCallback((event, node) => {
    if (isReadOnly) return
    
    const existingNode = yNodes.get(node.id)
    if (existingNode) {
      yNodes.set(node.id, {
        ...existingNode,
        position: node.position,
      })
    }
  }, [yNodes, isReadOnly])

  // Handle connection
  const onConnect = useCallback((params) => {
    if (isReadOnly) {
      console.log('⚠️ Cannot create connections in read-only mode')
      return
    }
    
    const newEdge = {
      id: `e-${params.source}-${params.target}`,
      source: params.source,
      target: params.target,
    }
    
    yEdges.push([newEdge])
  }, [yEdges, isReadOnly])

  // Add new node
  const onPaneClick = useCallback((event) => {
    if (isReadOnly) return
    
    if (event.detail === 2) {
      const id = `node-${Date.now()}`
      
      const bounds = event.currentTarget.getBoundingClientRect()
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })
      
      yNodes.set(id, {
        label: 'New Node',
        position,
        color: '#3b82f6',
      })
    }
  }, [yNodes, reactFlowInstance, isReadOnly])

  return (
    <div 
      className="w-full h-full relative"
      onMouseMove={handleMouseMove}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isReadOnly ? undefined : onNodesChange}
        onEdgesChange={isReadOnly ? undefined : onEdgesChange}
        onNodeDragStop={isReadOnly ? undefined : onNodeDragStop}
        onConnect={isReadOnly ? undefined : onConnect}
        onPaneClick={isReadOnly ? undefined : onPaneClick}
        nodeTypes={nodeTypes}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable={!isReadOnly}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>

      {/* Cursors */}
      {awarenessStates.map((state) => (
        state.cursor && (
          <Cursor
            key={state.clientId}
            user={state.user}
            position={state.cursor}
            color={state.user?.color || '#3b82f6'}
          />
        )
      ))}

      {/* Help text */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg px-4 py-2 text-sm text-gray-600">
        {isReadOnly ? (
          <div className="flex items-center space-x-2">
            <LockClosedIcon className="w-4 h-4 text-yellow-600" />
            <p>👁️ View-only mode - You cannot edit this mindmap</p>
          </div>
        ) : (
          <p>💡 Double-click canvas to add node • Drag to connect • Double-click node to edit</p>
        )}
      </div>

      {/* Active users */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg px-3 py-2 text-sm">
        <div className="flex items-center space-x-2">
          <div className="flex -space-x-2">
            {awarenessStates.slice(0, 3).map((state) => (
              <div
                key={state.clientId}
                className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: state.user?.color || '#3b82f6' }}
                title={`${state.user?.name || state.user?.email} (Client ${state.clientId})`}
              >
                {(state.user?.name || state.user?.email || '?')[0].toUpperCase()}
              </div>
            ))}
            {awarenessStates.length > 3 && (
              <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-300 flex items-center justify-center text-gray-700 text-xs font-bold">
                +{awarenessStates.length - 3}
              </div>
            )}
          </div>
          <span className="text-gray-600">
            {awarenessStates.length} online
          </span>
        </div>
      </div>
      
      {/* Debug panel */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-3 py-2 text-xs font-mono">
        <div className="font-bold mb-1">State:</div>
        <div>Nodes: {yNodes.size}</div>
        <div>Edges: {yEdges.length}</div>
        <div>Awareness: {awarenessStates.length}</div>
        {isReadOnly && <div className="text-yellow-600 font-bold mt-1">READ-ONLY</div>}
      </div>
    </div>
  )
}