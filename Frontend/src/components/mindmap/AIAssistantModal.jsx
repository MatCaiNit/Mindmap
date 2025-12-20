// Frontend/src/components/mindmap/AIAssistantModal.jsx - WITH AUTO LAYOUT

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { aiService } from '../../services/aiService'
import { calculateBalancedLayout } from '../../lib/treeLayout'
import { 
  XMarkIcon, 
  SparklesIcon,
  DocumentPlusIcon
} from '@heroicons/react/24/outline'

export default function AIAssistantModal({ mindmap, yNodes, yEdges, onClose }) {
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')

  // Generate mindmap from text
  const generateMutation = useMutation({
    mutationFn: (text) => aiService.generateMindmap(text),
    onSuccess: (data) => {
      console.log('✅ AI Response:', data)
      
      if (data.mindmap) {
        applyGeneratedMindmap(data.mindmap)
        onClose()
      } else {
        setError('Invalid response from AI')
      }
    },
    onError: (err) => {
      console.error('❌ AI Error:', err)
      const message = err.response?.data?.error || err.message || 'AI generation failed'
      setError(message)
    }
  })

  const applyGeneratedMindmap = (aiMindmap) => {
    console.log('🔄 Applying AI mindmap:', aiMindmap)
    
    // Clear existing nodes except root
    const nodeIds = Array.from(yNodes.keys())
    nodeIds.forEach(id => {
      if (id !== 'root-node') {
        yNodes.delete(id)
      }
    })

    // Clear edges
    const edgeCount = yEdges.length
    if (edgeCount > 0) {
      yEdges.delete(0, edgeCount)
    }

    // Update root node
    if (yNodes.has('root-node')) {
      const root = yNodes.get('root-node')
      yNodes.set('root-node', {
        ...root,
        label: aiMindmap.text || mindmap.title
      })
    }

    // Add AI-generated structure recursively
    const addChildren = (parentId, children, side = 'right', level = 1) => {
      if (!children || children.length === 0) return

      children.forEach((child, idx) => {
        const nodeId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const yPos = level * 100 + idx * 80
        
        yNodes.set(nodeId, {
          label: child.text,
          position: { x: 600 + (side === 'left' ? -250 : 250) * level, y: yPos },
          parentId,
          level,
          side,
          color: '#3b82f6',
          autoAlign: true
        })

        const sourceHandle = side === 'left' ? 'source-left' : 'source-right'
        const targetHandle = side === 'left' ? 'target-right' : 'target-left'
        
        yEdges.push([{
          id: `e-${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          sourceHandle,
          targetHandle,
          color: '#3b82f6',
          isParentChild: true
        }])

        if (child.children && child.children.length > 0) {
          addChildren(nodeId, child.children, side, level + 1)
        }
      })
    }

    if (aiMindmap.children) {
      const leftChildren = aiMindmap.children.slice(0, Math.ceil(aiMindmap.children.length / 2))
      const rightChildren = aiMindmap.children.slice(Math.ceil(aiMindmap.children.length / 2))
      
      addChildren('root-node', leftChildren, 'left', 1)
      addChildren('root-node', rightChildren, 'right', 1)
    }

    console.log('✅ AI mindmap applied:', {
      nodes: yNodes.size,
      edges: yEdges.length
    })

    // 🔥 CRITICAL: Apply layout immediately after AI generation
    setTimeout(() => {
      console.log('🎨 Applying AI layout...')
      const positions = calculateBalancedLayout(yNodes)
      
      positions.forEach((pos, nodeId) => {
        const node = yNodes.get(nodeId)
        if (node && node.autoAlign !== false && !node.isFree) {
          yNodes.set(nodeId, { ...node, position: pos })
        }
      })
      
      console.log('✅ AI mindmap layout applied')
    }, 100)
  }

  const handleGenerate = (e) => {
    e.preventDefault()
    setError('')
    
    if (!prompt.trim()) {
      setError('Please enter a topic or description')
      return
    }

    console.log('🤖 Sending to AI:', prompt)
    generateMutation.mutate(prompt)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <SparklesIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI Assistant</h2>
              <p className="text-sm text-gray-600">Generate mindmap from your ideas</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={generateMutation.isLoading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              ❌ {error}
            </div>
          )}

          {/* Loading State */}
          {generateMutation.isLoading && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                <div className="flex-1">
                  <p className="text-blue-900 font-medium mb-1">
                    🤖 AI is thinking...
                  </p>
                  <p className="text-blue-700 text-sm">
                    Generating your mindmap structure. This may take 5-10 seconds.
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What's your mindmap about?
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={generateMutation.isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                rows={4}
                placeholder="E.g., 'Project planning for mobile app development' or 'Study guide for World War II'"
                autoFocus
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p className="font-medium mb-1">💡 Tips for better results:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Be specific about your topic</li>
                <li>Mention key areas you want to cover</li>
                <li>Use clear, descriptive language</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={generateMutation.isLoading || !prompt.trim()}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generateMutation.isLoading ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center space-x-2">
                  <DocumentPlusIcon className="w-5 h-5" />
                  <span>Generate Mindmap</span>
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}