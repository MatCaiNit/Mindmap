// Frontend/src/components/layout/NotificationBell.jsx
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationService } from '../../services/notificationService'
import { BellIcon, CheckIcon, XMarkIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import { BellIcon as BellSolidIcon } from '@heroicons/react/24/solid'

export default function NotificationBell() {
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)
  const queryClient = useQueryClient()

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationService.list,
    refetchInterval: 10000 // Poll every 10s
  })

  const unreadCount = notifications.filter(n => !n.read).length

  const acceptMutation = useMutation({
    mutationFn: notificationService.acceptCollaboration,
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications'])
      queryClient.invalidateQueries(['mindmaps'])
    }
  })

  const rejectMutation = useMutation({
    mutationFn: notificationService.rejectCollaboration,
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications'])
    }
  })

  const markReadMutation = useMutation({
    mutationFn: notificationService.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications'])
    }
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAccept = async (notificationId, mindmapId) => {
    try {
      await acceptMutation.mutateAsync({ notificationId, mindmapId })
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to accept invitation')
    }
  }

  const handleReject = async (notificationId) => {
    try {
      await rejectMutation.mutateAsync(notificationId)
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject invitation')
    }
  }

  const formatDate = (date) => {
    const now = new Date()
    const notifDate = new Date(date)
    const diffMs = now - notifDate
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return notifDate.toLocaleDateString()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition"
      >
        {unreadCount > 0 ? (
          <BellSolidIcon className="w-6 h-6 text-primary-600" />
        ) : (
          <BellIcon className="w-6 h-6 text-gray-600" />
        )}
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  notifications
                    .filter(n => !n.read)
                    .forEach(n => markReadMutation.mutate(n._id))
                }}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <BellIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notif) => (
                  <div
                    key={notif._id}
                    className={`px-4 py-3 hover:bg-gray-50 transition ${
                      !notif.read ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-1">
                        {notif.type === 'collaboration_invite' ? (
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <UserPlusIcon className="w-5 h-5 text-primary-600" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                            <BellIcon className="w-5 h-5 text-gray-600" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{notif.fromUser?.name || notif.fromUser?.email}</span>
                          {' '}invited you to collaborate on{' '}
                          <span className="font-medium">{notif.mindmap?.title}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(notif.createdAt)}
                        </p>

                        {notif.status === 'pending' && (
                          <div className="flex items-center space-x-2 mt-2">
                            <button
                              onClick={() => handleAccept(notif._id, notif.mindmap._id)}
                              disabled={acceptMutation.isLoading}
                              className="flex items-center space-x-1 px-3 py-1.5 bg-primary-600 text-white rounded text-xs hover:bg-primary-700 disabled:opacity-50"
                            >
                              <CheckIcon className="w-3 h-3" />
                              <span>Accept</span>
                            </button>
                            <button
                              onClick={() => handleReject(notif._id)}
                              disabled={rejectMutation.isLoading}
                              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 disabled:opacity-50"
                            >
                              <XMarkIcon className="w-3 h-3" />
                              <span>Decline</span>
                            </button>
                          </div>
                        )}

                        {notif.status === 'accepted' && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-green-100 text-green-800 mt-2">
                            ✓ Accepted
                          </span>
                        )}

                        {notif.status === 'rejected' && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600 mt-2">
                            Declined
                          </span>
                        )}
                      </div>

                      {!notif.read && (
                        <div className="flex-shrink-0">
                          <span className="w-2 h-2 bg-primary-600 rounded-full block"></span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 text-center">
              <button
                onClick={() => setShowDropdown(false)}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}