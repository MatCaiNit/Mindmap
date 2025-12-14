// ==========================================
// FILE: Frontend/src/services/mindmapService.js
// ==========================================
import { api } from '../lib/api'

export const mindmapService = {
  async list() {
    const response = await api.get('/mindmaps')
    return response.data.list
  },

  async get(id) {
    const response = await api.get(`/mindmaps/${id}`)
    return response.data.mindmap
  },

  async create(title, description = '') {
    const response = await api.post('/mindmaps', { title, description })
    return response.data.mindmap
  },

  async update(id, title, description) {
    const response = await api.put(`/mindmaps/${id}`, { title, description })
    return response.data.mindmap
  },

  async delete(id) {
    const response = await api.delete(`/mindmaps/${id}`)
    return response.data
  },

  async saveSnapshot(id, snapshot) {
    const response = await api.post(`/mindmaps/${id}/snapshot`, { snapshot })
    return response.data
  },

  async listVersions(id) {
    const response = await api.get(`/mindmaps/${id}/versions`)
    return response.data.versions
  },

  async getVersion(id, versionId) {
    const response = await api.get(`/mindmaps/${id}/versions/${versionId}`)
    return response.data.version
  },

  async restoreVersion(id, versionId) {
    const response = await api.post(`/mindmaps/${id}/restore`, { versionId })
    return response.data
  },
}