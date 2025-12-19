// Frontend/src/components/mindmap/MindMeisterCanvas.jsx - FULL FEATURES

import { useEffect, useState, useCallback, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useAuthStore } from '../../stores/authStore'
import { useAwareness } from '../../hooks/useAwareness'
import MindMeisterNode from './MindMeisterNode'
import CustomEdge from './CustomEdge'
import FloatingToolbar from './FloatingToolbar'
import Cursor from './Cursor'
import { 
  calculateTreeLayout,
  calculateNewNodePosition,
  getSuggestedSide
} from '../../lib/treeLayout'
import { PlusCircleIcon } from '@heroicons/react/24/solid'

const nodeTypes = { mindmeister: MindMeisterNode }
const edgeTypes = { custom: CustomEdge }

const USER_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
const BRANCH_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function getRandomColor(userId) {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return USER_COLORS[hash % USER_COLORS.length]
}

export default function MindMeisterCanvas({ ydoc, awareness, mindmap, isReadOnly = false }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [toolbarPosition, setToolbarPosition] = useState(null)
  const [layoutMode, setLayoutMode] = useState('balanced')
  const [isCreatingConnection, setIsCreatingConnection] = useState(false)
  const [connectionStart, setConnectionStart] = useState(null)
  const [tempConnectionPos, setTempConnectionPos] = useState(null)
  
  const user = useAuthStore((state) => state.user)
  const yNodes = ydoc.getMap('nodes')
  const yEdges = ydoc.getArray('edges')
  const yMeta = ydoc.getMap('meta')
  const awarenessStates = useAwareness(awareness)
  
  const isEditingRef = useRef(false)
  const dragStartPosRef = useRef(null)

  // Setup awareness
  useEffect(() => {
    if (!awareness || !user) return
    const userId = user.id || user._id
    
    awareness.setLocalStateField('user', {
      id: userId,
      name: user.name,
      email: user.email,
      color: getRandomColor(userId),
    })
    
    const interval = setInterval(() => {
      awareness.setLocalStateField('lastUpdated', Date.now())
    }, 3000)

    return () => {
      clearInterval(interval)
      awareness.setLocalState(null)
    }
  }, [awareness, user])

  // Calculate level
  const calculateLevel = useCallback((nodeId) => {
    const node = yNodes.get(nodeId)
    if (!node || !node.parentId) return 0
    return 1 + calculateLevel(node.parentId)
  }, [yNodes])

  // Get branch color
  const getBranchColor = useCallback((nodeId) => {
    const node = yNodes.get(nodeId)
    if (!node) return BRANCH_COLORS[0]
    
    let rootChild = nodeId
    let current = node
    while (current.parentId) {
      const parent = yNodes.get(current.parentId)
      if (!parent || !parent.parentId) break
      rootChild = current.parentId
      current = parent
    }
    
    const hash = rootChild.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return BRANCH_COLORS[hash % BRANCH_COLORS.length]
  }, [yNodes])

  // Add child
  const handleAddChild = useCallback((parentId) => {
    if (isReadOnly) return
    
    const parent = yNodes.get(parentId)
    if (!parent) return
    
    const newId = `node-${Date.now()}`
    const level = calculateLevel(parentId) + 1
    const side = layoutMode === 'tree' ? 'right' : getSuggestedSide(parentId, yNodes)
    const color = getBranchColor(parentId)
    
    const position = calculateNewNodePosition(parentId, yNodes)
    
    yNodes.set(newId, {
      label: 'New Node',
      position,
      parentId,
      level,
      color,
      side,
      autoAlign: true, // 🔥 NEW: Mặc định bật auto-align
      locked: false
    })
    
    const sourceHandle = layoutMode === 'tree' ? 'source-right' : 
                         (side === 'left' ? 'source-left' : 'source-right')
    const targetHandle = layoutMode === 'tree' ? 'target-left' :
                         (side === 'left' ? 'target-right' : 'target-left')
    
    yEdges.push([{
      id: `e-${parentId}-${newId}`,
      source: parentId,
      target: newId,
      sourceHandle,
      targetHandle,
      color,
      isParentChild: true // 🔥 NEW: Mark as parent-child edge
    }])
    
    setTimeout(() => applyLayout(layoutMode), 100)
  }, [yNodes, yEdges, layoutMode, calculateLevel, getBranchColor, isReadOnly])

  // 🔥 NEW: Add free node
  const handleAddFreeNode = useCallback(() => {
    if (isReadOnly) return
    
    const newId = `node-${Date.now()}`
    
    yNodes.set(newId, {
      label: 'Free Node',
      position: { x: 300, y: 300 }, // 🔥 Fixed position
      parentId: null,
      level: 1, // 🔥 Always level 1 style
      color: '#64748b',
      side: null,
      autoAlign: false, // 🔥 Free node: NO auto-align
      locked: false
    })
  }, [yNodes, isReadOnly])

  // Apply layout
  const applyLayout = useCallback((mode) => {
    const positions = calculateTreeLayout(yNodes, mode)
    
    positions.forEach((pos, nodeId) => {
      const node = yNodes.get(nodeId)
      if (node && node.autoAlign !== false) { // 🔥 Only auto-align if enabled
        yNodes.set(nodeId, { ...node, position: pos })
      }
    })
    
    // Update edge handles
    const edgesArray = yEdges.toArray()
    edgesArray.forEach((edge, idx) => {
      if (edge.isParentChild) { // 🔥 Only update parent-child edges
        const source = yNodes.get(edge.source)
        const target = yNodes.get(edge.target)
        
        if (source && target) {
          let sourceHandle, targetHandle
          
          if (mode === 'tree') {
            sourceHandle = 'source-right'
            targetHandle = 'target-left'
          } else {
            const side = target.side || 'right'
            sourceHandle = side === 'left' ? 'source-left' : 'source-right'
            targetHandle = side === 'left' ? 'target-right' : 'target-left'
          }
          
          yEdges.delete(idx, 1)
          yEdges.insert(idx, [{
            ...edge,
            sourceHandle,
            targetHandle
          }])
        }
      }
    })
    
    yMeta.set('layout', mode)
  }, [yNodes, yEdges, yMeta])

  // 🔥 NEW: Toggle auto-align
  const handleToggleAutoAlign = useCallback((nodeId) => {
    const node = yNodes.get(nodeId)
    if (node && nodeId !== 'root-node') {
      yNodes.set(nodeId, {
        ...node,
        autoAlign: !node.autoAlign
      })
      
      if (!node.autoAlign) { // If turning ON
        setTimeout(() => applyLayout(layoutMode), 100)
      }
    }
  }, [yNodes, layoutMode, applyLayout])

  // 🔥 NEW: Start creating connection
  const handleStartConnection = useCallback((nodeId, handleId) => {
    if (isReadOnly) return
    
    setIsCreatingConnection(true)
    setConnectionStart({ nodeId, handleId })
  }, [isReadOnly])

  // 🔥 NEW: Complete connection
  const handleCompleteConnection = useCallback((targetNodeId, targetHandleId) => {
    if (!connectionStart || isReadOnly) return
    
    const newEdge = {
      id: `custom-${Date.now()}`,
      source: connectionStart.nodeId,
      target: targetNodeId,
      sourceHandle: connectionStart.handleId,
      targetHandle: targetHandleId,
      color: '#3b82f6',
      width: 2,
      style: 'solid',
      isParentChild: false,
      curvature: 0.5
    }
    
    yEdges.push([newEdge])
    
    setIsCreatingConnection(false)
    setConnectionStart(null)
    setTempConnectionPos(null)
  }, [connectionStart, yEdges, isReadOnly])

  // Handle edge updates
  const handleUpdateEdge = useCallback((edgeId, updates) => {
    if (isReadOnly) return
    
    const edgesArray = yEdges.toArray()
    const edgeIndex = edgesArray.findIndex(e => e.id === edgeId)
    
    if (edgeIndex !== -1) {
      const edge = edgesArray[edgeIndex]
      
      // 🔥 Prevent editing parent-child edges
      if (edge.isParentChild) {
        console.warn('Cannot edit parent-child edge')
        return
      }
      
      yEdges.delete(edgeIndex, 1)
      yEdges.insert(edgeIndex, [{ ...edge, ...updates }])
    }
  }, [yEdges, isReadOnly])

  // Delete edge
  const handleDeleteEdge = useCallback((edgeId) => {
    if (isReadOnly) return
    
    const edgesArray = yEdges.toArray()
    const edgeIndex = edgesArray.findIndex(e => e.id === edgeId)
    
    if (edgeIndex !== -1) {
      const edge = edgesArray[edgeIndex]
      
      // 🔥 Prevent deleting parent-child edges
      if (edge.isParentChild) {
        alert('Cannot delete parent-child relationship edge')
        return
      }
      
      yEdges.delete(edgeIndex, 1)
    }
  }, [yEdges, isReadOnly])

  // 🔥 NEW: Reparent node (drag node into another node)
  const handleReparent = useCallback((draggedNodeId, newParentId) => {
    if (isReadOnly) return
    
    const draggedNode = yNodes.get(draggedNodeId)
    const newParent = yNodes.get(newParentId)
    
    if (!draggedNode || !newParent || draggedNodeId === newParentId) return
    
    // Prevent cycles
    let current = newParentId
    while (current) {
      if (current === draggedNodeId) {
        alert('Cannot create cycle')
        return
      }
      const node = yNodes.get(current)
      current = node?.parentId
    }
    
    // Remove old parent-child edge
    const edgesArray = yEdges.toArray()
    const oldEdgeIdx = edgesArray.findIndex(e => 
      e.isParentChild && e.target === draggedNodeId
    )
    
    if (oldEdgeIdx !== -1) {
      yEdges.delete(oldEdgeIdx, 1)
    }
    
    // Update node
    const side = layoutMode === 'tree' ? 'right' : getSuggestedSide(newParentId, yNodes)
    yNodes.set(draggedNodeId, {
      ...draggedNode,
      parentId: newParentId,
      side,
      color: newParent.color,
      autoAlign: true // 🔥 Enable auto-align when reparenting
    })
    
    // Create new parent-child edge
    const sourceHandle = layoutMode === 'tree' ? 'source-right' :
                         (side === 'left' ? 'source-left' : 'source-right')
    const targetHandle = layoutMode === 'tree' ? 'target-left' :
                         (side === 'left' ? 'target-right' : 'target-left')
    
    yEdges.push([{
      id: `e-${newParentId}-${draggedNodeId}`,
      source: newParentId,
      target: draggedNodeId,
      sourceHandle,
      targetHandle,
      color: newParent.color,
      isParentChild: true
    }])
    
    setTimeout(() => applyLayout(layoutMode), 100)
  }, [yNodes, yEdges, layoutMode, isReadOnly, applyLayout])

  // Sync Yjs to React Flow
  useEffect(() => {
    const updateFromYjs = () => {
      const nodesData = []
      
      yNodes.forEach((value, key) => {
        const isRoot = key === 'root-node'
        const autoAlign = value.autoAlign !== false
        
        nodesData.push({
          id: key,
          type: 'mindmeister',
          position: value.position || { x: 0, y: 0 },
          data: { 
            ...value,
            level: calculateLevel(key),
            color: value.color || getBranchColor(key),
            yNodes,
            isReadOnly,
            isRoot,
            autoAlign,
            layoutMode,
            onAddChild: handleAddChild,
            onToggleAutoAlign: handleToggleAutoAlign,
            onStartConnection: handleStartConnection,
            onEditingChange: (editing) => {
              isEditingRef.current = editing
            }
          },
          draggable: !isReadOnly && !isRoot && !autoAlign, // 🔥 Can't drag if root or auto-align
        })
      })
      
      setNodes(nodesData)

      const edgesData = yEdges.toArray().map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: 'custom',
        data: { 
          color: edge.color || '#3b82f6',
          width: edge.width || 2,
          style: edge.style || 'solid',
          isParentChild: edge.isParentChild || false,
          curvature: edge.curvature || 0.25,
          onUpdateEdge: handleUpdateEdge,
          onDeleteEdge: handleDeleteEdge,
        },
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
  }, [yNodes, yEdges, calculateLevel, getBranchColor, handleAddChild, handleToggleAutoAlign, 
      handleStartConnection, handleUpdateEdge, handleDeleteEdge, isReadOnly, layoutMode])

  // Initialize root
  useEffect(() => {
    if (yNodes.size === 0 && !isReadOnly) {
      yNodes.set('root-node', {
        label: mindmap.title || 'Main Topic',
        position: { x: 600, y: 400 },
        color: '#3b82f6',
        level: 0,
        parentId: null,
        side: null,
        autoAlign: true,
        locked: true // 🔥 Root is always locked
      })
    }
  }, [yNodes, mindmap.title, isReadOnly])

  // Node click
  const onNodeClick = useCallback((event, node) => {
    if (isReadOnly) return
    
    // 🔥 If creating connection, complete it
    if (isCreatingConnection && node.id !== connectionStart?.nodeId) {
      // Show connection points
      return
    }
    
    setSelectedNode(node)
    const nodeElement = event.target.closest('.react-flow__node')
    if (nodeElement) {
      const rect = nodeElement.getBoundingClientRect()
      setToolbarPosition({ x: rect.left + rect.width / 2, y: rect.top })
    }
  }, [isReadOnly, isCreatingConnection, connectionStart])

  // Clear selection
  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setToolbarPosition(null)
    
    // Cancel connection creation
    if (isCreatingConnection) {
      setIsCreatingConnection(false)
      setConnectionStart(null)
      setTempConnectionPos(null)
    }
  }, [isCreatingConnection])

  // 🔥 NEW: Node drag start
  const onNodeDragStart = useCallback((event, node) => {
    if (isReadOnly) return
    
    const nodeData = yNodes.get(node.id)
    dragStartPosRef.current = nodeData?.position
  }, [yNodes, isReadOnly])

  // Node drag stop
  const onNodeDragStop = useCallback((event, node) => {
    if (isReadOnly) return
    
    const nodeData = yNodes.get(node.id)
    if (!nodeData) return
    
    // 🔥 Check if dropped on another node
    const dropTarget = nodes.find(n => {
      if (n.id === node.id || n.id === 'root-node') return false
      
      const dx = n.position.x - node.position.x
      const dy = n.position.y - node.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      return dist < 100 // Within 100px
    })
    
    if (dropTarget) {
      // Reparent
      handleReparent(node.id, dropTarget.id)
    } else if (nodeData.autoAlign) {
      // 🔥 If auto-align enabled, revert to original position
      yNodes.set(node.id, {
        ...nodeData,
        position: dragStartPosRef.current
      })
      setTimeout(() => applyLayout(layoutMode), 100)
    } else {
      // Update position for non-auto-align nodes
      yNodes.set(node.id, { ...nodeData, position: node.position })
    }
    
    dragStartPosRef.current = null
  }, [yNodes, nodes, layoutMode, isReadOnly, handleReparent, applyLayout])

  // Keyboard shortcuts
  useEffect(() => {
    if (isReadOnly) return
    
    const handleKeyDown = (e) => {
      if (isEditingRef.current) return
      if (!selectedNode) return
      
      if (e.key === 'Tab') {
        e.preventDefault()
        handleAddChild(selectedNode.id)
      }
      
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const parent = yNodes.get(selectedNode.id)?.parentId
        if (parent) handleAddChild(parent)
      }
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode.id !== 'root-node') {
        e.preventDefault()
        
        const deleteRecursive = (nodeId) => {
          yNodes.forEach((value, key) => {
            if (value.parentId === nodeId) deleteRecursive(key)
          })
          yNodes.delete(nodeId)
        }
        
        deleteRecursive(selectedNode.id)
        setSelectedNode(null)
        setToolbarPosition(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedNode, handleAddChild, yNodes, isReadOnly])

  // 🔥 Mouse move for connection preview
  const handleMouseMove = useCallback((event) => {
    if (isCreatingConnection) {
      setTempConnectionPos({ x: event.clientX, y: event.clientY })
    }
  }, [isCreatingConnection])

  return (
    <div 
      className="w-full h-full relative bg-gradient-to-br from-gray-50 to-gray-100"
      onMouseMove={handleMouseMove}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isReadOnly ? undefined : onNodesChange}
        onEdgesChange={isReadOnly ? undefined : onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={isReadOnly ? undefined : onNodeDragStart}
        onNodeDragStop={isReadOnly ? undefined : onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={!isReadOnly}
        nodesConnectable={false}
        fitView
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#e5e7eb" gap={20} size={1} />
        <Controls />
        <MiniMap nodeColor={(node) => node.data.color || '#3b82f6'} />
      </ReactFlow>

      {/* Toolbar */}
      {selectedNode && toolbarPosition && !isReadOnly && (
        <FloatingToolbar
          selectedNode={selectedNode}
          position={toolbarPosition}
          yNodes={yNodes}
          onToggleAutoAlign={() => handleToggleAutoAlign(selectedNode.id)}
          onStartConnection={handleStartConnection}
          isCreatingConnection={isCreatingConnection}
        />
      )}

      {/* Layout + Add Free Node */}
      {!isReadOnly && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-3 py-2 flex items-center space-x-2">
          <button
            onClick={() => { setLayoutMode('balanced'); applyLayout('balanced') }}
            className={`px-3 py-1.5 rounded text-sm ${
              layoutMode === 'balanced' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            Balanced
          </button>
          <button
            onClick={() => { setLayoutMode('tree'); applyLayout('tree') }}
            className={`px-3 py-1.5 rounded text-sm ${
              layoutMode === 'tree' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            Tree
          </button>
          
          <div className="w-px h-6 bg-gray-300" />
          
          <button
            onClick={handleAddFreeNode}
            className="px-3 py-1.5 rounded text-sm bg-gray-100 hover:bg-gray-200 flex items-center space-x-1"
            title="Add free node (draggable)"
          >
            <PlusCircleIcon className="w-4 h-4" />
            <span>Free Node</span>
          </button>
        </div>
      )}

      {/* Online users */}
      {awarenessStates.length > 0 && (
        <>
          {awarenessStates.map((state) => (
            state.cursor && <Cursor key={state.clientId} user={state.user} position={state.cursor} color={state.user?.color || '#3b82f6'} />
          ))}

          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg px-3 py-2 text-sm">
            <div className="flex items-center space-x-2">
              <div className="flex -space-x-2">
                {awarenessStates.slice(0, 3).map((state) => (
                  <div
                    key={state.clientId}
                    className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: state.user?.color || '#3b82f6' }}
                  >
                    {(state.user?.name || state.user?.email || '?')[0].toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-gray-600">{awarenessStates.length} online</span>
            </div>
          </div>
        </>
      )}

      {/* Help */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg px-4 py-3 text-xs text-gray-600 space-y-1">
        {isReadOnly ? (
          <p>👁️ View-only mode</p>
        ) : (
          <>
            <p><kbd>Tab</kbd> Add child | <kbd>Enter</kbd> Add sibling</p>
            <p><kbd>Double-click</kbd> Edit | <kbd>Del</kbd> Delete</p>
            <p>Drag node onto another to reparent</p>
          </>
        )}
      </div>

      {/* 🔥 Connection Preview */}
      {isCreatingConnection && connectionStart && tempConnectionPos && (
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
          <line
            x1={connectionStart.x || 0}
            y1={connectionStart.y || 0}
            x2={tempConnectionPos.x}
            y2={tempConnectionPos.y}
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="5,5"
          />
        </svg>
      )}
    </div>
  )
}