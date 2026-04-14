// Frontend/src/services/mindmapService.js
import { api } from '../lib/api'

export const mindmapService = {
  async list() {
    const response = await api.get('/mindmaps')
    return response.data.list
  },

  async get(id) {
    const response = await api.get(`/mindmaps/${id}`)
    return {
      ...response.data.mindmap,
      access: response.data.access
    }
  },

  async create(title, description = '', template = null) {
    console.log(' Creating mindmap:', { title, hasTemplate: !!template });
    
    const payload = { 
      title, 
      description
    };
    
    // Only include template if it exists and has structure
    if (template && template.structure) {
      payload.template = {
        id: template.id,
        name: template.name,
        theme: template.theme,
        structure: template.structure,
        color: template.color
      };
      console.log('   Including template:', template.name);
    }
    
    const response = await api.post('/mindmaps', payload);
    console.log(' Mindmap created:', response.data.mindmap._id);
    
    return response.data.mindmap;
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