// Frontend/src/components/mindmap/CustomEdge.jsx - FULL FEATURES

import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow'

export default function CustomEdge({
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
}) {
  const [showMenu, setShowMenu] = useState(false)

  const isParentChild = data?.isParentChild || false
  const edgeColor = data?.color || '#3b82f6'
  const edgeWidth = data?.width || 2
  const edgeStyle = data?.style || 'solid'
  const curvature = data?.curvature || 0.25

  // Calculate custom bezier path with curvature
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const midX = sourceX + dx * 0.5
  const midY = sourceY + dy * 0.5

  // Apply curvature offset perpendicular to line
  const angle = Math.atan2(dy, dx) + Math.PI / 2
  const curvatureFactor = curvature * 200
  const offsetX = Math.cos(angle) * curvatureFactor
  const offsetY = Math.sin(angle) * curvatureFactor

  const controlX = midX + offsetX
  const controlY = midY + offsetY

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
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
    
    if (isParentChild) {
      // Can't edit parent-child edges
      return
    }
    
    setShowMenu(true)
  }

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

  const handleChangeCurvature = (curvature) => {
    if (data?.onUpdateEdge) {
      data.onUpdateEdge(id, { curvature })
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
          cursor: isParentChild ? 'default' : 'pointer',
          opacity: isParentChild ? 0.5 : 1,
          ...style,
        }}
        onClick={handleEdgeClick}
      />

      {/* 🔥 Control Points - Only for custom edges */}
      {!isParentChild && selected && (
        <>
          {/* Source Point */}
          <circle
            cx={sourceX}
            cy={sourceY}
            r={6}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            className="pointer-events-auto"
          />

          {/* Mid Control Point */}
          <circle
            cx={controlX}
            cy={controlY}
            r={8}
            fill="#10b981"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'move' }}
            className="pointer-events-auto"
            onMouseDown={(e) => {
              e.stopPropagation()
              // TODO: Implement drag to adjust curvature
            }}
          />

          {/* Target Point */}
          <circle
            cx={targetX}
            cy={targetY}
            r={6}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            className="pointer-events-auto"
          />
        </>
      )}

      {/* Edit Menu - Only for custom edges */}
      {!isParentChild && (showMenu || selected) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${controlX}px, ${controlY}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 min-w-[280px] max-h-[600px] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b">
                <span className="text-sm font-semibold text-gray-700">Connection Settings</span>
                <button
                  onClick={handleCloseMenu}
                  className="text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100"
                >
                  ✕
                </button>
              </div>

              {/* Info */}
              <div className="mb-4 text-xs text-gray-600 bg-blue-50 p-2 rounded">
                <p className="mb-1">💡 <strong>Tip:</strong> Drag control points to adjust</p>
                <p>• Blue dots: endpoints</p>
                <p>• Green dot: curvature</p>
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
              <div className="mb-3">
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

              {/* Curvature */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Curvature: {curvature.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={curvature}
                  onChange={(e) => handleChangeCurvature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Straight</span>
                  <span>Curved</span>
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={handleDelete}
                className="w-full px-3 py-2 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition font-medium"
              >
                Delete Connection
              </button>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* 🔥 Parent-Child Edge Indicator */}
      {isParentChild && selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${controlX}px, ${controlY}px)`,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg">
              Parent-child (locked)
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}