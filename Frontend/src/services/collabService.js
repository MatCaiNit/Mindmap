// Frontend/src/services/collabService.js - UPDATED
import { api } from '../lib/api'

export const collabService = {
  async addCollaborator(mindmapId, email, role = 'editor') {
    const response = await api.post(`/collab/${mindmapId}/add`, { email, role })
    return response.data
  },

  async listCollaborators(mindmapId) {
    const response = await api.get(`/collab/${mindmapId}/list`)
    return {
      owner: response.data.owner,
      collaborators: response.data.collaborators
    }
  },

  async removeCollaborator(mindmapId, userId) {
    const response = await api.delete(`/collab/${mindmapId}/remove/${userId}`)
    return response.data
  },

  async updateCollaboratorRole(mindmapId, userId, role) {
    const response = await api.patch(`/collab/${mindmapId}/role/${userId}`, { role })
    return response.data
  },
}