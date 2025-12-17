// Frontend/src/components/mindmap/MindmapCanvas.jsx - WITH DEBUG
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

export default function MindmapCanvas({ ydoc, awareness, mindmap }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  const user = useAuthStore((state) => state.user)
  const reactFlowInstance = useReactFlow()
  
  const yNodes = ydoc.getMap('nodes')
  const yEdges = ydoc.getArray('edges')

  const awarenessStates = useAwareness(awareness)

  // 🔥 DEBUG: Log Yjs state
  useEffect(() => {
    console.log('🔍 MindmapCanvas mounted');
    console.log('   yNodes size:', yNodes.size);
    console.log('   yEdges length:', yEdges.length);
    
    yNodes.forEach((value, key) => {
      console.log(`   Node ${key}:`, value);
    });
  }, []);

  useEffect(() => {
    if (!awareness || !user) return

    const userColor = getRandomColor(user.id || user._id)
    
    awareness.setLocalStateField('user', {
      id: user.id || user._id,
      name: user.name,
      email: user.email,
      color: userColor,
    })

    return () => {
      awareness.setLocalStateField('user', null)
    }
  }, [awareness, user])

  const handleMouseMove = useCallback((event) => {
    if (!awareness) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top

    setMousePos({ x, y })
    awareness.setLocalStateField('cursor', { x, y })
  }, [awareness])

  // Sync Yjs → React Flow
  useEffect(() => {
    const updateFromYjs = () => {
      console.log('🔄 updateFromYjs called');
      console.log('   yNodes size:', yNodes.size);
      console.log('   yEdges length:', yEdges.length);
      
      const nodesData = []
      yNodes.forEach((value, key) => {
        console.log(`   Processing node ${key}:`, value);
        nodesData.push({
          id: key,
          type: 'mindmapNode',
          position: value.position || { x: 0, y: 0 },
          data: { 
            label: value.label || '',
            color: value.color || '#3b82f6',
            yNodes,
          },
        })
      })
      
      console.log('   React nodes to set:', nodesData.length);
      setNodes(nodesData)

      const edgesData = yEdges.toArray().map((edge, idx) => ({
        id: edge.id || `e-${idx}`,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
      }))
      
      console.log('   React edges to set:', edgesData.length);
      setEdges(edgesData)
    }

    updateFromYjs()

    yNodes.observe(updateFromYjs)
    yEdges.observe(updateFromYjs)

    return () => {
      yNodes.unobserve(updateFromYjs)
      yEdges.unobserve(updateFromYjs)
    }
  }, [yNodes, yEdges])

  // Handle node drag
  const onNodeDragStop = useCallback((event, node) => {
    console.log('🎯 Node drag stopped:', node.id);
    console.log('   New position:', node.position);
    
    const existingNode = yNodes.get(node.id)
    if (existingNode) {
      console.log('   Updating Yjs with new position');
      yNodes.set(node.id, {
        ...existingNode,
        position: node.position,
      })
    } else {
      console.warn('   ⚠️  Node not found in Yjs!');
    }
  }, [yNodes])

  // Handle connection
  const onConnect = useCallback((params) => {
    console.log('🔗 New connection:', params);
    
    const newEdge = {
      id: `e-${params.source}-${params.target}`,
      source: params.source,
      target: params.target,
    }
    
    console.log('   Pushing to yEdges:', newEdge);
    yEdges.push([newEdge])
    
    console.log('   yEdges length now:', yEdges.length);
  }, [yEdges])

  // Add new node (double click)
  const onPaneClick = useCallback((event) => {
    if (event.detail === 2) {
      const id = `node-${Date.now()}`
      
      const bounds = event.currentTarget.getBoundingClientRect()
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })
      
      console.log('➕ Adding new node:', id);
      console.log('   Position:', position);
      console.log('   yNodes size before:', yNodes.size);
      
      yNodes.set(id, {
        label: 'New Node',
        position,
        color: '#3b82f6',
      })
      
      console.log('   yNodes size after:', yNodes.size);
      
      // 🔥 DEBUG: Verify it was actually added
      setTimeout(() => {
        console.log('   Verification: yNodes.has(' + id + '):', yNodes.has(id));
        if (yNodes.has(id)) {
          console.log('   ✅ Node successfully added to Yjs');
        } else {
          console.error('   ❌ Node NOT in Yjs!');
        }
      }, 100);
    }
  }, [yNodes, reactFlowInstance])

  return (
    <div 
      className="w-full h-full relative"
      onMouseMove={handleMouseMove}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>

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

      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg px-4 py-2 text-sm text-gray-600">
        <p>💡 Double-click canvas to add node • Drag to connect • Double-click node to edit</p>
      </div>

      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg px-3 py-2 text-sm">
        <div className="flex items-center space-x-2">
          <div className="flex -space-x-2">
            {awarenessStates.slice(0, 3).map((state) => (
              <div
                key={state.clientId}
                className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: state.user?.color || '#3b82f6' }}
                title={state.user?.name || state.user?.email}
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
      
      {/* 🔥 DEBUG PANEL */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-3 py-2 text-xs font-mono">
        <div className="font-bold mb-1">Yjs State:</div>
        <div>Nodes: {yNodes.size}</div>
        <div>Edges: {yEdges.length}</div>
      </div>
    </div>
  )
}