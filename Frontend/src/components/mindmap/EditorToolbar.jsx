// ==========================================
// FILE: Frontend/src/components/mindmap/EditorToolbar.jsx
// ==========================================
import { 
  ArrowLeftIcon, 
  CloudIcon,
  ClockIcon,
  UserGroupIcon,
  CheckCircleIcon 
} from '@heroicons/react/24/outline'

export default function EditorToolbar({ mindmap, synced, onBack }) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {mindmap.title}
            </h1>
            {mindmap.description && (
              <p className="text-sm text-gray-600">{mindmap.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Sync Status */}
          <div className="flex items-center space-x-2 text-sm">
            {synced ? (
              <>
                <CheckCircleIcon className="w-5 h-5 text-green-500" />
                <span className="text-green-600">Synced</span>
              </>
            ) : (
              <>
                <CloudIcon className="w-5 h-5 text-gray-400 animate-pulse" />
                <span className="text-gray-600">Syncing...</span>
              </>
            )}
          </div>

          {/* Version History Button */}
          <button className="btn-secondary flex items-center space-x-2 text-sm">
            <ClockIcon className="w-4 h-4" />
            <span>History</span>
          </button>

          {/* Share Button */}
          <button className="btn-primary flex items-center space-x-2 text-sm">
            <UserGroupIcon className="w-4 h-4" />
            <span>Share</span>
          </button>
        </div>
      </div>
    </div>
  )
}