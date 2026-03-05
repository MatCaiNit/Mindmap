// Frontend/src/components/mindmap/AIAssistantModal.jsx
// THAY THẾ HOÀN TOÀN file cũ

import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { aiService } from '../../services/aiService'
import { calculateBalancedLayout } from '../../lib/treeLayout'
import {
  XMarkIcon,
  SparklesIcon,
  DocumentPlusIcon,
  DocumentArrowUpIcon,
  CloudArrowUpIcon,
} from '@heroicons/react/24/outline'

export default function AIAssistantModal({ mindmap, yNodes, yEdges, onClose }) {
  const [activeTab, setActiveTab]   = useState('prompt') // 'prompt' | 'pdf'
  const [prompt,    setPrompt]      = useState('')
  const [pdfFile,   setPdfFile]     = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error,     setError]       = useState('')
  const fileInputRef = useRef(null)

  // ── Generate từ prompt ────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: (text) => aiService.generateMindmap(text),
    onSuccess: (data) => {
      if (data.mindmap) {
        applyGeneratedMindmap(data.mindmap)
        onClose()
      } else {
        setError('Invalid response from AI')
      }
    },
    onError: (err) => {
      setError(err.response?.data?.error || err.message || 'AI generation failed')
    }
  })

  // ── Generate từ PDF ───────────────────────────────────────────────────────
  const pdfMutation = useMutation({
    mutationFn: () =>
      aiService.generateFromPdf(mindmap._id, pdfFile, setUploadProgress),
    onSuccess: (data) => {
      if (data.mindmap) {
        applyGeneratedMindmap(data.mindmap)
        onClose()
      } else {
        setError('Invalid response from AI')
      }
    },
    onError: (err) => {
      setError(err.response?.data?.message || err.message || 'PDF processing failed')
    }
  })

  const isLoading = generateMutation.isLoading || pdfMutation.isLoading

  // ── Apply mindmap vào canvas ──────────────────────────────────────────────
  const applyGeneratedMindmap = (aiMindmap) => {
    // Xóa nodes cũ trừ root
    const nodeIds = Array.from(yNodes.keys())
    nodeIds.forEach(id => { if (id !== 'root-node') yNodes.delete(id) })

    // Xóa edges cũ
    const edgeCount = yEdges.length
    if (edgeCount > 0) yEdges.delete(0, edgeCount)

    // Update root
    if (yNodes.has('root-node')) {
      const root = yNodes.get('root-node')
      yNodes.set('root-node', { ...root, label: aiMindmap.text || mindmap.title })
    }

    // Thêm children
    const addChildren = (parentId, children, side = 'right', level = 1) => {
      if (!children || children.length === 0) return
      children.forEach((child, idx) => {
        const nodeId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        yNodes.set(nodeId, {
          label:     child.text,
          position:  { x: 600 + (side === 'left' ? -250 : 250) * level, y: level * 100 + idx * 80 },
          parentId,
          level,
          side,
          color:     '#3b82f6',
          autoAlign: true
        })
        const sourceHandle = side === 'left' ? 'source-left'  : 'source-right'
        const targetHandle = side === 'left' ? 'target-right' : 'target-left'
        yEdges.push([{
          id: `e-${parentId}-${nodeId}`,
          source: parentId, target: nodeId,
          sourceHandle, targetHandle,
          color: '#3b82f6', isParentChild: true
        }])
        if (child.children?.length > 0)
          addChildren(nodeId, child.children, side, level + 1)
      })
    }

    if (aiMindmap.children) {
      const half  = Math.ceil(aiMindmap.children.length / 2)
      addChildren('root-node', aiMindmap.children.slice(0, half),  'left',  1)
      addChildren('root-node', aiMindmap.children.slice(half),     'right', 1)
    }

    // Layout
    setTimeout(() => {
      const positions = calculateBalancedLayout(yNodes)
      positions.forEach((pos, nodeId) => {
        const node = yNodes.get(nodeId)
        if (node && node.autoAlign !== false && !node.isFree)
          yNodes.set(nodeId, { ...node, position: pos })
      })
    }, 100)
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleGenerateFromPrompt = (e) => {
    e.preventDefault()
    setError('')
    if (!prompt.trim()) { setError('Please enter a topic'); return }
    generateMutation.mutate(prompt)
  }

  const handleGenerateFromPdf = (e) => {
    e.preventDefault()
    setError('')
    if (!pdfFile) { setError('Please select a PDF file'); return }
    setUploadProgress(0)
    pdfMutation.mutate()
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are supported')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File must be smaller than 20MB')
      return
    }
    setError('')
    setPdfFile(file)
  }

  // ── Render ────────────────────────────────────────────────────────────────
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
              <p className="text-sm text-gray-600">Generate mindmap from prompt or PDF</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isLoading} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex space-x-6">
            {[
              { id: 'prompt', label: 'From Prompt', icon: SparklesIcon },
              { id: 'pdf',    label: 'From PDF',    icon: DocumentArrowUpIcon },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setError('') }}
                disabled={isLoading}
                className={`py-3 px-1 border-b-2 text-sm font-medium flex items-center space-x-2 transition ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              ❌ {error}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-blue-900 font-medium mb-1">
                    {pdfMutation.isLoading ? '📄 Processing PDF...' : '🤖 AI is thinking...'}
                  </p>
                  <p className="text-blue-700 text-sm">
                    {pdfMutation.isLoading
                      ? 'Extracting text, creating embeddings and generating mindmap...'
                      : 'This may take 5-10 seconds.'}
                  </p>
                  {pdfMutation.isLoading && uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="mt-2">
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-blue-600 mt-1">Uploading: {uploadProgress}%</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Prompt */}
          {activeTab === 'prompt' && (
            <form onSubmit={handleGenerateFromPrompt} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What's your mindmap about?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:bg-gray-50"
                  rows={4}
                  placeholder="E.g., 'Project planning for mobile app development'"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !prompt.trim()}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generateMutation.isLoading ? (
                  <span className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
          )}

          {/* Tab: PDF */}
          {activeTab === 'pdf' && (
            <form onSubmit={handleGenerateFromPdf} className="space-y-4">
              {/* Drop zone */}
              <div
                onClick={() => !isLoading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer ${
                  pdfFile
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isLoading}
                />
                {pdfFile ? (
                  <>
                    <DocumentArrowUpIcon className="w-12 h-12 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-green-700">{pdfFile.name}</p>
                    <p className="text-sm text-green-600 mt-1">
                      {(pdfFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPdfFile(null) }}
                      className="mt-2 text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <CloudArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="font-medium text-gray-700">Click to upload PDF</p>
                    <p className="text-sm text-gray-500 mt-1">Max 20MB</p>
                  </>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                <p className="font-medium mb-1">💡 How it works:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>PDF text is extracted and chunked by page</li>
                  <li>Each chunk is embedded as a vector</li>
                  <li>Top relevant chunks are sent to AI</li>
                  <li>AI generates a structured mindmap</li>
                </ol>
              </div>

              <button
                type="submit"
                disabled={isLoading || !pdfFile}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pdfMutation.isLoading ? (
                  <span className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-2">
                    <DocumentArrowUpIcon className="w-5 h-5" />
                    <span>Generate from PDF</span>
                  </span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}