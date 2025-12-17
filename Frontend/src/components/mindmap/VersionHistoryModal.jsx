// Frontend/src/components/mindmap/VersionHistoryModal.jsx - FIXED RESTORE
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { versionService } from '../../services/versionService'
import { clearIndexedDB } from '../../lib/yjs'
import { 
  XMarkIcon, 
  ClockIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

export default function VersionHistoryModal({ mindmapId, onClose }) {
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const queryClient = useQueryClient()

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['versions', mindmapId],
    queryFn: () => versionService.listVersions(mindmapId),
  })

  const restoreMutation = useMutation({
    mutationFn: async (versionId) => {
      console.log('🔄 Starting restore process...')
      
      // 1. Call backend restore API
      const result = await versionService.restoreVersion(mindmapId, versionId)
      console.log('✅ Backend restore complete')
      
      return result
    },
    onSuccess: async (data) => {
      console.log('✅ Restore mutation successful')
      
      // Close modals immediately
      setShowRestoreConfirm(false)
      setSelectedVersion(null)
      onClose()
      
      // Show persistent loading toast
      const toastContainer = document.createElement('div')
      toastContainer.id = 'restore-toast-container'
      toastContainer.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999;'
      
      const toast = document.createElement('div')
      toast.className = 'bg-white rounded-xl shadow-2xl p-6 min-w-[300px]'
      toast.innerHTML = `
        <div class="flex flex-col items-center space-y-4">
          <div class="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          <div class="text-center">
            <h3 class="text-lg font-bold text-gray-900 mb-1">Restoring Version</h3>
            <p class="text-sm text-gray-600">Please wait, do not close this tab...</p>
          </div>
        </div>
      `
      toastContainer.appendChild(toast)
      document.body.appendChild(toastContainer)
      
      try {
        // 2. Get mindmap ydocId
        const mindmap = queryClient.getQueryData(['mindmap', mindmapId])
        if (!mindmap?.ydocId) {
          throw new Error('Mindmap data not found')
        }
        
        console.log('🗑️ Clearing IndexedDB for:', mindmap.ydocId)
        
        // 3. Clear IndexedDB cache (CRITICAL!)
        await clearIndexedDB(mindmap.ydocId)
        console.log('✅ IndexedDB cleared')
        
        // 4. Wait for Realtime server to fully apply snapshot
        // This gives time for:
        // - Backend to update Mindmap.snapshot
        // - Realtime to disconnect old clients
        // - Realtime to apply new snapshot
        console.log('⏳ Waiting for sync (3s)...')
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // 5. Invalidate queries
        await queryClient.invalidateQueries(['versions', mindmapId])
        await queryClient.invalidateQueries(['mindmap', mindmapId])
        
        console.log('✅ All cleanup complete')
        
        // 6. Show success message briefly
        toast.innerHTML = `
          <div class="flex flex-col items-center space-y-4">
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div class="text-center">
              <h3 class="text-lg font-bold text-gray-900 mb-1">Restore Complete!</h3>
              <p class="text-sm text-gray-600">Reloading page...</p>
            </div>
          </div>
        `
        
        // 7. Reload after short delay
        setTimeout(() => {
          console.log('🔄 Performing hard reload...')
          window.location.reload()
        }, 1500)
        
      } catch (error) {
        console.error('❌ Restore error:', error)
        
        // Remove loading toast
        const container = document.getElementById('restore-toast-container')
        if (container) container.remove()
        
        // Show error toast
        const errorToast = document.createElement('div')
        errorToast.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[100] animate-slide-up'
        errorToast.innerHTML = `
          <div class="flex items-center space-x-3">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Restore failed: ${error.message}</span>
          </div>
        `
        document.body.appendChild(errorToast)
        
        setTimeout(() => errorToast.remove(), 5000)
      }
    },
    onError: (err) => {
      console.error('❌ Restore API failed:', err)
      
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[100]'
      toast.textContent = `❌ Restore failed: ${err.response?.data?.message || err.message}`
      document.body.appendChild(toast)
      
      setTimeout(() => toast.remove(), 5000)
    }
  })

  const formatDate = (date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatSize = (bytes) => {
    if (!bytes) return 'N/A'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getTypeLabel = (type) => {
    const labels = {
      manual: 'Manual Save',
      auto: 'Auto Save',
      restore: 'Restored',
      'delete-backup': 'Backup'
    }
    return labels[type] || type
  }

  const getTypeColor = (type) => {
    const colors = {
      manual: 'bg-blue-100 text-blue-800',
      auto: 'bg-gray-100 text-gray-800',
      restore: 'bg-green-100 text-green-800',
      'delete-backup': 'bg-yellow-100 text-yellow-800'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const handleRestore = (version) => {
    setSelectedVersion(version)
    setShowRestoreConfirm(true)
  }

  const confirmRestore = () => {
    if (selectedVersion) {
      console.log('🔄 User confirmed restore:', selectedVersion.id || selectedVersion._id)
      restoreMutation.mutate(selectedVersion.id || selectedVersion._id)
    }
  }

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <ClockIcon className="w-6 h-6 text-primary-600" />
              <div>
                <h2 className="text-xl font-bold text-gray-900">Version History</h2>
                <p className="text-sm text-gray-600">View and restore previous versions</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Loading versions...</p>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12">
                <ClockIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No versions yet</h3>
                <p className="text-gray-600">Versions will appear here as you work</p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((version, idx) => (
                  <div
                    key={version._id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(version.type)}`}>
                            {getTypeLabel(version.type)}
                          </span>
                          {idx === 0 && (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 flex items-center space-x-1">
                              <CheckCircleIcon className="w-3 h-3" />
                              <span>Current</span>
                            </span>
                          )}
                        </div>

                        {version.label && (
                          <p className="font-medium text-gray-900 mb-1">{version.label}</p>
                        )}

                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span>{formatDate(version.createdAt)}</span>
                          <span>•</span>
                          <span>{formatSize(version.size)}</span>
                          {version.userId && (
                            <>
                              <span>•</span>
                              <span>by {version.userId.name || version.userId.email}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {idx !== 0 && (
                        <button
                          onClick={() => handleRestore(version)}
                          disabled={restoreMutation.isLoading}
                          className="btn-secondary flex items-center space-x-2 text-sm ml-4 disabled:opacity-50"
                        >
                          <ArrowPathIcon className="w-4 h-4" />
                          <span>Restore</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Restore Confirmation */}
      {showRestoreConfirm && selectedVersion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-start space-x-3 mb-4">
              <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Restore this version?
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  This will restore your mindmap to:
                </p>
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <p className="text-sm font-medium text-gray-900">
                    {selectedVersion.label || 'Untitled Version'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {formatDate(selectedVersion.createdAt)}
                  </p>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Your current version will be backed up automatically.
                </p>
                <p className="text-sm font-medium text-yellow-700">
                  ⚠️ The page will reload after restore completes.
                </p>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowRestoreConfirm(false)}
                className="btn-secondary flex-1"
                disabled={restoreMutation.isLoading}
              >
                Cancel
              </button>
              <button
                onClick={confirmRestore}
                disabled={restoreMutation.isLoading}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {restoreMutation.isLoading ? (
                  <span className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Restoring...</span>
                  </span>
                ) : (
                  'Restore'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}