// Frontend/src/pages/profile/ProfilePage.jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authService } from '../../services/authService'
import { useAuthStore } from '../../stores/authStore'
import { 
  UserCircleIcon, 
  CameraIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline'

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState('profile') // 'profile' or 'password'
  const queryClient = useQueryClient()
  const updateAuth = useAuthStore((state) => state.setAuth)
  const currentUser = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const refreshToken = useAuthStore((state) => state.refreshToken)

  // Profile Tab State
  const [name, setName] = useState(currentUser?.name || '')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatarUrl || null)
  
  // Password Tab State
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })

  const [errors, setErrors] = useState({})
  const [successMessage, setSuccessMessage] = useState('')

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: ({ name, avatarFile }) => authService.updateProfile({ name, avatarFile }),
    onSuccess: (data) => {
      updateAuth(data.user, accessToken, refreshToken)
      setSuccessMessage('Profile updated successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
      setAvatarFile(null)
    },
    onError: (err) => {
      setErrors({ submit: err.response?.data?.message || 'Failed to update profile' })
    }
  })

  const updatePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }) => 
      authService.updatePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setSuccessMessage('Password updated successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
    },
    onError: (err) => {
      setErrors({ submit: err.response?.data?.message || 'Failed to update password' })
    }
  })

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrors({ avatar: 'Please select an image file' })
        return
      }
      
      if (file.size > 5 * 1024 * 1024) {
        setErrors({ avatar: 'Image must be less than 5MB' })
        return
      }

      setAvatarFile(file)
      setErrors({ ...errors, avatar: '' })
      
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleProfileSubmit = (e) => {
    e.preventDefault()
    setErrors({})
    setSuccessMessage('')

    if (!name.trim()) {
      setErrors({ name: 'Name is required' })
      return
    }

    updateProfileMutation.mutate({ name, avatarFile })
  }

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    setErrors({})
    setSuccessMessage('')

    const newErrors = {}

    if (!passwordData.currentPassword) {
      newErrors.currentPassword = 'Current password is required'
    }

    if (!passwordData.newPassword) {
      newErrors.newPassword = 'New password is required'
    } else if (passwordData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters'
    }

    if (!passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    updatePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword
    })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account settings and preferences</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center space-x-2 animate-fade-in">
          <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {errors.submit && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {errors.submit}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
              activeTab === 'profile'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Profile Information
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
              activeTab === 'password'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Change Password
          </button>
        </nav>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="card p-6">
          <form onSubmit={handleProfileSubmit} className="space-y-6">
            {/* Avatar */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Profile Picture
              </label>
              <div className="flex items-center space-x-6">
                <div className="relative">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-24 h-24 rounded-full object-cover border-4 border-gray-100"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
                      <UserCircleIcon className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                  <label 
                    htmlFor="avatar-upload"
                    className="absolute bottom-0 right-0 bg-primary-600 text-white rounded-full p-2 cursor-pointer hover:bg-primary-700 transition shadow-lg"
                  >
                    <CameraIcon className="w-4 h-4" />
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">
                    Click the camera icon to upload a new picture
                  </p>
                  <p className="text-xs text-gray-500">
                    JPG, PNG or GIF • Max 5MB
                  </p>
                  {errors.avatar && (
                    <p className="text-xs text-red-600 mt-1">{errors.avatar}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`input ${errors.name ? 'border-red-500' : ''}`}
                placeholder="Your name"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">{errors.name}</p>
              )}
            </div>

            {/* Email (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={currentUser?.email || ''}
                disabled
                className="input bg-gray-50 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500">
                Email cannot be changed
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updateProfileMutation.isLoading}
                className="btn-primary disabled:opacity-50"
              >
                {updateProfileMutation.isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Password Tab */}
      {activeTab === 'password' && (
        <div className="card p-6">
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ 
                    ...passwordData, 
                    currentPassword: e.target.value 
                  })}
                  className={`input pr-10 ${errors.currentPassword ? 'border-red-500' : ''}`}
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords({ 
                    ...showPasswords, 
                    current: !showPasswords.current 
                  })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPasswords.current ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.currentPassword}</p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ 
                    ...passwordData, 
                    newPassword: e.target.value 
                  })}
                  className={`input pr-10 ${errors.newPassword ? 'border-red-500' : ''}`}
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords({ 
                    ...showPasswords, 
                    new: !showPasswords.new 
                  })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPasswords.new ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.newPassword}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                At least 6 characters
              </p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ 
                    ...passwordData, 
                    confirmPassword: e.target.value 
                  })}
                  className={`input pr-10 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords({ 
                    ...showPasswords, 
                    confirm: !showPasswords.confirm 
                  })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPasswords.confirm ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updatePasswordMutation.isLoading}
                className="btn-primary disabled:opacity-50"
              >
                {updatePasswordMutation.isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}