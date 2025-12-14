// ==========================================
// FILE: Frontend/src/components/mindmap/AddCollaboratorModal.jsx
// ==========================================
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { collabService } from '../../services/collabService'
import { XMarkIcon } from '@heroicons/react/24/outline'

export default function AddCollaboratorModal({ mindmapId, onClose }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [error, setError] = useState('')
  
  const queryClient = useQueryClient()

  const addMutation = useMutation({
    mutationFn: () => collabService.addCollaborator(mindmapId, email, role),
    onSuccess: () => {
      queryClient.invalidateQueries(['collaborators', mindmapId])
      onClose()
    },
    onError: (err) => {
      setError(err.response?.data?.message || 'Failed to add collaborator')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    addMutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Add Collaborator</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="colleague@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input"
            >
              <option value="editor">Editor (can edit)</option>
              <option value="viewer">Viewer (read-only)</option>
            </select>
          </div>

          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={addMutation.isLoading}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {addMutation.isLoading ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}