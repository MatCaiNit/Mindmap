import { memo, useState } from 'react'
import { BaseEdge, getQuadraticPath } from 'reactflow'

function ControlPoint({ x, y, onMouseDown }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={6}
      fill="#2563eb"
      stroke="#fff"
      strokeWidth={2}
      style={{ cursor: 'pointer' }}
      onMouseDown={onMouseDown}
    />
  )
}

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}) {
  const [hover, setHover] = useState(false)

  // ❌ Parent-child edge: không cho chỉnh
  if (data?.isParentChild) {
    const [path] = getQuadraticPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    })
    return <BaseEdge id={id} path={path} />
  }

  const mid = data.mid || {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  }

  const [path] = getQuadraticPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    controlX: mid.x,
    controlY: mid.y,
  })

  const style = {
    stroke: data.color || '#555',
    strokeWidth: data.width || 2,
    strokeDasharray:
      data.style === 'dashed'
        ? '6 4'
        : data.style === 'dotted'
        ? '2 4'
        : '0',
  }

  return (
    <g
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <BaseEdge id={id} path={path} style={style} />

      {hover && (
        <>
          {/* Source */}
          <ControlPoint x={sourceX} y={sourceY} />

          {/* Mid */}
          <ControlPoint
            x={mid.x}
            y={mid.y}
            onMouseDown={(e) => {
              e.stopPropagation()
              data.onStartDragMid?.(id, e)
            }}
          />

          {/* Target */}
          <ControlPoint x={targetX} y={targetY} />
        </>
      )}
    </g>
  )
}

export default memo(CustomEdge)
