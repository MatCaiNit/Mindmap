// Frontend/src/components/mindmap/MindmapNode.jsx - WITH READ-ONLY MODE
import { useState, useCallback, useEffect, useRef } from 'react'
import { Handle, Position } from 'reactflow'
import { PencilIcon, TrashIcon, LockClosedIcon } from '@heroicons/react/24/outline'

export default function MindmapNode({ data, id }) {
  const [isEditing, setIsEditing] = useState(false)
  const [localLabel, setLocalLabel] = useState(data.label)
  const inputRef = useRef(null)
  
  const isReadOnly = data.isReadOnly || false

  // Sync label from Yjs
  useEffect(() => {
    setLocalLabel(data.label)
  }, [data.label])

  const handleDoubleClick = () => {
    if (isReadOnly) return
    setIsEditing(true)
  }

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    
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

  const handleChange = (e) => {
    setLocalLabel(e.target.value)
  }

  const handleDelete = useCallback((e) => {
    e.stopPropagation()
    if (isReadOnly) return
    if (window.confirm('Delete this node?')) {
      data.yNodes?.delete(id)
    }
  }, [id, data, isReadOnly])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleBlur()
    }
    if (e.key === 'Escape') {
      setLocalLabel(data.label)
      setIsEditing(false)
    }
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  return (
    <div 
      className={`px-4 py-2 rounded-lg border-2 bg-white shadow-md min-w-[120px] group relative hover:shadow-lg transition ${
        isReadOnly ? 'cursor-default' : 'cursor-pointer'
      }`}
      style={{ borderColor: data.color }}
      onDoubleClick={handleDoubleClick}
    >
      <Handle 
        type="target" 
        position={Position.Top}
        isConnectable={!isReadOnly}
      />
      
      {/* Delete button (hidden for read-only) */}
      {!isReadOnly && (
        <button
          onClick={handleDelete}
          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
        >
          <TrashIcon className="w-3 h-3" />
        </button>
      )}
      
      {/* Read-only indicator */}
      {isReadOnly && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-gray-400 text-white rounded-full flex items-center justify-center">
          <LockClosedIcon className="w-3 h-3" />
        </div>
      )}

      {isEditing && !isReadOnly ? (
        <input
          ref={inputRef}
          type="text"
          value={localLabel}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full text-sm font-medium text-gray-900 outline-none bg-transparent"
        />
      ) : (
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-900">{localLabel}</span>
          {!isReadOnly && (
            <PencilIcon className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition" />
          )}
        </div>
      )}
      
      <Handle 
        type="source" 
        position={Position.Bottom}
        isConnectable={!isReadOnly}
      />
    </div>
  )
}