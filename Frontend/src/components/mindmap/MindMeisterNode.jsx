// Frontend/src/components/mindmap/MindMeisterNode.jsx - AUTO FOCUS FIXED

import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { Handle, Position } from 'reactflow'
import { PlusCircleIcon } from '@heroicons/react/24/solid'

const MindMeisterNode = memo(({ data, id, selected, dragging }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [localLabel, setLocalLabel] = useState(data.label)
  const [showAnchors, setShowAnchors] = useState(false)
  const inputRef = useRef(null)
  const isComposingRef = useRef(false)
  const editingSetByDataRef = useRef(false) // Track if editing was set by data.editing
  
  const isReadOnly = data.isReadOnly || false
  const level = data.level || 0
  const side = data.side
  const isRoot = data.isRoot || id === 'root-node'
  const autoAlign = data.autoAlign !== false
  const isCreatingConnection = data.isCreatingConnection || false
  
  // Formatting
  const color = data.color || '#3b82f6'
  const textColor = data.textColor || '#ffffff'
  const fontSize = data.fontSize || (level === 0 ? '20px' : level === 1 ? '16px' : '14px')
  const bold = data.bold || (level === 0)
  const italic = data.italic || false
  const underline = data.underline || false
  
  const getNodeStyle = () => {
    const baseStyle = {
      backgroundColor: color,
      color: textColor,
      fontSize,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      textDecoration: underline ? 'underline' : 'none',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }
    
    if (level === 0) {
      return {
        ...baseStyle,
        minWidth: '180px',
        padding: '16px 24px',
        borderRadius: '12px',
        border: `3px solid ${color}`,
        backgroundColor: '#ffffff',
        color: '#1f2937',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }
    } else if (level === 1) {
      return {
        ...baseStyle,
        minWidth: '140px',
        padding: '12px 20px',
        borderRadius: '20px',
        border: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }
    } else {
      return {
        ...baseStyle,
        minWidth: '100px',
        padding: '8px 16px',
        borderRadius: '16px',
        border: 'none',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
      }
    }
  }

  // Sync label from data
  useEffect(() => {
    setLocalLabel(data.label)
  }, [data.label])

  // 🔥 FIX: Auto-focus when node is created - with delay
  useEffect(() => {
    if (data.editing && !isReadOnly && !editingSetByDataRef.current) {
      editingSetByDataRef.current = true
      
      // Delay to ensure node is fully rendered
      setTimeout(() => {
        setIsEditing(true)
        
        // Notify parent immediately
        if (data.onEditingChange) {
          data.onEditingChange(true)
        }
        
        // Clear editing flag after a short delay
        setTimeout(() => {
          const node = data.yNodes.get(id)
          if (node && node.editing) {
            data.yNodes.set(id, { ...node, editing: false })
          }
        }, 100)
      }, 50)
    }
  }, [data.editing, id, data.yNodes, isReadOnly, data.onEditingChange])

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Use double RAF to ensure DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
          }
        })
      })
    }
  }, [isEditing])

  // Double-click to edit
  const handleDoubleClick = () => {
    if (isReadOnly) return
    setIsEditing(true)
    
    if (data.onEditingChange) {
      data.onEditingChange(true)
    }
  }

  // Blur - save changes
  const handleBlur = useCallback(() => {
    // 🔥 FIX: Don't blur during composition
    if (isComposingRef.current) return
    
    setIsEditing(false)
    editingSetByDataRef.current = false
    
    if (data.onEditingChange) {
      data.onEditingChange(false)
    }
    
    if (data.yNodes) {
      const node = data.yNodes.get(id)
      if (node) {
        const finalLabel = localLabel.trim() || 'New Node'
        
        data.yNodes.set(id, {
          ...node,
          label: finalLabel,
        })
      }
    }
  }, [id, localLabel, data])

  // 🔥 FIX: Handle Vietnamese IME composition
  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = (e) => {
    isComposingRef.current = false
    // Update value after composition ends
    setLocalLabel(e.target.value)
  }

  // Keyboard in edit mode
  const handleKeyDown = (e) => {
    // 🔥 FIX: Don't handle shortcuts during IME composition
    if (isComposingRef.current) {
      return
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBlur()
    }
    if (e.key === 'Escape') {
      setLocalLabel(data.label)
      setIsEditing(false)
      editingSetByDataRef.current = false
      if (data.onEditingChange) {
        data.onEditingChange(false)
      }
    }
    // Prevent Tab from leaving input
    if (e.key === 'Tab') {
      e.stopPropagation()
    }
  }

  // Show anchors in connection mode
  const handleMouseEnter = () => {
    if (isCreatingConnection) {
      setShowAnchors(true)
    }
  }

  const handleMouseLeave = () => {
    setShowAnchors(false)
  }

  // Click anchor
  const handleAnchorClick = (anchorId) => (e) => {
    e.stopPropagation()
    if (data.onAnchorClick) {
      data.onAnchorClick(id, anchorId, e)
    }
  }

  const nodeStyle = getNodeStyle()
  const addButtonPosition = side === 'left' ? 'left' : 'right'

  return (
    <div 
      className="relative group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`
          cursor-pointer
          ${selected ? 'ring-4 ring-primary-400 ring-opacity-50' : ''}
          ${!isReadOnly ? 'hover:shadow-lg hover:scale-105' : ''}
          ${dragging ? 'opacity-50' : ''}
        `}
        style={nodeStyle}
        onDoubleClick={handleDoubleClick}
      >
        {/* Anchors - only in connection mode */}
        {isCreatingConnection && showAnchors && (
          <>
            <div
              onClick={handleAnchorClick('top')}
              className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-pointer hover:bg-blue-600 hover:scale-110 transition z-10 flex items-center justify-center text-white text-xs font-bold"
              title="Top"
            >
              +
            </div>
            
            <div
              onClick={handleAnchorClick('right')}
              className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-pointer hover:bg-blue-600 hover:scale-110 transition z-10 flex items-center justify-center text-white text-xs font-bold"
              title="Right"
            >
              +
            </div>
            
            <div
              onClick={handleAnchorClick('bottom')}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-pointer hover:bg-blue-600 hover:scale-110 transition z-10 flex items-center justify-center text-white text-xs font-bold"
              title="Bottom"
            >
              +
            </div>
            
            <div
              onClick={handleAnchorClick('left')}
              className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-pointer hover:bg-blue-600 hover:scale-110 transition z-10 flex items-center justify-center text-white text-xs font-bold"
              title="Left"
            >
              +
            </div>
          </>
        )}

        {/* Content */}
        {isEditing && !isReadOnly ? (
          <input
            ref={inputRef}
            type="text"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            className="w-full font-inherit outline-none bg-transparent text-center"
            style={{ 
              color: nodeStyle.color,
              fontSize: nodeStyle.fontSize,
              fontWeight: nodeStyle.fontWeight,
              fontStyle: nodeStyle.fontStyle,
              textDecoration: nodeStyle.textDecoration
            }}
          />
        ) : (
          <div 
            className="text-center whitespace-pre-wrap break-words"
            style={{
              fontSize: nodeStyle.fontSize,
              fontWeight: nodeStyle.fontWeight,
              fontStyle: nodeStyle.fontStyle,
              textDecoration: nodeStyle.textDecoration
            }}
          >
            {localLabel || 'Empty'}
          </div>
        )}

        {/* React Flow Handles - Hidden */}
        <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" id="target-top" />
        <Handle type="target" position={Position.Right} className="!opacity-0 !w-1 !h-1" id="target-right" />
        <Handle type="target" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" id="target-bottom" />
        <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" id="target-left" />
        <Handle type="source" position={Position.Top} className="!opacity-0 !w-1 !h-1" id="source-top" />
        <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" id="source-right" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" id="source-bottom" />
        <Handle type="source" position={Position.Left} className="!opacity-0 !w-1 !h-1" id="source-left" />
      </div>

      {/* Add Button */}
      {!isReadOnly && !isCreatingConnection && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            data.onAddChild?.(id)
          }}
          className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
          style={{ 
            [addButtonPosition === 'left' ? 'left' : 'right']: '-16px',
            zIndex: 10 
          }}
          title="Add child node (Tab)"
        >
          <PlusCircleIcon 
            className="w-8 h-8 drop-shadow-lg"
            style={{ color: color }}
          />
        </button>
      )}

      {/* Lock indicator */}
      {!isRoot && !autoAlign && !dragging && (
        <div 
          className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-xs shadow-lg"
          title="Unlocked (draggable)"
        >
          🔓
        </div>
      )}
    </div>
  )
})

MindMeisterNode.displayName = 'MindMeisterNode'

export default MindMeisterNode