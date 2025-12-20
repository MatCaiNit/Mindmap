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
  }
}