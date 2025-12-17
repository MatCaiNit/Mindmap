import { useState, useEffect } from 'react'
import { 
  ArrowLeftIcon, 
  CloudIcon,
  ClockIcon,
  UserGroupIcon,
  CheckCircleIcon,
  BookmarkIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon
} from '@heroicons/react/24/outline'
import { useMutation } from '@tanstack/react-query'
import { versionService } from '../../services/versionService'
import VersionHistoryModal from './VersionHistoryModal'

export default function EditorToolbar({ mindmap, synced, undoManager, onBack }) {
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // DEBUG: Log synced changes
  useEffect(() => {
    console.log('🔄 EditorToolbar - synced changed:', synced)
  }, [synced])

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
    mutationFn: (label) => {
      console.log('🚀 Mutation triggered with label:', label)
      console.log('   Mindmap ID:', mindmap._id)
      return versionService.saveManualVersion(mindmap._id, label)
    },
    onSuccess: (data) => {
      console.log('✅ Save mutation success:', data)
      alert('✅ Version saved successfully!')
      setShowSaveModal(false)
      setSaveLabel('')
    },
    onError: (err) => {
      console.error('❌ Save mutation error:', err)
      alert(`❌ Failed to save: ${err.response?.data?.message || err.message}`)
    }
  })

  const handleManualSave = () => {
    console.log('🖱️ Save Version button clicked')
    console.log('   Mindmap:', mindmap)
    console.log('   Synced:', synced)
    console.log('   Button disabled?', !synced || saveMutation.isLoading)
    setShowSaveModal(true)
  }

  const confirmSave = (e) => {
    e.preventDefault()
    console.log('✅ Confirm save clicked')
    console.log('   Label:', saveLabel)
    console.log('   Is loading?', saveMutation.isLoading)
    saveMutation.mutate(saveLabel)
  }

  const handleUndo = () => {
    if (undoManager && canUndo) {
      undoManager.undo()
    }
  }

  const handleRedo = () => {
    if (undoManager && canRedo) {
      undoManager.redo()
    }
  }

  return (
    <>
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
            {/* Undo/Redo Buttons */}
            <div className="flex items-center space-x-1 border-r pr-4">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Undo (Ctrl+Z)"
              >
                <ArrowUturnLeftIcon className="w-5 h-5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Redo (Ctrl+Shift+Z)"
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

            {/* Save Version Button - TEMPORARILY REMOVE DISABLED */}
            <button 
              onClick={handleManualSave}
              className="btn-secondary flex items-center space-x-2 text-sm disabled:opacity-50"
              disabled={saveMutation.isLoading}
              title={!synced ? '⚠️ Not synced yet, but you can still try to save' : ''}
            >
              <BookmarkIcon className="w-4 h-4" />
              <span>Save Version</span>
              {!synced && <span className="text-xs text-yellow-600">(!synced)</span>}
            </button>

            {/* Version History Button */}
            <button 
              onClick={() => {
                console.log('📖 History button clicked')
                setShowVersionHistory(true)
              }}
              className="btn-secondary flex items-center space-x-2 text-sm"
            >
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

      {/* Version History Modal */}
      {showVersionHistory && (
        <VersionHistoryModal
          mindmapId={mindmap._id}
          onClose={() => {
            console.log('❌ History modal closed')
            setShowVersionHistory(false)
          }}
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
                  onChange={(e) => {
                    console.log('📝 Label changed:', e.target.value)
                    setSaveLabel(e.target.value)
                  }}
                  className="input"
                  placeholder="e.g., Before major changes"
                  autoFocus
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    console.log('❌ Save modal cancelled')
                    setShowSaveModal(false)
                  }}
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