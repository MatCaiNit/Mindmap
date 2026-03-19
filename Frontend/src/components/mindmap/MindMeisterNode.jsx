// Frontend/src/components/mindmap/MindMeisterNode.jsx - WITH THEME SUPPORT

import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { Handle, Position } from 'reactflow'
import { PlusCircleIcon } from '@heroicons/react/24/solid'

const MindMeisterNode = memo(({ data, id, selected, dragging }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [localLabel, setLocalLabel] = useState(data.label)
  const [showAnchors, setShowAnchors] = useState(false)
  const inputRef = useRef(null)
  const isComposingRef = useRef(false)
  const editingSetByDataRef = useRef(false)
   const [showPdfSource, setShowPdfSource] = useState(false)
  const isReadOnly = data.isReadOnly || false
  const level = data.level || 0
  const side = data.side
  const isRoot = data.isRoot || id === 'root-node'
  const autoAlign = data.autoAlign !== false
  const isCreatingConnection = data.isCreatingConnection || false
  const pdfSource = data.pdfSource || null   // ← MỚI
  
  // Theme & Formatting (from data or defaults)
  const color = data.color || '#3b82f6'
  const textColor = data.textColor || (level === 0 ? '#1f2937' : '#ffffff')
  const fontSize = data.fontSize || (level === 0 ? '20px' : level === 1 ? '16px' : '14px')
  const fontWeight = data.fontWeight || (level === 0 ? 'bold' : level === 1 ? '600' : '500')
  const borderRadius = data.borderRadius || (level === 0 ? '12px' : level === 1 ? '20px' : '16px')
  const fontFamily = data.fontFamily || 'inherit'
  const transform = data.transform || 'none'
  
  const bold = data.bold || (level === 0)
  const italic = data.italic || false
  const underline = data.underline || false

  // Sync label from data
  useEffect(() => {
    setLocalLabel(data.label)
  }, [data.label])

  // Auto-focus when node is created
  useEffect(() => {
    if (data.editing && !isReadOnly && !editingSetByDataRef.current) {
      editingSetByDataRef.current = true
      
      setTimeout(() => {
        setIsEditing(true)
        
        if (data.onEditingChange) {
          data.onEditingChange(true)
        }
        
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

  const handleDoubleClick = () => {
    if (isReadOnly) return
    setIsEditing(true)
    
    if (data.onEditingChange) {
      data.onEditingChange(true)
    }
  }

  const handleBlur = useCallback(() => {
    if (isComposingRef.current) return
    
    setIsEditing(false)
    editingSetByDataRef.current = false
    
    if (data.onEditingChange) {
      data.onEditingChange(false)
    }
    
    if (data.yNodes) {
      const node = data.yNodes.get(id)
      if (node) {
        const isRoot = id === 'root-node' || node.isRoot
        const finalLabel = localLabel.trim() 
                          ? localLabel.trim() 
                          : (isRoot ? node.label : 'New Node')
        
        data.yNodes.set(id, {
          ...node,
          label: finalLabel,
        })
      }
    }
  }, [id, localLabel, data])

  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = (e) => {
    isComposingRef.current = false
    setLocalLabel(e.target.value)
  }

  const handleKeyDown = (e) => {
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
    if (e.key === 'Tab') {
      e.stopPropagation()
    }
  }

  const handleMouseEnter = () => {
    if (isCreatingConnection) {
      setShowAnchors(true)
    }
  }

  const handleMouseLeave = () => {
    setShowAnchors(false)
  }

  const handleAnchorClick = (anchorId) => (e) => {
    e.stopPropagation()
    if (data.onAnchorClick) {
      data.onAnchorClick(id, anchorId, e)
    }
  }

  // 🔥 GET NODE STYLE - WITH THEME SUPPORT
  const getNodeStyle = () => {
    // Base style with theme properties from node data
    const baseStyle = {
      backgroundColor: data.background || color,
      background: data.background || color, // Support gradients
      color: textColor,
      fontSize,
      fontWeight: bold ? 'bold' : fontWeight,
      fontStyle: italic ? 'italic' : 'normal',
      textDecoration: underline ? 'underline' : 'none',
      fontFamily,
      borderRadius,
      transform,
      transition: 'all 0.2s ease',
      cursor: 'pointer',
      
      // 🎨 Apply theme-specific properties from node data
      border: data.border || 'none',
      boxShadow: data.boxShadow || (level === 0 ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.08)'),
      padding: data.padding || (level === 0 ? '16px 24px' : level === 1 ? '12px 20px' : '8px 16px'),
      letterSpacing: data.letterSpacing || 'normal',
      filter: data.filter || 'none',
      position: 'relative',
    }
    
    if (level === 0) {
      return {
        ...baseStyle,
        minWidth: '180px',
      }
    } else if (level === 1) {
      return {
        ...baseStyle,
        minWidth: '140px',
      }
    } else {
      return {
        ...baseStyle,
        minWidth: '100px',
      }
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
        {/* ── PDF SOURCE ICON ── */}
          {pdfSource && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowPdfSource(true) }}
              title="Xem nguồn trong PDF"
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '18px',
                height: '18px',
                borderRadius: '4px',
                background: 'rgba(255,255,255,0.25)',
                border: '1px solid rgba(255,255,255,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
                fontSize: '10px',
              }}
            >
              📄
            </button>
          )}

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
              textDecoration: nodeStyle.textDecoration,
              fontFamily: nodeStyle.fontFamily
            }}
          />
        ) : (
          <div 
            className="text-center whitespace-pre-wrap break-words"
            style={{
              fontSize: nodeStyle.fontSize,
              fontWeight: nodeStyle.fontWeight,
              fontStyle: nodeStyle.fontStyle,
              textDecoration: nodeStyle.textDecoration,
              fontFamily: nodeStyle.fontFamily
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

      {/* Theme indicator (only show in dev mode) */}
      {data.themeMetadata && process.env.NODE_ENV === 'development' && (
        <div 
          className="absolute -bottom-2 -left-2 text-[8px] bg-black text-white px-1 rounded opacity-50"
          title={`Theme: ${data.themeMetadata.themeName}`}
        >
          {data.theme || 'default'}
        </div>
      )}
      {/* PDF Source Modal */}
      {showPdfSource && pdfSource && (
        <PDFSourceModal
          source={pdfSource}
          nodeLabel={localLabel}
          onClose={() => setShowPdfSource(false)}
        />
      )}
    </div>
    
  )
})

MindMeisterNode.displayName = 'MindMeisterNode'

export default MindMeisterNode