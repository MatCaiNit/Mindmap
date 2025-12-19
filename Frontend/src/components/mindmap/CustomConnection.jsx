// Frontend/src/components/mindmap/CustomConnection.jsx
import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow'

export default function CustomConnection({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  selected,
}) {
  const [showMenu, setShowMenu] = useState(false)

  const color = data?.color || '#6366f1'
  const width = data?.width || 2
  const strokeStyle = data?.style || 'solid'
  const curvature = data?.curvature || 0.25

  // Custom control points with curvature
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const midX = sourceX + dx * 0.5
  const midY = sourceY + dy * 0.5

  // Apply curvature offset perpendicular to line
  const angle = Math.atan2(dy, dx) + Math.PI / 2
  const offsetX = Math.cos(angle) * curvature * 200
  const offsetY = Math.sin(angle) * curvature * 200

  const controlX = midX + offsetX
  const controlY = midY + offsetY

  const path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`

  const getStrokeDashArray = () => {
    switch (strokeStyle) {
      case 'dashed': return '10,5'
      case 'dotted': return '2,4'
      default: return 'none'
    }
  }

  const handleDelete = () => {
    if (data?.onDelete) {
      data.onDelete(id)
    }
    setShowMenu(false)
  }

  const handleChangeColor = (newColor) => {
    if (data?.onUpdate) {
      data.onUpdate(id, { color: newColor })
    }
  }

  const handleChangeWidth = (newWidth) => {
    if (data?.onUpdate) {
      data.onUpdate(id, { width: newWidth })
    }
  }

  const handleChangeStyle = (newStyle) => {
    if (data?.onUpdate) {
      data.onUpdate(id, { style: newStyle })
    }
  }

  const COLORS = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
  const WIDTHS = [1, 2, 3, 4, 5]
  const STYLES = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dash' },
    { value: 'dotted', label: 'Dot' }
  ]

  return (
    <>
      {/* Connection Path */}
      <path
        d={path}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={getStrokeDashArray()}
        fill="none"
        strokeLinecap="round"
        markerEnd="url(#arrowhead)"
        onClick={() => setShowMenu(true)}
        style={{ cursor: 'pointer' }}
      />

      {/* Control Point (draggable) */}
      {selected && (
        <>
          {/* Source Handle */}
          <circle
            cx={sourceX}
            cy={sourceY}
            r={6}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
          />

          {/* Target Handle */}
          <circle
            cx={targetX}
            cy={targetY}
            r={6}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
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
            onMouseDown={(e) => {
              e.stopPropagation()
              if (data?.onDragControl) {
                data.onDragControl(id, 'mid')
              }
            }}
          />
        </>
      )}

      {/* Edit Menu */}
      {showMenu && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${controlX}px, ${controlY}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
          >
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-3 min-w-[180px]">
              {/* Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b">
                <span className="text-xs font-semibold text-gray-700">Connection</span>
                <button
                  onClick={() => setShowMenu(false)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Color */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-2">Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => handleChangeColor(c)}
                      className={`w-7 h-7 rounded-full border-2 hover:scale-110 transition ${
                        color === c ? 'border-gray-900 ring-2 ring-blue-400' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Style */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-2">Style</label>
                <div className="grid grid-cols-3 gap-1">
                  {STYLES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => handleChangeStyle(s.value)}
                      className={`px-2 py-1.5 text-xs rounded border transition ${
                        strokeStyle === s.value
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
                  Width ({width}px)
                </label>
                <div className="flex gap-1">
                  {WIDTHS.map(w => (
                    <button
                      key={w}
                      onClick={() => handleChangeWidth(w)}
                      className={`flex-1 px-1 py-2 rounded border transition ${
                        width === w
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      <div 
                        className="h-0.5 mx-auto bg-gray-700 rounded"
                        style={{ height: `${w}px`, maxWidth: '30px' }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={handleDelete}
                className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition font-medium"
              >
                Delete Connection
              </button>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Arrow Marker Definition */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill={color} />
        </marker>
      </defs>
    </>
  )
}