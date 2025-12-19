// Frontend/src/components/mindmap/MindMeisterNode.jsx - FULL FEATURES

import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { Handle, Position } from 'reactflow'
import { PlusCircleIcon } from '@heroicons/react/24/solid'

const MindMeisterNode = memo(({ data, id, selected }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [localLabel, setLocalLabel] = useState(data.label)
  const inputRef = useRef(null)
  
  const isReadOnly = data.isReadOnly || false
  const level = data.level || 0
  const side = data.side
  const isRoot = data.isRoot || id === 'root-node'
  const autoAlign = data.autoAlign !== false
  const layoutMode = data.layoutMode || 'balanced'
  
  // Formatting from node data
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
      cursor: autoAlign ? 'default' : 'move',
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

  useEffect(() => {
    setLocalLabel(data.label)
  }, [data.label])

  const handleDoubleClick = () => {
    if (isReadOnly) return
    setIsEditing(true)
    
    if (data.onEditingChange) {
      data.onEditingChange(true)
    }
  }

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    
    if (data.onEditingChange) {
      data.onEditingChange(false)
    }
    
    if (data.yNodes && localLabel !== data.label) {
      const node = data.yNodes.get(id)
      if (node) {
        data.yNodes.set(id, {
          ...node,
          label: localLabel,
        })
      }
    }
  }, [id, localLabel, data])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBlur()
    }
    if (e.key === 'Escape') {
      setLocalLabel(data.label)
      setIsEditing(false)
      if (data.onEditingChange) {
        data.onEditingChange(false)
      }
    }
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const nodeStyle = getNodeStyle()

  // 🔥 Determine + button position based on layout mode
  const addButtonPosition = layoutMode === 'tree' 
    ? 'right' 
    : (side === 'left' ? 'left' : 'right')

  return (
    <div className="relative group">
      <div
        className={`
          ${autoAlign ? 'cursor-default' : 'cursor-move'}
          ${selected ? 'ring-4 ring-primary-400 ring-opacity-50' : ''}
          ${!isReadOnly ? 'hover:shadow-lg hover:scale-105' : ''}
        `}
        style={nodeStyle}
        onDoubleClick={handleDoubleClick}
      >
        {/* 🔥 4 HANDLES - Always visible when selected for connections */}
        <Handle
          type="target"
          position={Position.Top}
          className={`w-3 h-3 !bg-blue-500 !border-2 !border-white transition ${
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
          }`}
          id="target-top"
        />
        
        <Handle
          type="target"
          position={Position.Right}
          className={`w-3 h-3 !bg-blue-500 !border-2 !border-white transition ${
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
          }`}
          id="target-right"
        />
        
        <Handle
          type="target"
          position={Position.Bottom}
          className={`w-3 h-3 !bg-blue-500 !border-2 !border-white transition ${
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
          }`}
          id="target-bottom"
        />
        
        <Handle
          type="target"
          position={Position.Left}
          className={`w-3 h-3 !bg-blue-500 !border-2 !border-white transition ${
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
          }`}
          id="target-left"
        />

        {/* Content */}
        {isEditing && !isReadOnly ? (
          <input
            ref={inputRef}
            type="text"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
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
            {localLabel}
          </div>
        )}

        {/* Source handles */}
        <Handle
          type="source"
          position={Position.Top}
          className={`w-3 h-3 !bg-green-500 !border-2 !border-white transition ${
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
          }`}
          id="source-top"
        />
        
        <Handle
          type="source"
          position={Position.Right}
          className={`w-3 h-3 !bg-green-500 !border-2 !border-white transition ${
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
          }`}
          id="source-right"
        />
        
        <Handle
          type="source"
          position={Position.Bottom}
          className={`w-3 h-3 !bg-green-500 !border-2 !border-white transition ${
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
          }`}
          id="source-bottom"
        />
        
        <Handle
          type="source"
          position={Position.Left}
          className={`w-3 h-3 !bg-green-500 !border-2 !border-white transition ${
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'
          }`}
          id="source-left"
        />
      </div>

      {/* Add Button - 🔥 Position based on layout mode */}
      {!isReadOnly && (
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

      {/* 🔥 Lock indicator */}
      {!isRoot && !autoAlign && (
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