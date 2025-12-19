// Frontend/src/components/mindmap/CurvedEdge.jsx - WITH HANDLE SELECTOR

import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow'

export default function CurvedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
  source,
  target,
  sourceHandleId,
  targetHandleId,
}) {
  const [showMenu, setShowMenu] = useState(false)

  const edgeColor = data?.color || '#3b82f6'
  const edgeWidth = data?.width || 3
  const edgeStyle = data?.style || 'solid'

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const getStrokeDashArray = () => {
    switch (edgeStyle) {
      case 'dashed': return '10,5'
      case 'dotted': return '2,4'
      default: return 'none'
    }
  }

  const handleEdgeClick = (e) => {
    e.stopPropagation()
    setShowMenu(true)
  }

  // 🔥 FIX: Close menu properly
  const handleCloseMenu = (e) => {
    e.stopPropagation()
    setShowMenu(false)
  }

  const handleDelete = () => {
    if (data?.onDeleteEdge) {
      data.onDeleteEdge(id)
    }
    setShowMenu(false)
  }

  const handleChangeColor = (color) => {
    if (data?.onUpdateEdge) {
      data.onUpdateEdge(id, { color })
    }
  }

  const handleChangeStyle = (style) => {
    if (data?.onUpdateEdge) {
      data.onUpdateEdge(id, { style })
    }
  }

  const handleChangeWidth = (width) => {
    if (data?.onUpdateEdge) {
      data.onUpdateEdge(id, { width })
    }
  }

  // 🔥 NEW: Change handles
  const handleChangeSourceHandle = (handleId) => {
    if (data?.onUpdateEdge) {
      data.onUpdateEdge(id, { sourceHandle: handleId })
    }
  }

  const handleChangeTargetHandle = (handleId) => {
    if (data?.onUpdateEdge) {
      data.onUpdateEdge(id, { targetHandle: handleId })
    }
  }

  const EDGE_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#14b8a6', '#64748b'
  ]

  const EDGE_STYLES = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' }
  ]

  const EDGE_WIDTHS = [1, 2, 3, 4, 5, 6]

  const HANDLES = [
    { id: 'top', label: '⬆️ Top' },
    { id: 'right', label: '➡️ Right' },
    { id: 'bottom', label: '⬇️ Bottom' },
    { id: 'left', label: '⬅️ Left' }
  ]

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: edgeColor,
          strokeWidth: edgeWidth,
          strokeDasharray: getStrokeDashArray(),
          cursor: 'pointer',
          ...style,
        }}
        onClick={handleEdgeClick}
      />

      {(showMenu || selected) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 min-w-[280px] max-h-[600px] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b">
                <span className="text-sm font-semibold text-gray-700">Edge Settings</span>
                <button
                  onClick={handleCloseMenu}
                  className="text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100"
                >
                  ✕
                </button>
              </div>

              {/* Info */}
              <div className="mb-4 text-xs text-gray-600 bg-blue-50 p-2 rounded">
                <p className="mb-1">💡 <strong>Reconnect:</strong> Drag edge handle</p>
                <p>Or use dropdowns below to change connection points</p>
              </div>

              {/* 🔥 NEW: Connection Points */}
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Connection Points</h4>
                
                {/* Source Handle */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-600 mb-1">
                    From (Source):
                  </label>
                  <select
                    value={sourceHandleId?.replace('source-', '') || 'right'}
                    onChange={(e) => handleChangeSourceHandle(`source-${e.target.value}`)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {HANDLES.map(h => (
                      <option key={h.id} value={h.id}>{h.label}</option>
                    ))}
                  </select>
                </div>

                {/* Target Handle */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    To (Target):
                  </label>
                  <select
                    value={targetHandleId?.replace('target-', '') || 'left'}
                    onChange={(e) => handleChangeTargetHandle(`target-${e.target.value}`)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {HANDLES.map(h => (
                      <option key={h.id} value={h.id}>{h.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Color */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-2">Color</label>
                <div className="grid grid-cols-4 gap-2">
                  {EDGE_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => handleChangeColor(color)}
                      className={`w-10 h-10 rounded border-2 hover:scale-110 transition ${
                        edgeColor === color 
                          ? 'border-gray-900 ring-2 ring-blue-400' 
                          : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Style */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-2">Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {EDGE_STYLES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => handleChangeStyle(s.value)}
                      className={`px-2 py-2 text-xs rounded border-2 transition ${
                        edgeStyle === s.value
                          ? 'border-blue-600 bg-blue-50 text-blue-600'
                          : 'border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Width */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Width ({edgeWidth}px)
                </label>
                <div className="flex space-x-1">
                  {EDGE_WIDTHS.map(w => (
                    <button
                      key={w}
                      onClick={() => handleChangeWidth(w)}
                      className={`flex-1 px-1 py-2 rounded border-2 transition ${
                        edgeWidth === w
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      <div 
                        className="h-1 mx-auto bg-gray-700 rounded"
                        style={{ height: `${w}px` }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={handleDelete}
                className="w-full px-3 py-2 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition font-medium"
              >
                Delete Edge
              </button>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}