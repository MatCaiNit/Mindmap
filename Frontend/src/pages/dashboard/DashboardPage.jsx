// Frontend/src/pages/dashboard/DashboardPage.jsx - UPDATED WITH TABS
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mindmapService } from '../../services/mindmapService'
import { useAuthStore } from '../../stores/authStore'
import { 
  PlusIcon, 
  FolderIcon, 
  UserGroupIcon,
  ShieldCheckIcon 
} from '@heroicons/react/24/outline'
import CreateMindmapModal from '../../components/mindmap/CreateMindmapModal'
import MindmapCard from '../../components/mindmap/MindmapCard'

export default function DashboardPage() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeTab, setActiveTab] = useState('my') // 'my' or 'shared'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)

  const { data: mindmaps = [], isLoading } = useQuery({
    queryKey: ['mindmaps'],
    queryFn: mindmapService.list,
  })

  // Separate owned and shared mindmaps
  const ownedMindmaps = mindmaps.filter(
    mm => mm.ownerId === currentUser?.id || mm.ownerId?._id === currentUser?.id
  )
  
  const sharedMindmaps = mindmaps.filter(
    mm => mm.ownerId !== currentUser?.id && mm.ownerId?._id !== currentUser?.id
  )

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

  const displayedMindmaps = activeTab === 'my' ? ownedMindmaps : sharedMindmaps

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Mindmaps</h1>
          <p className="text-gray-600 mt-1">
            {ownedMindmaps.length} owned • {sharedMindmaps.length} shared with you
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

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('my')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition flex items-center space-x-2 ${
              activeTab === 'my'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ShieldCheckIcon className="w-5 h-5" />
            <span>My Mindmaps</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'my' 
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {ownedMindmaps.length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab('shared')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition flex items-center space-x-2 ${
              activeTab === 'shared'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <UserGroupIcon className="w-5 h-5" />
            <span>Shared with Me</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'shared' 
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {sharedMindmaps.length}
            </span>
          </button>
        </nav>
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
      ) : displayedMindmaps.length === 0 ? (
        <div className="text-center py-12">
          {activeTab === 'my' ? (
            <>
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
            </>
          ) : (
            <>
              <UserGroupIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No shared mindmaps
              </h3>
              <p className="text-gray-600">
                Mindmaps shared with you will appear here
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedMindmaps.map((mindmap) => {
            const isOwner = mindmap.ownerId === currentUser?.id || 
                           mindmap.ownerId?._id === currentUser?.id
            
            return (
              <div key={mindmap._id} className="relative">
                {!isOwner && (
                  <div className="absolute -top-2 -right-2 z-10">
                    <span className="px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded-full shadow-lg flex items-center space-x-1">
                      <UserGroupIcon className="w-3 h-3" />
                      <span>Shared</span>
                    </span>
                  </div>
                )}
                <MindmapCard
                  mindmap={mindmap}
                  onDelete={() => {
                    if (isOwner) {
                      deleteMutation.mutate(mindmap._id)
                    }
                  }}
                  showDelete={isOwner}
                />
                {!isOwner && mindmap.ownerId && (
                  <div className="mt-2 text-xs text-gray-500 flex items-center space-x-1">
                    <span></span>
                    <span className="font-medium">
                      {mindmap.ownerId.name || mindmap.ownerId.email}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
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