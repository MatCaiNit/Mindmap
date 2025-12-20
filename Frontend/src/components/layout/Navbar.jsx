// Frontend/src/components/layout/Navbar.jsx - UPDATED WITH NOTIFICATIONS & PROFILE
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Menu } from '@headlessui/react'
import { 
  UserCircleIcon, 
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline'
import NotificationBell from './NotificationBell'

export default function Navbar() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
              <span className="text-xl font-bold text-gray-900">MindMapper</span>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            {/* Notification Bell */}
            <NotificationBell />

            {/* User Menu */}
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center space-x-2 hover:bg-gray-100 rounded-lg px-3 py-2 transition">
                {user?.avatarUrl ? (
                  <img 
                    src={user.avatarUrl} 
                    alt={user.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <UserCircleIcon className="w-8 h-8 text-gray-600" />
                )}
                <span className="text-sm font-medium text-gray-700">
                  {user?.name || user?.email}
                </span>
              </Menu.Button>

              <Menu.Items className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>

                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={() => navigate('/profile')}
                      className={`${
                        active ? 'bg-gray-100' : ''
                      } flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700`}
                    >
                      <Cog6ToothIcon className="w-4 h-4" />
                      <span>Profile Settings</span>
                    </button>
                  )}
                </Menu.Item>

                <div className="border-t border-gray-200 my-1"></div>

                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={handleLogout}
                      className={`${
                        active ? 'bg-gray-100' : ''
                      } flex items-center space-x-2 w-full px-4 py-2 text-sm text-red-600`}
                    >
                      <ArrowRightOnRectangleIcon className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Menu>
          </div>
        </div>
      </div>
    </nav>
  )
}