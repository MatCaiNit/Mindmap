// Frontend/src/components/mindmap/AIAssistantModal.jsx

import { useState, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { aiService } from '../../services/aiService'
import { calculateBalancedLayout } from '../../lib/treeLayout'
import {
  XMarkIcon,
  SparklesIcon,
  DocumentPlusIcon,
  DocumentArrowUpIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'

// ── applyPromptMindmapToYjs ──────────────────────────────────────────────────
// Ghi mindmap JSON từ AI (prompt-based) vào Yjs, đánh dấu aiSource cho mỗi node
export function applyPromptMindmapToYjs(mindmapJson, yNodes, yEdges, groundingSources = []) {
  const root = mindmapJson.root ?? mindmapJson
  if (!root) throw new Error('Invalid mindmap JSON from AI')

  // Xoá nodes & edges cũ
  const existingIds = []
  yNodes.forEach((_, id) => existingIds.push(id))
  existingIds.forEach(id => yNodes.delete(id))
  if (yEdges.length > 0) yEdges.delete(0, yEdges.length)

  const ROOT_X = 600, ROOT_Y = 400
  const LEVEL_GAP = 260
  const COLOR_POOL = [
    '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#14b8a6', '#f97316',
  ]
  let counter = 0

  function processNode(node, parentId, level, side, x, y, colorIdx) {
    const nodeId = level === 0 ? 'root-node' : `ai-node-${++counter}`
    const color  = level === 0 ? '#8b5cf6' : COLOR_POOL[colorIdx % COLOR_POOL.length]

    const nodeSources = node.sources || []
    const aiSource = {
      aiGenerated: true,
      sources: nodeSources.length
        ? nodeSources
        : level === 1
          ? groundingSources.slice(0, 2)
          : [],
    }

    yNodes.set(nodeId, {
      label:     node.text || 'Node',
      position:  { x, y },
      parentId:  parentId ?? null,
      level,
      side:      level === 0 ? null : side,
      autoAlign: true,
      isRoot:    level === 0,
      color,
      aiSource,
      ...(level === 0 ? {} : {
        fontSize:     level === 1 ? '15px' : '13px',
        fontWeight:   level === 1 ? '600' : '500',
        borderRadius: level === 1 ? '10px' : '8px',
        boxShadow:    '0 2px 8px rgba(0,0,0,0.1)',
        padding:      level === 1 ? '10px 18px' : '8px 14px',
        textColor:    '#ffffff',
      }),
    })

    if (parentId) {
      const sh = side === 'right' ? 'source-right' : 'source-left'
      const th = side === 'right' ? 'target-left'  : 'target-right'
      yEdges.push([{
        id: `e-${parentId}-${nodeId}`,
        source: parentId, target: nodeId,
        sourceHandle: sh, targetHandle: th,
        color: '#8b5cf6', width: 2, style: 'solid', isParentChild: true,
      }])
    }

    const children = node.children ?? []
    if (!children.length) return

    const rowH = level === 0 ? 100 : 80
    children.forEach((child, i) => {
      const childSide = level === 0 ? (i % 2 === 0 ? 'right' : 'left') : side
      const childX    = ROOT_X + (childSide === 'right' ? LEVEL_GAP : -LEVEL_GAP) * (level + 1)
      const childY    = level === 0
        ? ROOT_Y + (i - (children.length - 1) / 2) * rowH
        : y    + (i - (children.length - 1) / 2) * rowH
      processNode(child, nodeId, level + 1, childSide, childX, childY, i)
    })
  }

  processNode(root, null, 0, 'right', ROOT_X, ROOT_Y, 0)

  // Re-layout sau khi ghi xong
  setTimeout(() => {
    try {
      const positions = calculateBalancedLayout(yNodes)
      positions.forEach((pos, nodeId) => {
        const n = yNodes.get(nodeId)
        if (n && n.autoAlign !== false && !n.isFree) {
          yNodes.set(nodeId, { ...n, position: pos })
        }
      })
    } catch (_) { /* layout failure không critical */ }
  }, 100)
}

// ── applyPdfMindmapToYjs ─────────────────────────────────────────────────────
// Ghi mindmap JSON từ PDF-RAG vào Yjs, đánh dấu pdfSource cho mỗi node
function applyPdfMindmapToYjs(mindmapJson, chunks, yNodes, yEdges) {
  const root = mindmapJson.root ?? mindmapJson
  if (!root) throw new Error('Invalid mindmap JSON from AI')

  const existingIds = []
  yNodes.forEach((_, id) => existingIds.push(id))
  existingIds.forEach(id => yNodes.delete(id))
  if (yEdges.length > 0) yEdges.delete(0, yEdges.length)

  const ROOT_X = 600, ROOT_Y = 400
  const LEVEL_GAP = 260
  const COLOR_POOL = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  ]
  let counter = 0

  const buildSource = (idx) => {
    if (idx == null) return null
    const chunk = chunks?.[idx]
    if (!chunk) return null
    return { text: chunk.text, page: chunk.pageNum ?? null, chunkIndex: idx }
  }

  function processNode(node, parentId, level, side, x, y, colorIdx) {
    const nodeId = level === 0 ? 'root-node' : `pdf-node-${++counter}`
    const color  = level === 0 ? '#3b82f6' : COLOR_POOL[colorIdx % COLOR_POOL.length]

    yNodes.set(nodeId, {
      label:     node.text || 'Node',
      position:  { x, y },
      parentId:  parentId ?? null,
      level,
      side:      level === 0 ? null : side,
      autoAlign: true,
      isRoot:    level === 0,
      color,
      pdfSource: buildSource(node.sourceChunk),
      ...(level === 0 ? {} : {
        fontSize:     level === 1 ? '15px' : '13px',
        fontWeight:   level === 1 ? '600' : '500',
        borderRadius: level === 1 ? '10px' : '8px',
        boxShadow:    '0 2px 8px rgba(0,0,0,0.1)',
        padding:      level === 1 ? '10px 18px' : '8px 14px',
        textColor:    '#ffffff',
      }),
    })

    if (parentId) {
      const sh = side === 'right' ? 'source-right' : 'source-left'
      const th = side === 'right' ? 'target-left'  : 'target-right'
      yEdges.push([{
        id: `e-${parentId}-${nodeId}`,
        source: parentId, target: nodeId,
        sourceHandle: sh, targetHandle: th,
        color: '#3b82f6', width: 2, style: 'solid', isParentChild: true,
      }])
    }

    const children = node.children ?? []
    if (!children.length) return

    const rowH = level === 0 ? 100 : 80
    children.forEach((child, i) => {
      const childSide = level === 0 ? (i % 2 === 0 ? 'right' : 'left') : side
      const childX    = ROOT_X + (childSide === 'right' ? LEVEL_GAP : -LEVEL_GAP) * (level + 1)
      const childY    = level === 0
        ? ROOT_Y + (i - (children.length - 1) / 2) * rowH
        : y    + (i - (children.length - 1) / 2) * rowH
      processNode(child, nodeId, level + 1, childSide, childX, childY, i)
    })
  }

  processNode(root, null, 0, 'right', ROOT_X, ROOT_Y, 0)

  setTimeout(() => {
    try {
      const positions = calculateBalancedLayout(yNodes)
      positions.forEach((pos, nodeId) => {
        const n = yNodes.get(nodeId)
        if (n && n.autoAlign !== false && !n.isFree) {
          yNodes.set(nodeId, { ...n, position: pos })
        }
      })
    } catch (_) { /* ignore */ }
  }, 100)
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AIAssistantModal({ mindmap, yNodes, yEdges, onClose }) {
  const [activeTab,       setActiveTab]       = useState('prompt') // 'prompt' | 'pdf'
  const [prompt,          setPrompt]          = useState('')
  const [pdfFile,         setPdfFile]         = useState(null)
  const [uploadProgress,  setUploadProgress]  = useState(0)
  const [phase,           setPhase]           = useState('')       // 'generating' | 'applying' | 'done' | 'error'
  const [error,           setError]           = useState('')
  const fileInputRef = useRef(null)

  // ── Generate từ prompt ──────────────────────────────────────────────────
  const promptMutation = useMutation({
    mutationFn: () => aiService.generateFromPrompt(mindmap._id, prompt.trim()),
    onMutate:   () => { setPhase('generating'); setError('') },
    onSuccess:  (data) => {
      if (!data?.mindmap) { setError('Invalid response from AI'); setPhase('error'); return }
      setPhase('applying')
      setTimeout(() => {
        try {
          applyPromptMindmapToYjs(data.mindmap, yNodes, yEdges, data.groundingSources || [])
          setPhase('done')
        } catch (err) {
          setError(err.message)
          setPhase('error')
        }
      }, 200)
    },
    onError: (err) => {
      setError(err.response?.data?.message || err.message || 'AI generation failed')
      setPhase('error')
    },
  })

  // ── Generate từ PDF ─────────────────────────────────────────────────────
  const pdfMutation = useMutation({
    mutationFn: () => aiService.generateFromPdf(mindmap._id, pdfFile, setUploadProgress),
    onMutate:   () => { setPhase('generating'); setError(''); setUploadProgress(0) },
    onSuccess:  (data) => {
      if (!data?.mindmap) { setError('Invalid response from AI'); setPhase('error'); return }
      setPhase('applying')
      setTimeout(() => {
        try {
          applyPdfMindmapToYjs(data.mindmap, data.chunks || [], yNodes, yEdges)
          setPhase('done')
        } catch (err) {
          setError(err.message)
          setPhase('error')
        }
      }, 200)
    },
    onError: (err) => {
      setError(err.response?.data?.message || err.message || 'PDF processing failed')
      setPhase('error')
    },
  })

  const isLoading = promptMutation.isLoading || pdfMutation.isLoading
  const isDone    = phase === 'done'

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleGenerateFromPrompt = (e) => {
    e.preventDefault()
    setError('')
    if (!prompt.trim()) { setError('Please enter a topic'); return }
    promptMutation.mutate()
  }

  const handleGenerateFromPdf = (e) => {
    e.preventDefault()
    setError('')
    if (!pdfFile) { setError('Please select a PDF file'); return }
    pdfMutation.mutate()
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.type !== 'application/pdf') { setError('Only PDF files are supported'); return }
    if (file.size > 20 * 1024 * 1024)   { setError('File must be smaller than 20MB'); return }
    setError('')
    setPdfFile(file)
  }

  const handleTabChange = (tab) => {
    if (isLoading) return
    setActiveTab(tab)
    setError('')
    setPhase('')
  }

  // ── Phase label helper ──────────────────────────────────────────────────
  const phaseLabel = {
    generating: activeTab === 'pdf' ? '📄 Extracting & embedding PDF…' : '🤖 AI is thinking…',
    applying:   '✏️  Building mindmap…',
    done:       '✅ Done!',
    error:      '',
  }[phase] || ''

  // ── Render ───────────────────────────────────────────────────────────────
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
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40 transition"
          >
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
                onClick={() => handleTabChange(tab.id)}
                disabled={isLoading}
                className={`py-3 px-1 border-b-2 text-sm font-medium flex items-center space-x-2 transition disabled:opacity-40 ${
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Error */}
          {error && (
            <div className="flex items-start space-x-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Progress / phase banner */}
          {(isLoading || phase === 'applying') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-blue-900 font-medium text-sm">{phaseLabel}</p>
                  {activeTab === 'pdf' && uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="mt-2">
                      <div className="w-full bg-blue-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
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

          {/* Done state */}
          {isDone && (
            <div className="flex items-center space-x-3 bg-green-50 border border-green-200 rounded-lg p-4">
              <CheckCircleIcon className="w-8 h-8 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-900">Mindmap generated!</p>
                <p className="text-sm text-green-700 mt-0.5">
                  Nodes marked with{' '}
                  {activeTab === 'pdf' ? '📄' : '✨'} contain source references — click them to explore.
                </p>
              </div>
            </div>
          )}

          {/* ── Tab: Prompt ── */}
          {activeTab === 'prompt' && !isDone && (
            <form onSubmit={handleGenerateFromPrompt} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What's your mindmap about?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:bg-gray-50 text-sm"
                  rows={4}
                  placeholder="E.g., 'Project planning for a mobile app', 'Machine learning concepts', ..."
                  autoFocus
                />
              </div>

              <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-xs text-purple-700">
                ✨ Nodes sẽ được đánh dấu <strong>✨</strong> — click để xem nguồn tham khảo từ AI.
              </div>

              <button
                type="submit"
                disabled={isLoading || !prompt.trim()}
                className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center space-x-2"
              >
                {promptMutation.isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Generating…</span>
                  </>
                ) : (
                  <>
                    <DocumentPlusIcon className="w-5 h-5" />
                    <span>Generate Mindmap</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── Tab: PDF ── */}
          {activeTab === 'pdf' && !isDone && (
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
                    <DocumentArrowUpIcon className="w-10 h-10 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-green-700 truncate max-w-xs mx-auto">{pdfFile.name}</p>
                    <p className="text-sm text-green-600 mt-1">{(pdfFile.size / (1024 * 1024)).toFixed(1)} MB</p>
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
                    <CloudArrowUpIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="font-medium text-gray-700">Click to upload PDF</p>
                    <p className="text-sm text-gray-500 mt-1">Max 20 MB</p>
                  </>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800 space-y-1">
                <p className="font-medium">💡 How it works:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>PDF text is extracted and chunked by page</li>
                  <li>Each chunk is embedded as a vector (RAG)</li>
                  <li>Top-5 relevant chunks are sent to AI</li>
                  <li>AI generates a structured mindmap</li>
                </ol>
                <p className="mt-1">Nodes marked <strong>📄</strong> show the exact PDF passage used.</p>
              </div>

              <button
                type="submit"
                disabled={isLoading || !pdfFile}
                className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center space-x-2"
              >
                {pdfMutation.isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <>
                    <DocumentArrowUpIcon className="w-5 h-5" />
                    <span>Generate from PDF</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Done — close button */}
          {isDone && (
            <button onClick={onClose} className="w-full py-2.5 rounded-lg font-medium text-white bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90 transition">
              Close & View Mindmap
            </button>
          )}
        </div>
      </div>
    </div>
  )
}