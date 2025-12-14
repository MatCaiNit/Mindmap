// ==========================================
// FILE: Frontend/src/services/collabService.js
// ==========================================
import { api } from '../lib/api'

export const collabService = {
  async addCollaborator(mindmapId, email, role = 'editor') {
    const response = await api.post(`/collab/${mindmapId}/add`, { email, role })
    return response.data
  },

  async listCollaborators(mindmapId) {
    const response = await api.get(`/collab/${mindmapId}/list`)
    return response.data.collaborators
  },
}