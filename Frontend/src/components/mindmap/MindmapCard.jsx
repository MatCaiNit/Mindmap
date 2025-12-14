// ==========================================
// FILE: Frontend/src/components/mindmap/MindmapCard.jsx
// ==========================================
import { useNavigate } from 'react-router-dom'
import { TrashIcon, CalendarIcon } from '@heroicons/react/24/outline'

export default function MindmapCard({ mindmap, onDelete }) {
  const navigate = useNavigate()

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to delete this mindmap?')) {
      onDelete()
    }
  }

  return (
    <div
      onClick={() => navigate(`/mindmap/${mindmap._id}`)}
      className="card p-6 hover:shadow-md transition cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition">
          {mindmap.title}
        </h3>
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-600"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>

      {mindmap.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
          {mindmap.description}
        </p>
      )}

      <div className="flex items-center text-xs text-gray-500">
        <CalendarIcon className="w-4 h-4 mr-1" />
        <span>Updated {formatDate(mindmap.updatedAt)}</span>
      </div>
    </div>
  )
}
