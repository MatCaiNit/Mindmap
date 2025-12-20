// Frontend/src/services/notificationService.js
import { api } from '../lib/api'

export const notificationService = {
  async list() {
    const response = await api.get('/notifications')
    return response.data.notifications
  },

  async markAsRead(notificationId) {
    const response = await api.put(`/notifications/${notificationId}/read`)
    return response.data
  },

  async acceptCollaboration({ notificationId, mindmapId }) {
    const response = await api.post(`/notifications/${notificationId}/accept`, {
      mindmapId
    })
    return response.data
  },

  async rejectCollaboration(notificationId) {
    const response = await api.post(`/notifications/${notificationId}/reject`)
    return response.data
  },

  async markAllAsRead() {
    const response = await api.put('/notifications/read-all')
    return response.data
  }
}