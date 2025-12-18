// Frontend/src/components/mindmap/CollaboratorsTab.jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collabService } from '../../services/collabService'
import { 
  UserCircleIcon, 
  PlusIcon, 
  XMarkIcon,
  ShieldCheckIcon,
  PencilSquareIcon,
  EyeIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import AddCollaboratorModal from './AddCollaboratorModal'

export default function CollaboratorsTab({ mindmapId, isOwner, currentUserId }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['collaborators', mindmapId],
    queryFn: () => collabService.listCollaborators(mindmapId),
  })

  const removeMutation = useMutation({
    mutationFn: (userId) => collabService.removeCollaborator(mindmapId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries(['collaborators', mindmapId])
      setConfirmDelete(null)
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }) => 
      collabService.updateCollaboratorRole(mindmapId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries(['collaborators', mindmapId])
    },
  })

  const getRoleIcon = (role) => {
    switch (role) {
      case 'owner':
        return <ShieldCheckIcon className="w-5 h-5 text-yellow-500" />
      case 'editor':
        return <PencilSquareIcon className="w-5 h-5 text-blue-500" />
      case 'viewer':
        return <EyeIcon className="w-5 h-5 text-gray-500" />
      default:
        return null
    }
  }

  const getRoleBadge = (role) => {
    const styles = {
      owner: 'bg-yellow-100 text-yellow-800',
      editor: 'bg-blue-100 text-blue-800',
      viewer: 'bg-gray-100 text-gray-600'
    }
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[role]}`}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    )
  }

  const owner = data?.owner
  const collaborators = data?.collaborators || []
  const allMembers = owner ? [owner, ...collaborators] : collaborators

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Team Members
          </h3>
          {isOwner && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary text-sm flex items-center space-x-2"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Add</span>
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600">
          {allMembers.length} {allMembers.length === 1 ? 'member' : 'members'}
        </p>
      </div>

      {/* Members List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {allMembers.map((member) => {
          const user = member.userId
          const role = member.role
          const isCurrentUser = user._id === currentUserId || user.id === currentUserId
          const canModify = isOwner && role !== 'owner' && !isCurrentUser

          return (
            <div
              key={user._id || user.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {/* Avatar */}
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium">
                      {(user.name || user.email)[0].toUpperCase()}
                    </span>
                  </div>
                )}

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.name || user.email}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-gray-500">(You)</span>
                      )}
                    </p>
                  </div>
                  <p className="text-xs text-gray-600 truncate">{user.email}</p>
                </div>

                {/* Role Badge */}
                <div className="flex items-center space-x-2">
                  {getRoleIcon(role)}
                  {canModify ? (
                    <select
                      value={role}
                      onChange={(e) => updateRoleMutation.mutate({
                        userId: user._id || user.id,
                        role: e.target.value
                      })}
                      disabled={updateRoleMutation.isLoading}
                      className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    getRoleBadge(role)
                  )}
                </div>
              </div>

              {/* Actions */}
              {canModify && (
                <button
                  onClick={() => setConfirmDelete(member)}
                  className="ml-3 text-gray-400 hover:text-red-600 transition"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Role Legend */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <p className="text-xs font-medium text-gray-700 mb-2">Permissions:</p>
        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex items-center space-x-2">
            <ShieldCheckIcon className="w-4 h-4 text-yellow-500" />
            <span><strong>Owner:</strong> Full access + manage team</span>
          </div>
          <div className="flex items-center space-x-2">
            <PencilSquareIcon className="w-4 h-4 text-blue-500" />
            <span><strong>Editor:</strong> Can edit & save versions</span>
          </div>
          <div className="flex items-center space-x-2">
            <EyeIcon className="w-4 h-4 text-gray-500" />
            <span><strong>Viewer:</strong> Read-only access</span>
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <AddCollaboratorModal
          mindmapId={mindmapId}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Remove Collaborator?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to remove{' '}
              <strong>{confirmDelete.userId.name || confirmDelete.userId.email}</strong>?
              They will lose access to this mindmap immediately.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary flex-1"
                disabled={removeMutation.isLoading}
              >
                Cancel
              </button>
              <button
                onClick={() => removeMutation.mutate(confirmDelete.userId._id)}
                disabled={removeMutation.isLoading}
                className="btn bg-red-600 text-white hover:bg-red-700 flex-1 disabled:opacity-50"
              >
                {removeMutation.isLoading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}