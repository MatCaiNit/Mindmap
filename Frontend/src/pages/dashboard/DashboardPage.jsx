// ==========================================
// FILE: Frontend/src/pages/dashboard/DashboardPage.jsx
// ==========================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mindmapService } from '../../services/mindmapService'
import { PlusIcon, FolderIcon } from '@heroicons/react/24/outline'
import CreateMindmapModal from '../../components/mindmap/CreateMindmapModal'
import MindmapCard from '../../components/mindmap/MindmapCard'

export default function DashboardPage() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: mindmaps = [], isLoading } = useQuery({
    queryKey: ['mindmaps'],
    queryFn: mindmapService.list,
  })

  const createMutation = useMutation({
    mutationFn: ({ title, description }) => 
      mindmapService.create(title, description),
    onSuccess: (mindmap) => {
      queryClient.invalidateQueries(['mindmaps'])
      navigate(`/mindmap/${mindmap._id}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: mindmapService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['mindmaps'])
    },
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Mindmaps</h1>
          <p className="text-gray-600 mt-1">
            {mindmaps.length} {mindmaps.length === 1 ? 'mindmap' : 'mindmaps'}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center space-x-2"
        >
          <PlusIcon className="w-5 h-5" />
          <span>New Mindmap</span>
        </button>
      </div>

      {/* Mindmaps Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : mindmaps.length === 0 ? (
        <div className="text-center py-12">
          <FolderIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No mindmaps yet
          </h3>
          <p className="text-gray-600 mb-6">
            Get started by creating your first mindmap
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            Create Mindmap
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mindmaps.map((mindmap) => (
            <MindmapCard
              key={mindmap._id}
              mindmap={mindmap}
              onDelete={() => deleteMutation.mutate(mindmap._id)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateMindmapModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(title, description) => {
            createMutation.mutate({ title, description })
            setShowCreateModal(false)
          }}
        />
      )}
    </div>
  )
}