import { api } from '../lib/api'

export const versionService = {
  /**
   * List all versions for a mindmap
   */
  async listVersions(mindmapId) {
    console.log('📋 Fetching versions for mindmap:', mindmapId)
    const response = await api.get(`/mindmaps/${mindmapId}/versions`)
    console.log('✅ Versions fetched:', response.data.versions?.length || 0)
    return response.data.versions
  },

  /**
   * Get specific version with full snapshot
   */
  async getVersion(mindmapId, versionId) {
    console.log('📄 Fetching version:', versionId)
    const response = await api.get(`/mindmaps/${mindmapId}/versions/${versionId}`)
    console.log('✅ Version fetched:', response.data.version)
    return response.data.version
  },

  /**
   * Restore a version
   */
  async restoreVersion(mindmapId, versionId) {
    console.log('🔄 Restoring version:', versionId)
    const response = await api.post(`/mindmaps/${mindmapId}/versions/${versionId}/restore`)
    console.log('✅ Version restored:', response.data)
    return response.data
  },

  /**
   * Save manual version (snapshot current state)
   */
  async saveManualVersion(mindmapId, label = '') {
    console.log('💾 Saving manual version...')
    console.log('   Mindmap ID:', mindmapId)
    console.log('   Label:', label)
    console.log('   Endpoint:', `/mindmaps/${mindmapId}/versions/save`)
    
    try {
      const response = await api.post(`/mindmaps/${mindmapId}/versions/save`, { label })
      console.log('✅ Version saved:', response.data.version)
      return response.data.version
    } catch (error) {
      console.error('❌ Save version failed:', error)
      console.error('   Status:', error.response?.status)
      console.error('   Data:', error.response?.data)
      throw error
    }
  },
}