// ==========================================
// FILE: Frontend/src/components/mindmap/MindmapNode.jsx
// ==========================================
import { useState, useCallback } from 'react'
import { Handle, Position } from 'reactflow'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'

export default function MindmapNode({ data, id }) {
  const [isEditing, setIsEditing] = useState(false)
  const [label, setLabel] = useState(data.label)

  const handleDoubleClick = () => {
    setIsEditing(true)
  }

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    
    if (data.yNodes && label !== data.label) {
      const node = data.yNodes.get(id)
      if (node) {
        data.yNodes.set(id, {
          ...node,
          label: label,
        })
      }
    }
  }, [id, label, data])

  const handleDelete = useCallback((e) => {
    e.stopPropagation()
    if (window.confirm('Delete this node?')) {
      data.yNodes?.delete(id)
    }
  }, [id, data])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleBlur()
    }
  }

  return (
    <div 
      className="px-4 py-2 rounded-lg border-2 bg-white shadow-md min-w-[120px] group relative hover:shadow-lg transition"
      style={{ borderColor: data.color }}
      onDoubleClick={handleDoubleClick}
    >
      <Handle type="target" position={Position.Top} />
      
      <button
        onClick={handleDelete}
        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
      >
        <TrashIcon className="w-3 h-3" />
      </button>

      {isEditing ? (
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full text-sm font-medium text-gray-900 outline-none bg-transparent"
        />
      ) : (
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-900">{label}</span>
          <PencilIcon className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition" />
        </div>
      )}
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}