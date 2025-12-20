// Frontend/src/components/mindmap/CustomEdge.jsx - WITH ARROW MARKER

import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow'
import { 
  Cog6ToothIcon,
  TrashIcon 
} from '@heroicons/react/24/outline'

export default function CustomEdge({
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
  const [showConfig, setShowConfig] = useState(false)

  const edgeColor = data?.color || '#3b82f6'
  const edgeWidth = data?.width || 2
  const edgeStyle = data?.style || 'solid'
  const isParentChild = data?.isParentChild || false
  const curvature = data?.curvature || 0.25

  const [edgePath, labelX, labelY] = getBezierPath({
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

  const handleDelete = () => {
    if (data?.onDeleteEdge) {
      data.onDeleteEdge(id)
    }
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

  const EDGE_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#14b8a6', '#64748b'
  ]

  const EDGE_STYLES = [
    { value: 'solid', label: '─', title: 'Solid' },
    { value: 'dashed', label: '┄', title: 'Dashed' },
    { value: 'dotted', label: '┈', title: 'Dotted' }
  ]

  const EDGE_WIDTHS = [1, 2, 3, 4]

  // 🔥 Create unique marker ID for this edge
  const markerId = `arrow-${id}`

  if (isParentChild) {
    // Parent-child edges: simple, no toolbar, with arrow
    return (
      <>
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill={edgeColor} />
          </marker>
        </defs>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            stroke: edgeColor,
            strokeWidth: edgeWidth,
            strokeDasharray: getStrokeDashArray(),
            opacity: 0.7,
            ...style,
          }}
        />
      </>
    )
  }

  return (
    <>
      {/* 🔥 Arrow marker definition */}
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="10"
          refX="5"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill={edgeColor} />
        </marker>
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: edgeColor,
          strokeWidth: edgeWidth,
          strokeDasharray: getStrokeDashArray(),
          cursor: 'pointer',
          ...style,
        }}
      />

      {/* Mini Toolbar - Only when selected */}
      {selected && (
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
            {/* Mini Toolbar */}
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 px-2 py-1.5 flex items-center space-x-2">
              {/* Color Indicator */}
              <div 
                className="w-5 h-5 rounded border border-gray-300 cursor-pointer"
                style={{ backgroundColor: edgeColor }}
                title="Color"
              />
              
              {/* Config Button */}
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="p-1 hover:bg-gray-100 rounded transition"
                title="Settings"
              >
                <Cog6ToothIcon className="w-4 h-4 text-gray-600" />
              </button>
              
              {/* Delete Button */}
              <button
                onClick={handleDelete}
                className="p-1 hover:bg-red-100 rounded transition"
                title="Delete"
              >
                <TrashIcon className="w-4 h-4 text-red-600" />
              </button>
            </div>

            {/* Expanded Config Panel */}
            {showConfig && (
              <div 
                className="absolute top-10 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-2xl border border-gray-200 p-3 min-w-[200px]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Colors */}
                <div className="mb-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Color</p>
                  <div className="grid grid-cols-4 gap-2">
                    {EDGE_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => handleChangeColor(color)}
                        className={`w-8 h-8 rounded border-2 hover:scale-110 transition ${
                          edgeColor === color 
                            ? 'border-gray-900 ring-2 ring-blue-400' 
                            : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Styles */}
                <div className="mb-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Style</p>
                  <div className="flex space-x-1">
                    {EDGE_STYLES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => handleChangeStyle(s.value)}
                        className={`flex-1 px-2 py-1.5 text-lg rounded border transition ${
                          edgeStyle === s.value
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                        title={s.title}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Width */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Width</p>
                  <div className="flex space-x-1">
                    {EDGE_WIDTHS.map(w => (
                      <button
                        key={w}
                        onClick={() => handleChangeWidth(w)}
                        className={`flex-1 px-1 py-2 rounded border transition ${
                          edgeWidth === w
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        <div 
                          className="h-0.5 mx-auto bg-gray-700 rounded"
                          style={{ height: `${w}px`, maxWidth: '24px' }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}