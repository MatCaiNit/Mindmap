// ==========================================
// FILE: Frontend/src/components/mindmap/Cursor.jsx
// ==========================================
/**
 * Live cursor component for other users
 */
export default function Cursor({ user, position, color }) {
  if (!position) return null

  return (
    <div
      className="pointer-events-none absolute z-50 transition-all duration-100"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Cursor SVG */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5.65376 12.3673L13.0526 4.96843L13.4211 12.8742L17.6316 14.7895L5.65376 12.3673Z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      {/* User label */}
      <div
        className="absolute top-5 left-6 px-2 py-1 rounded text-xs font-medium text-white whitespace-nowrap"
        style={{ backgroundColor: color }}
      >
        {user?.name || user?.email || 'Anonymous'}
      </div>
    </div>
  )
}