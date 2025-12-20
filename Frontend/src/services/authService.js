// Frontend/src/services/authService.js - UPDATED WITH AVATAR SUPPORT
import { api } from '../lib/api'

export const authService = {
  async register({ email, password, name, avatarFile }) {
    const formData = new FormData()
    formData.append('email', email)
    formData.append('password', password)
    formData.append('name', name)
    
    if (avatarFile) {
      formData.append('avatar', avatarFile)
    }

    const response = await api.post('/auth/register', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  async login(email, password) {
    const response = await api.post('/auth/login', { email, password })
    return response.data
  },

  async refresh(refreshToken) {
    const response = await api.post('/auth/refresh', { refreshToken })
    return response.data
  },

  async updateProfile({ name, avatarFile }) {
    const formData = new FormData()
    if (name) formData.append('name', name)
    if (avatarFile) formData.append('avatar', avatarFile)

    const response = await api.put('/auth/profile', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  async updatePassword({ currentPassword, newPassword }) {
    const response = await api.put('/auth/password', {
      currentPassword,
      newPassword
    })
    return response.data
  },

  async getProfile() {
    const response = await api.get('/auth/profile')
    return response.data
  }
}