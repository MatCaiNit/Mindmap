// Frontend/src/components/mindmap/AIAssistantModal.jsx
// Progressive generation: nodes appear one-by-one as AI creates them
// Source routing: PDF nodes → PDF panel, prompt nodes → web link popup

import { useState, useRef, useCallback, useEffect } from 'react'
import { calculateBalancedLayout } from '../../lib/treeLayout'
import { useAuthStore } from '../../stores/authStore'
import {
  XMarkIcon,
  SparklesIcon,
  DocumentArrowUpIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const AI_URL  = import.meta.env.VITE_AI_URL  || 'http://localhost:4000'

// ─────────────────────────────────────────────────────────────────────────────
// Apply a single node + edge event into Yjs (called per SSE event)
// ─────────────────────────────────────────────────────────────────────────────
export function applyNodeEvent(nodePayload, yNodes) {
  const { id, ...rest } = nodePayload
  yNodes.set(id, {
    label:     rest.label || 'Node',
    position:  rest.position || { x: 0, y: 0 },
    parentId:  rest.parentId ?? null,
    level:     rest.level ?? 0,
    side:      rest.side ?? null,
    autoAlign: true,
    isRoot:    rest.isRoot || false,
    color:     rest.color || '#3b82f6',
    // Source badges
    ...(rest.pdfSource ? { pdfSource: rest.pdfSource } : {}),
    ...(rest.aiSource  ? { aiSource:  rest.aiSource  } : {}),
    // Style props
    ...(rest.level > 0 ? {
      fontSize:     rest.level === 1 ? '15px' : rest.level === 2 ? '13px' : '12px',
      fontWeight:   rest.level === 1 ? '600'  : '500',
      borderRadius: '8px',
      boxShadow:    '0 2px 8px rgba(0,0,0,0.1)',
      padding:      '8px 14px',
      textColor:    '#ffffff',
    } : {}),
  })
}

export function applyEdgeEvent(edgePayload, yEdges) {
  yEdges.push([edgePayload])
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-layout after all nodes are in
// ─────────────────────────────────────────────────────────────────────────────
function triggerLayout(yNodes) {
  setTimeout(() => {
    try {
      const positions = calculateBalancedLayout(yNodes)
      positions.forEach((pos, nodeId) => {
        const n = yNodes.get(nodeId)
        if (n && n.autoAlign !== false) yNodes.set(nodeId, { ...n, position: pos })
      })
    } catch (_) {}
  }, 300)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────────────────────────────────────
export default function AIAssistantModal({ mindmap, yNodes, yEdges, onClose }) {
  const [prompt,       setPrompt]       = useState('')
  const [pdfFile,      setPdfFile]      = useState(null)
  const [dragOver,     setDragOver]     = useState(false)
  const [status,       setStatus]       = useState('')      // current status message
  const [nodeCount,    setNodeCount]    = useState(0)       // nodes received so far
  const [phase,        setPhase]        = useState('idle')  // idle|streaming|done|error
  const [error,        setError]        = useState('')
  const fileInputRef = useRef(null)
  const abortRef     = useRef(null)
  const token        = useAuthStore(s => s.accessToken)

  const hasPrompt = prompt.trim().length > 0
  const hasPdf    = !!pdfFile
  const mode      = hasPdf && hasPrompt ? 'combined' : hasPdf ? 'pdf' : 'prompt'
  const isLoading = phase === 'streaming'
  const isDone    = phase === 'done'

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), [])

  // ── File handler ───────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') { setError('Chỉ hỗ trợ file PDF'); return }
    if (file.size > 20 * 1024 * 1024)   { setError('File phải nhỏ hơn 20 MB'); return }
    setError('')
    setPdfFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0])
  }

  // ── CLEAR canvas before streaming ─────────────────────────────────────
  const clearCanvas = useCallback(() => {
    const ids = []
    yNodes.forEach((_, id) => ids.push(id))
    ids.forEach(id => yNodes.delete(id))
    if (yEdges.length > 0) yEdges.delete(0, yEdges.length)
  }, [yNodes, yEdges])

  // ── Start SSE streaming ────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!hasPrompt && !hasPdf) return
    setError('')
    setStatus('Khởi động...')
    setNodeCount(0)
    setPhase('streaming')

    // Cancel any previous request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    clearCanvas()

    try {
      const formData = new FormData()
      formData.append('mindmapId', mindmap._id)
      formData.append('mode', mode)
      if (hasPrompt) formData.append('prompt', prompt.trim())
      if (hasPdf) {
        formData.append('pdf', pdfFile)
        formData.append('filename', pdfFile.name)
      }

      // Call Backend → which proxies to GenAI
      // Or call GenAI directly if VITE_AI_URL is set
      const endpoint = `${API_URL}/api/mindmaps/${mindmap._id}/generate-stream`

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message || `HTTP ${res.status}`)
      }

      const reader   = res.body.getReader()
      const dec      = new TextDecoder()
      let   buffer   = ''
      let   count    = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += dec.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? '' // keep incomplete tail

        for (const chunk of lines) {
          const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue

          let evt
          try { evt = JSON.parse(dataLine.slice(6)) } catch (_) { continue }

          if (evt.type === 'status') {
            setStatus(evt.message)
          } else if (evt.type === 'node') {
            applyNodeEvent(evt.node, yNodes)
            count++
            setNodeCount(count)
          } else if (evt.type === 'edge') {
            applyEdgeEvent(evt.edge, yEdges)
          } else if (evt.type === 'done') {
            triggerLayout(yNodes)
            setStatus(`Hoàn tất — ${evt.totalNodes ?? count} node`)
            setPhase('done')
            return
          } else if (evt.type === 'error') {
            throw new Error(evt.message)
          }
        }
      }

      // Stream ended without explicit done
      triggerLayout(yNodes)
      setStatus(`Hoàn tất — ${count} node`)
      setPhase('done')

    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('[AIModal] stream error:', err)
      setError(err.message || 'Tạo mindmap thất bại')
      setPhase('error')
    }
  }, [hasPrompt, hasPdf, prompt, pdfFile, mode, mindmap._id, token, clearCanvas, yNodes, yEdges])

  // ── Mode badge ─────────────────────────────────────────────────────────
  const modeBadge = {
    combined: { label: 'PDF + Prompt',  cls: 'bg-indigo-100 text-indigo-700' },
    pdf:      { label: 'From PDF',      cls: 'bg-blue-100 text-blue-700'   },
    prompt:   { label: 'From Prompt',   cls: 'bg-purple-100 text-purple-700' },
  }[mode]

  // ── Progress bar fill (approx) ─────────────────────────────────────────
  const progressPct = phase === 'done' ? 100 : Math.min(99, nodeCount * 3)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center shadow">
              <SparklesIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-gray-900">AI Generate</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${modeBadge.cls}`}>
                  {modeBadge.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {isLoading
                  ? `Đang tạo... ${nodeCount > 0 ? `${nodeCount} node` : ''}`
                  : 'Nhập chủ đề, tải PDF, hoặc cả hai'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isLoading} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Error */}
          {error && (
            <div className="flex items-start space-x-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Streaming progress */}
          {isLoading && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-sm font-medium text-blue-900 truncate">{status || 'Đang xử lý...'}</p>
              </div>
              {/* progress bar */}
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {nodeCount > 0 && (
                <p className="text-xs text-blue-600">
                  {nodeCount} node đã được tạo — bản đồ đang hiện ra trên canvas ✨
                </p>
              )}
            </div>
          )}

          {/* Done */}
          {isDone && (
            <div className="flex items-center space-x-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <CheckCircleIcon className="w-10 h-10 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-900">Mindmap đã tạo xong!</p>
                <p className="text-xs text-green-700 mt-0.5">{status}</p>
                {mode === 'pdf' || mode === 'combined'
                  ? <p className="text-xs text-green-600 mt-1">Node có 📄 → click để xem đoạn PDF gốc</p>
                  : <p className="text-xs text-green-600 mt-1">Node có ✨ → click để xem nguồn web (nếu có)</p>
                }
              </div>
            </div>
          )}

          {/* Input form — hidden while streaming/done */}
          {!isDone && !isLoading && (
            <>
              {/* Prompt */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Chủ đề / Câu hỏi
                  <span className="font-normal text-gray-400 ml-1">(không bắt buộc nếu có PDF)</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                  placeholder={hasPdf ? 'Tập trung phân tích vào... (để trống = tóm tắt toàn bộ)' : 'VD: "Kiến trúc microservices", "Quy trình DevOps"...'}
                />
              </div>

              {/* PDF drop zone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  File PDF <span className="font-normal text-gray-400 ml-1">(không bắt buộc)</span>
                </label>

                {pdfFile ? (
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center space-x-2 min-w-0">
                      <DocumentArrowUpIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-blue-900 truncate">{pdfFile.name}</p>
                        <p className="text-xs text-blue-600">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                    </div>
                    <button onClick={() => setPdfFile(null)} className="ml-2 p-1.5 text-blue-400 hover:text-red-500 rounded-lg">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'}`}
                  >
                    <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
                    <CloudArrowUpIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500"><span className="text-purple-600 font-medium">Click để tải lên</span> hoặc kéo thả</p>
                    <p className="text-xs text-gray-400 mt-1">Chỉ PDF · Tối đa 20 MB</p>
                  </div>
                )}
              </div>

              {/* Mode hint */}
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                {!hasPrompt && !hasPdf && <p>💡 Nhập chủ đề <strong>hoặc</strong> tải PDF <strong>hoặc</strong> cả hai</p>}
                {hasPrompt && !hasPdf  && <p>✨ <strong>Prompt mode</strong> — AI tạo mindmap từ kiến thức của mình</p>}
                {hasPdf && !hasPrompt  && <p>📄 <strong>PDF mode</strong> — AI trích xuất cấu trúc tài liệu</p>}
                {hasPdf && hasPrompt   && <p>🔗 <strong>Combined</strong> — AI dùng câu hỏi của bạn để phân tích PDF có mục tiêu</p>}
                {(hasPdf || hasPrompt) && <p className="text-yellow-600 mt-1">⚠️ Sẽ xóa nội dung mindmap hiện tại</p>}
              </div>
            </>
          )}

          {/* Done action */}
          {isDone && (
            <button onClick={onClose} className="w-full py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90 transition">
              Đóng & xem Mindmap
            </button>
          )}
        </div>

        {/* Footer */}
        {!isDone && (
          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <div className="flex space-x-3">
              <button
                onClick={() => { abortRef.current?.abort(); onClose() }}
                disabled={false}
                className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
              >
                {isLoading ? 'Dừng & Đóng' : 'Hủy'}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isLoading || (!hasPrompt && !hasPdf)}
                className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang tạo...</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    <span>
                      {mode === 'combined' ? 'Tạo (PDF + Prompt)' : mode === 'pdf' ? 'Tạo từ PDF' : 'Tạo từ Prompt'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}