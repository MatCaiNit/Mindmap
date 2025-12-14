// ==========================================
// FILE: Frontend/src/components/mindmap/CollaboratorsList.jsx
// ==========================================
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { collabService } from '../../services/collabService'
import { UserCircleIcon, PlusIcon } from '@heroicons/react/24/outline'
import AddCollaboratorModal from './AddCollaboratorModal'

export default function CollaboratorsList({ mindmapId, isOwner }) {
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: collaborators = [] } = useQuery({
    queryKey: ['collaborators', mindmapId],
    queryFn: () => collabService.listCollaborators(mindmapId),
  })

  return (
    <>
      <div className="absolute top-20 right-4 bg-white rounded-lg shadow-lg border border-gray-200 p-3 max-w-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Collaborators ({collaborators.length})
          </h3>
          {isOwner && (
            <button
              onClick={() => setShowAddModal(true)}
              className="text-primary-600 hover:text-primary-700"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-2">
          {collaborators.map((collab) => (
            <div key={collab.userId._id} className="flex items-center space-x-2">
              <UserCircleIcon className="w-6 h-6 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {collab.userId.name || collab.userId.email}
                </p>
                <p className="text-xs text-gray-500">{collab.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <AddCollaboratorModal
          mindmapId={mindmapId}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  )
}