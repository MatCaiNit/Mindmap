// Frontend/src/components/mindmap/MindMeisterCanvas.jsx - WITH AI BUTTON

import { useReactFlow } from 'reactflow'
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
import AIAssistantModal from './AIAssistantModal'
import Cursor from './Cursor'
import { 
  calculateBalancedLayout,
  calculateNewNodePosition,
  getSuggestedSide,
  updateSubtreeSide,
  determineFreeNodeSide
} from '../../lib/treeLayout'
import { PlusCircleIcon, SparklesIcon } from '@heroicons/react/24/solid'

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
  const [showAIModal, setShowAIModal] = useState(false)
  
  // Connection mode
  const [isCreatingConnection, setIsCreatingConnection] = useState(false)
  const [connectionSource, setConnectionSource] = useState(null)
  const [tempConnectionTarget, setTempConnectionTarget] = useState(null)
  
  // Drag state
  const [draggedNode, setDraggedNode] = useState(null)
  const [dragStartPos, setDragStartPos] = useState(null)
  const [hiddenEdges, setHiddenEdges] = useState(new Set())
  
  const user = useAuthStore((state) => state.user)
  const yNodes = ydoc.getMap('nodes')
  const yEdges = ydoc.getArray('edges')
  const awarenessStates = useAwareness(awareness)
  const reactFlowInstance = useReactFlow()
  const isEditingRef = useRef(false)

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

  // Add child node
  const handleAddChild = useCallback((parentId) => {
    if (isReadOnly) return
    
    const parent = yNodes.get(parentId)
    if (!parent) return
    
    const newId = `node-${Date.now()}`
    const level = calculateLevel(parentId) + 1
    
    const isRoot = parentId === 'root-node'
    let side
    if (isRoot) {
      side = getSuggestedSide(parentId, yNodes)
    } else {
      side = parent.side
    }
    
    const color = getBranchColor(parentId)
    const position = calculateNewNodePosition(parentId, yNodes, side)
    
    yNodes.set(newId, {
      label: '',
      position,
      parentId,
      level,
      color,
      side,
      autoAlign: true,
      editing: true
    })
    
    const sourceHandle = side === 'left' ? 'source-left' : 'source-right'
    const targetHandle = side === 'left' ? 'target-right' : 'target-left'
    
    yEdges.push([{
      id: `e-${parentId}-${newId}`,
      source: parentId,
      target: newId,
      sourceHandle,
      targetHandle,
      color,
      isParentChild: true
    }])
    
    setTimeout(() => applyLayout(), 100)
  }, [yNodes, yEdges, calculateLevel, getBranchColor, isReadOnly])

  const handleAddFreeNode = useCallback(() => {
    if (isReadOnly) return

    const newId = `node-${Date.now()}`
    const { x, y, zoom } = reactFlowInstance.getViewport()
    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight / 2
    const flowPosition = reactFlowInstance.project({ x: centerX, y: centerY })

    const rootNode = yNodes.get('root-node')
    const rootX = rootNode?.position?.x ?? flowPosition.x
    const side = determineFreeNodeSide(flowPosition.x, rootX)

    yNodes.set(newId, {
      label: 'Free Node',
      position: flowPosition,
      parentId: null,
      level: 1,
      color: '#64748b',
      side,
      autoAlign: false,
      isFree: true
    })
  }, [reactFlowInstance, yNodes, isReadOnly])

  // Apply layout
  const applyLayout = useCallback(() => {
    const positions = calculateBalancedLayout(yNodes)
    
    positions.forEach((pos, nodeId) => {
      const node = yNodes.get(nodeId)
      if (node && node.autoAlign !== false && !node.isFree) {
        yNodes.set(nodeId, { ...node, position: pos })
      }
    })
  }, [yNodes])

  // Toggle auto-align
  const handleToggleAutoAlign = useCallback((nodeId) => {
    const node = yNodes.get(nodeId)
    if (node && nodeId !== 'root-node') {
      yNodes.set(nodeId, {
        ...node,
        autoAlign: !node.autoAlign
      })
      
      if (!node.autoAlign) {
        setTimeout(() => applyLayout(), 100)
      }
    }
  }, [yNodes, applyLayout])

  // Start connection mode
  const handleStartConnectionMode = useCallback(() => {
    if (isReadOnly) return
    setIsCreatingConnection(true)
    // 🔥 Close toolbar when starting connection mode
    setToolbarPosition(null)
  }, [isReadOnly])

  // Cancel connection mode
  const cancelConnectionMode = useCallback(() => {
    setIsCreatingConnection(false)
    setConnectionSource(null)
    setTempConnectionTarget(null)
  }, [])

  // Handle anchor click
  const handleAnchorClick = useCallback((nodeId, anchor, event) => {
    if (!isCreatingConnection) return
    
    if (!connectionSource) {
      const nodeElement = event.target.closest('.react-flow__node')
      if (!nodeElement) return
      
      const rect = nodeElement.getBoundingClientRect()
      let x, y
      
      switch (anchor) {
        case 'top':
          x = rect.left + rect.width / 2
          y = rect.top
          break
        case 'right':
          x = rect.right
          y = rect.top + rect.height / 2
          break
        case 'bottom':
          x = rect.left + rect.width / 2
          y = rect.bottom
          break
        case 'left':
          x = rect.left
          y = rect.top + rect.height / 2
          break
      }
      
      setConnectionSource({ nodeId, anchor, x, y })
    } else {
      if (connectionSource.nodeId === nodeId) {
        cancelConnectionMode()
        return
      }
      
      const newEdge = {
        id: `custom-${Date.now()}`,
        source: connectionSource.nodeId,
        target: nodeId,
        sourceHandle: `source-${connectionSource.anchor}`,
        targetHandle: `target-${anchor}`,
        color: '#3b82f6',
        width: 2,
        style: 'solid',
        isParentChild: false,
        curvature: 0.25
      }
      
      yEdges.push([newEdge])
      cancelConnectionMode()
    }
  }, [isCreatingConnection, connectionSource, yEdges, cancelConnectionMode])

  // Update edge
  const handleUpdateEdge = useCallback((edgeId, updates) => {
    if (isReadOnly) return
    
    const edgesArray = yEdges.toArray()
    const edgeIndex = edgesArray.findIndex(e => e.id === edgeId)
    
    if (edgeIndex !== -1) {
      const edge = edgesArray[edgeIndex]
      if (edge.isParentChild) return
      
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
      if (edge.isParentChild) {
        alert('Cannot delete parent-child edge')
        return
      }
      
      yEdges.delete(edgeIndex, 1)
    }
  }, [yEdges, isReadOnly])

  // Reparent node
  const handleReparent = useCallback((draggedNodeId, newParentId) => {
    if (isReadOnly) return
    
    const draggedNode = yNodes.get(draggedNodeId)
    const newParent = yNodes.get(newParentId)
    
    if (!draggedNode || !newParent || draggedNodeId === newParentId) return
    
    let current = newParentId
    while (current) {
      if (current === draggedNodeId) {
        alert('Cannot create cycle')
        return
      }
      const node = yNodes.get(current)
      current = node?.parentId
    }
    
    const edgesArray = yEdges.toArray()
    const oldEdgeIdx = edgesArray.findIndex(e => 
      e.isParentChild && e.target === draggedNodeId
    )
    
    if (oldEdgeIdx !== -1) {
      yEdges.delete(oldEdgeIdx, 1)
    }
    
    let newSide
    if (!newParent.parentId) {
      newSide = getSuggestedSide(newParentId, yNodes)
    } else {
      newSide = newParent.side || 'right'
    }
    
    updateSubtreeSide(draggedNodeId, newSide, yNodes, yEdges)
    
    yNodes.set(draggedNodeId, {
      ...draggedNode,
      parentId: newParentId,
      side: newSide,
      color: newParent.color,
      autoAlign: true
    })
    
    const sourceHandle = newSide === 'left' ? 'source-left' : 'source-right'
    const targetHandle = newSide === 'left' ? 'target-right' : 'target-left'
    
    yEdges.push([{
      id: `e-${newParentId}-${draggedNodeId}`,
      source: newParentId,
      target: draggedNodeId,
      sourceHandle,
      targetHandle,
      color: newParent.color,
      isParentChild: true
    }])
    
    setTimeout(() => applyLayout(), 100)
  }, [yNodes, yEdges, isReadOnly, applyLayout])

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
            isCreatingConnection,
            onAddChild: handleAddChild,
            onToggleAutoAlign: handleToggleAutoAlign,
            onAnchorClick: handleAnchorClick,
            onEditingChange: (editing) => {
              isEditingRef.current = editing
            }
          },
          draggable: !isReadOnly && !isRoot,
        })
      })
      
      setNodes(nodesData)

      const edgesData = yEdges.toArray()
        .filter(edge => !hiddenEdges.has(edge.id))
        .map((edge) => ({
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
      handleAnchorClick, handleUpdateEdge, handleDeleteEdge, isReadOnly, 
      isCreatingConnection, hiddenEdges])

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
        autoAlign: true
      })
    }
  }, [yNodes, mindmap.title, isReadOnly])

  // Node click
  const onNodeClick = useCallback((event, node) => {
    if (isReadOnly || isCreatingConnection) return
    
    setSelectedNode(node)
    const nodeElement = event.target.closest('.react-flow__node')
    if (nodeElement) {
      const rect = nodeElement.getBoundingClientRect()
      setToolbarPosition({ x: rect.left + rect.width / 2, y: rect.top })
    }
  }, [isReadOnly, isCreatingConnection])

  // Clear selection
  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setToolbarPosition(null)
    
    if (isCreatingConnection) {
      cancelConnectionMode()
    }
  }, [isCreatingConnection, cancelConnectionMode])

  // Node drag handlers
  const onNodeDragStart = useCallback((event, node) => {
    if (isReadOnly) return
    
    setDraggedNode(node.id)
    const nodeData = yNodes.get(node.id)
    setDragStartPos(nodeData?.position)
    
    const edgesArray = yEdges.toArray()
    const connectedEdgeIds = edgesArray
      .filter(e => e.source === node.id || e.target === node.id)
      .map(e => e.id)
    
    setHiddenEdges(new Set(connectedEdgeIds))
  }, [yNodes, yEdges, isReadOnly])

  const onNodeDragStop = useCallback((event, node) => {
    if (isReadOnly) return
    
    const nodeData = yNodes.get(node.id)
    if (!nodeData) return
    
    const dropTarget = nodes.find(n => {
      if (n.id === node.id || n.id === 'root-node') return false
      
      const dx = n.position.x - node.position.x
      const dy = n.position.y - node.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      return dist < 50
    })
    
    if (dropTarget) {
      handleReparent(node.id, dropTarget.id)
    } else if (nodeData.autoAlign) {
      yNodes.set(node.id, {
        ...nodeData,
        position: dragStartPos
      })
      setTimeout(() => applyLayout(), 100)
    } else {
      const rootNode = yNodes.get('root-node')
      const newSide = determineFreeNodeSide(node.position.x, rootNode ? rootNode.position.x : 600)
      
      yNodes.set(node.id, { 
        ...nodeData, 
        position: node.position,
        side: newSide
      })
      
      const edgesArray = yEdges.toArray()
      edgesArray.forEach((edge, idx) => {
        if (edge.isParentChild && edge.source === node.id) {
          const targetNode = yNodes.get(edge.target)
          if (targetNode) {
            const sourceHandle = newSide === 'left' ? 'source-left' : 'source-right'
            const targetHandle = newSide === 'left' ? 'target-right' : 'target-left'
            
            yEdges.delete(idx, 1)
            yEdges.insert(idx, [{
              ...edge,
              sourceHandle,
              targetHandle
            }])
          }
        }
      })
    }
    
    setHiddenEdges(new Set())
    setDraggedNode(null)
    setDragStartPos(null)
  }, [yNodes, yEdges, nodes, isReadOnly, handleReparent, applyLayout, dragStartPos])

  // Keyboard shortcuts
  useEffect(() => {
    if (isReadOnly) return
    
    const handleKeyDown = (e) => {
      if (isEditingRef.current) return
      if (!selectedNode && !isCreatingConnection) return
      
      if (e.key === 'Escape' && isCreatingConnection) {
        cancelConnectionMode()
        return
      }
      
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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode, handleAddChild, yNodes, isReadOnly, isCreatingConnection, cancelConnectionMode])

  // Mouse move for connection preview
  const handleMouseMove = useCallback((event) => {
    if (isCreatingConnection && connectionSource) {
      setTempConnectionTarget({ x: event.clientX, y: event.clientY })
    }
  }, [isCreatingConnection, connectionSource])

  // 🔥 Handle AI button click - Close all popups
  const handleAIClick = () => {
    setSelectedNode(null)
    setToolbarPosition(null)
    setIsCreatingConnection(false)
    setConnectionSource(null)
    setTempConnectionTarget(null)
    setShowAIModal(true)
  }

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

      {/* Floating Toolbar */}
      {selectedNode && toolbarPosition && !isReadOnly && !isCreatingConnection && (
        <FloatingToolbar
          selectedNode={selectedNode}
          position={toolbarPosition}
          yNodes={yNodes}
          yEdges={yEdges}
          onToggleAutoAlign={() => handleToggleAutoAlign(selectedNode.id)}
          onStartConnection={handleStartConnectionMode}
          isCreatingConnection={isCreatingConnection}
        />
      )}

      {/* Top Left Buttons */}
      {!isReadOnly && (
        <div className="absolute top-4 left-4 flex flex-col space-y-2 z-10">
          {/* Free Node Button */}
          <button
            onClick={handleAddFreeNode}
            className="bg-white rounded-lg shadow-lg px-3 py-2 hover:shadow-xl transition flex items-center space-x-2"
            title="Add free node (draggable)"
          >
            <PlusCircleIcon className="w-5 h-5 text-gray-700" />
            <span className="text-sm font-medium">Free Node</span>
          </button>

          {/* AI Assistant Button */}
          <button
            onClick={handleAIClick}
            className="bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg shadow-lg px-3 py-2 hover:shadow-xl hover:from-purple-600 hover:to-blue-600 transition flex items-center space-x-2"
            title="AI Assistant"
          >
            <SparklesIcon className="w-5 h-5" />
            <span className="text-sm font-medium">AI Assistant</span>
          </button>
        </div>
      )}

      {/* Active Users */}
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

      {/* Keyboard Shortcuts Help */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg px-4 py-3 text-xs text-gray-600 space-y-1">
        {isReadOnly ? (
          <p>👁️ View-only mode</p>
        ) : isCreatingConnection ? (
          <>
            <p>🔗 <strong>Connection Mode</strong></p>
            <p>Hover node → Click anchor → Repeat</p>
            <p><kbd>ESC</kbd> Cancel</p>
          </>
        ) : (
          <>
            <p><kbd>Tab</kbd> Add child | <kbd>Enter</kbd> Add sibling</p>
            <p><kbd>Double-click</kbd> Edit | <kbd>Del</kbd> Delete</p>
            <p>Drag node onto another to reparent</p>
          </>
        )}
      </div>

      {/* Connection Preview */}
      {isCreatingConnection && connectionSource && tempConnectionTarget && (
        <svg 
          className="absolute inset-0 pointer-events-none" 
          style={{ zIndex: 1000 }}
        >
          <defs>
            <marker
              id="preview-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
            </marker>
          </defs>
          <path
            d={`M ${connectionSource.x},${connectionSource.y} Q ${
              (connectionSource.x + tempConnectionTarget.x) / 2
            },${
              (connectionSource.y + tempConnectionTarget.y) / 2
            } ${tempConnectionTarget.x},${tempConnectionTarget.y}`}
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="5,5"
            fill="none"
            markerEnd="url(#preview-arrow)"
          />
        </svg>
      )}

      {/* AI Assistant Modal */}
      {showAIModal && (
        <AIAssistantModal
          mindmap={mindmap}
          yNodes={yNodes}
          yEdges={yEdges}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  )
}