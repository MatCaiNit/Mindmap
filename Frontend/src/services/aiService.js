// Frontend/src/services/aiService.js - FIXED
import { api } from '../lib/api'

const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:4000'

export const aiService = {
  async generateMindmap(text) {
    console.log('📤 Sending to AI:', text)
    
    const response = await api.post(`${AI_URL}/ai/generate-mindmap`, { text })
    
    console.log('📥 AI Response:', response.data)
    
    if (!response.data.ok) {
      throw new Error(response.data.error || 'AI generation failed')
    }
    
    return response.data
  },

  async suggestNodes(nodeId, context) {
    console.log('📤 Requesting AI suggestions for:', context.currentNode)
    
    const response = await api.post(`${AI_URL}/ai/suggest`, { 
      context: {
        nodeId,
        ...context
      }
    })
    
    console.log('📥 AI Suggestions:', response.data)
    
    if (!response.data.ok) {
      throw new Error(response.data.error || 'AI suggestion failed')
    }
    
    return response.data
  },


  /**
   * Upload PDF và generate mindmap
   * @param {string} mindmapId
   * @param {File}   file        — File object từ input[type=file]
   * @param {Function} onProgress — callback(percent) optional
   */
  async generateFromPdf(mindmapId, file, onProgress){
    const form = new FormData()
    form.append('pdf', file)

    const response = await api.post(
      `/mindmaps/${mindmapId}/generate-from-pdf`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2 phút
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded * 100) / e.total))
          }
        },
      }
    )
    return response.data
  },

  /**
   * Lấy source chunk cho một node (để highlight PDF)
   * @param {string} mindmapId
   * @param {string} nodeText   — label của node
   */
  async getNodeSourc(mindmapId, nodeText){
    const response = await api.get(
      `/mindmaps/${mindmapId}/node-source`,
      { params: { nodeText } }
    )
    return response.data
  },
}