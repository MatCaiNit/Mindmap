// Frontend/src/components/mindmap/EditorToolbar.jsx - UPDATED WITH TABS
import { useState, useEffect } from 'react'
import { 
  ArrowLeftIcon, 
  CloudIcon,
  ClockIcon,
  UserGroupIcon,
  CheckCircleIcon,
  BookmarkIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  EyeIcon,
  LockClosedIcon
} from '@heroicons/react/24/outline'
import { useMutation } from '@tanstack/react-query'
import { versionService } from '../../services/versionService'
import VersionHistoryModal from './VersionHistoryModal'
import CollaboratorsTab from './CollaboratorsTab'

export default function EditorToolbar({ 
  mindmap, 
  synced, 
  undoManager, 
  onBack,
  userRole = 'viewer' // 'owner', 'editor', or 'viewer'
}) {
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showCollaborators, setShowCollaborators] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const isOwner = userRole === 'owner'
  const isEditor = userRole === 'editor' || isOwner
  const isViewer = userRole === 'viewer'

  // Update undo/redo state
  useEffect(() => {
    if (!undoManager) return

    const updateUndoState = () => {
      setCanUndo(undoManager.canUndo())
      setCanRedo(undoManager.canRedo())
    }

    undoManager.on('stack-item-added', updateUndoState)
    undoManager.on('stack-item-popped', updateUndoState)
    
    updateUndoState()

    return () => {
      undoManager.off('stack-item-added', updateUndoState)
      undoManager.off('stack-item-popped', updateUndoState)
    }
  }, [undoManager])

  // Manual save mutation
  const saveMutation = useMutation({
    mutationFn: (label) => versionService.saveManualVersion(mindmap._id, label),
    onSuccess: () => {
      alert('✅ Version saved successfully!')
      setShowSaveModal(false)
      setSaveLabel('')
    },
    onError: (err) => {
      alert(`❌ Failed to save: ${err.response?.data?.message || err.message}`)
    }
  })

  const handleManualSave = () => {
    if (!isEditor) return
    setShowSaveModal(true)
  }

  const confirmSave = (e) => {
    e.preventDefault()
    saveMutation.mutate(saveLabel)
  }

  const handleUndo = () => {
    if (undoManager && canUndo && isEditor) {
      undoManager.undo()
    }
  }

  const handleRedo = () => {
    if (undoManager && canRedo && isEditor) {
      undoManager.redo()
    }
  }

  return (
    <>
      <div className="bg-white border-b border-gray-200">
        {/* Main Toolbar */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="text-gray-600 hover:text-gray-900 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            
            <div>
              <h1 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <span>{mindmap.title}</span>
                {isViewer && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    <EyeIcon className="w-3 h-3 mr-1" />
                    Read-only
                  </span>
                )}
              </h1>
              {mindmap.description && (
                <p className="text-sm text-gray-600">{mindmap.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Undo/Redo - Disabled for viewers */}
            <div className="flex items-center space-x-1 border-r pr-4">
              <button
                onClick={handleUndo}
                disabled={!canUndo || !isEditor}
                className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={isViewer ? "View-only mode" : "Undo (Ctrl+Z)"}
              >
                <ArrowUturnLeftIcon className="w-5 h-5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo || !isEditor}
                className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={isViewer ? "View-only mode" : "Redo (Ctrl+Shift+Z)"}
              >
                <ArrowUturnRightIcon className="w-5 h-5" />
              </button>
            </div>

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

            {/* Save Version - Only for editors */}
            {isEditor && (
              <button 
                onClick={handleManualSave}
                className="btn-secondary flex items-center space-x-2 text-sm disabled:opacity-50"
                disabled={saveMutation.isLoading}
              >
                <BookmarkIcon className="w-4 h-4" />
                <span>Save Version</span>
              </button>
            )}

            {/* Version History */}
            <button 
              onClick={() => setShowVersionHistory(true)}
              className="btn-secondary flex items-center space-x-2 text-sm"
            >
              <ClockIcon className="w-4 h-4" />
              <span>History</span>
            </button>

            {/* Collaborators Button */}
            <button 
              onClick={() => setShowCollaborators(true)}
              className="btn-primary flex items-center space-x-2 text-sm"
            >
              <UserGroupIcon className="w-4 h-4" />
              <span>Team</span>
            </button>
          </div>
        </div>

        {/* Warning Banner for Viewers */}
        {isViewer && (
          <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-100">
            <div className="flex items-center space-x-2 text-sm text-yellow-800">
              <LockClosedIcon className="w-4 h-4" />
              <span>
                You're viewing this mindmap in <strong>read-only mode</strong>. 
                Contact the owner for edit access.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Version History Modal */}
      {showVersionHistory && (
        <VersionHistoryModal
          mindmapId={mindmap._id}
          onClose={() => setShowVersionHistory(false)}
          canRestore={isEditor}
        />
      )}

      {/* Collaborators Sidebar */}
      {showCollaborators && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Collaborators</h2>
            <button
              onClick={() => setShowCollaborators(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <CollaboratorsTab
            mindmapId={mindmap._id}
            isOwner={isOwner}
            currentUserId={mindmap.currentUserId}
          />
        </div>
      )}

      {/* Backdrop for sidebar */}
      {showCollaborators && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 z-40"
          onClick={() => setShowCollaborators(false)}
        />
      )}

      {/* Save Version Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Save Version</h3>
            
            <form onSubmit={confirmSave}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Version Label (optional)
                </label>
                <input
                  type="text"
                  value={saveLabel}
                  onChange={(e) => setSaveLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Before major changes"
                  autoFocus
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="btn-secondary flex-1"
                  disabled={saveMutation.isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isLoading}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {saveMutation.isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}