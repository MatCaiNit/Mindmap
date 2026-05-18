// Frontend/src/components/mindmap/AIAssistantModal.jsx

import { useState, useRef, useCallback, useEffect } from 'react'
import { calculateBalancedLayout } from '../../lib/treeLayout'
import { useAuthStore } from '../../stores/authStore'
import { useGenerationStore } from '../../stores/generationStore'
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

// ─── Apply node event vào Yjs ─────────────────────────────────────────────────
export function applyNodeEvent(nodePayload, yNodes) {
  const { id, ...rest } = nodePayload
  const bareLabel  = rest.label || rest.text || 'Node'
  const description = (rest.description || '').trim()
  const full = description ? `${bareLabel} — ${description}` : bareLabel
  yNodes.set(id, {
    label:     full,          // ← renderer reads this; now includes description
    text:      full,
    labelOnly: bareLabel,     // bare label kept separately if needed
    description,
    position:  rest.position || { x: 0, y: 0 },
    parentId:  rest.parentId ?? null,
    level:     rest.level ?? 0,
    side:      rest.side ?? null,
    autoAlign: rest.autoAlign ?? true,
    isRoot:    rest.isRoot || false,
    color:     rest.color || '#3b82f6',
    ...(rest.pdfSource ? { pdfSource: rest.pdfSource } : {}),
    ...(rest.aiSource  ? { aiSource:  rest.aiSource  } : {}),
  })
}

export function applyEdgeEvent(edgePayload, yEdges) {
  yEdges.push([edgePayload])
}

function triggerLayout(yNodes) {
  setTimeout(() => {
    try {
      const positions = calculateBalancedLayout(yNodes)
      positions.forEach((pos, nodeId) => {
        const n = yNodes.get(nodeId)
        if (n && n.autoAlign !== false) yNodes.set(nodeId, { ...n, position: pos })
      })
    } catch (_) {}
  }, 500)
}

// ─── Floating Progress Indicator (hiện khi modal đóng) ────────────────────────
export function GenerationProgressToast() {
  const { isGenerating, nodeCount, status, phase, error, cancelGeneration } =
    useGenerationStore()

  if (!isGenerating && phase !== 'done' && phase !== 'error') return null

  return (
    <div className="fixed bottom-6 right-6 z-[200] min-w-[300px] max-w-[380px]">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <SparklesIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900">AI Generate</span>
          </div>
          {isGenerating && (
            <button
              onClick={cancelGeneration}
              className="text-xs text-gray-400 hover:text-red-500 transition px-2 py-1 rounded hover:bg-red-50"
            >
              Dừng
            </button>
          )}
        </div>

        {/* Status */}
        <p className="text-xs text-gray-500 mb-2 truncate">{status || 'Đang xử lý...'}</p>

        {/* Progress bar */}
        {isGenerating && (
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
            <div
              className="bg-gradient-to-r from-purple-500 to-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(95, nodeCount * 2)}%` }}
            />
          </div>
        )}

        {/* Node count / result */}
        {isGenerating && nodeCount > 0 && (
          <p className="text-xs text-blue-600">✨ {nodeCount} node đã được tạo</p>
        )}

        {phase === 'done' && (
          <div className="flex items-center space-x-2 text-green-600 text-xs">
            <CheckCircleIcon className="w-4 h-4" />
            <span>{status}</span>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex items-center space-x-2 text-red-600 text-xs">
            <ExclamationCircleIcon className="w-4 h-4" />
            <span className="truncate">{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function AIAssistantModal({ mindmap, yNodes, yEdges, onClose }) {
  const [prompt,    setPrompt]    = useState('')
  const [pdfFile,   setPdfFile]   = useState(null)
  const [dragOver,  setDragOver]  = useState(false)
  const [localError, setLocalError] = useState('')

  const fileInputRef = useRef(null)
  const token = useAuthStore(s => s.accessToken)

  const {
    isGenerating,
    status,
    nodeCount,
    phase,
    error,
    startGeneration,
    updateStatus,
    incrementNodes,
    setNodeCount,
    finishGeneration,
    failGeneration,
    cancelGeneration,
    reset,
  } = useGenerationStore()

  const hasPrompt = prompt.trim().length > 0
  const hasPdf    = !!pdfFile
  const mode      = hasPdf && hasPrompt ? 'combined' : hasPdf ? 'pdf' : 'prompt'
  const isDone    = phase === 'done'
  const isError   = phase === 'error'

  // Khi component mount, nếu đang gen cho mindmap này thì hiện trạng thái
  const genState = useGenerationStore.getState()
  const isGeneratingThisMap = isGenerating && genState.mindmapId === mindmap._id

  // ── File handler ────────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') { setLocalError('Chỉ hỗ trợ file PDF'); return }
    if (file.size > 20 * 1024 * 1024)   { setLocalError('File phải nhỏ hơn 20 MB'); return }
    setLocalError('')
    setPdfFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0])
  }

  // ── Clear canvas ────────────────────────────────────────────────────────
  const clearCanvas = useCallback(() => {
    const ids = []
    yNodes.forEach((_, id) => ids.push(id))
    ids.forEach(id => yNodes.delete(id))
    if (yEdges.length > 0) yEdges.delete(0, yEdges.length)
  }, [yNodes, yEdges])

  // ── START GENERATION — runs independently of modal ─────────────────────
  const handleGenerate = useCallback(async () => {
    if (!hasPrompt && !hasPdf) return
    setLocalError('')

    const abortController = new AbortController()
    startGeneration({ mindmapId: mindmap._id, abortController })
    clearCanvas()

    // Run generation as a fire-and-forget promise
    // Modal can close without interrupting this
    ;(async () => {
      try {
        const formData = new FormData()
        formData.append('mindmapId', mindmap._id)
        formData.append('mode', mode)
        if (hasPrompt) formData.append('prompt', prompt.trim())
        if (hasPdf) {
          formData.append('pdf', pdfFile)
          formData.append('filename', pdfFile.name)
        }

        const endpoint = `${API_URL}/api/mindmaps/${mindmap._id}/generate-stream`

        const res = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          signal: abortController.signal,
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.message || `HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const dec    = new TextDecoder()
        let   buffer = ''
        let   count  = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += dec.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() ?? ''

          for (const chunk of lines) {
            const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
            if (!dataLine) continue

            let evt
            try { evt = JSON.parse(dataLine.slice(6)) } catch (_) { continue }

            if (evt.type === 'status') {
              updateStatus(evt.message)
            } else if (evt.type === 'node') {
              applyNodeEvent(evt.node, yNodes)
              count++
              setNodeCount(count)
            } else if (evt.type === 'edge') {
              applyEdgeEvent(evt.edge, yEdges)
            } else if (evt.type === 'done') {
              triggerLayout(yNodes)
              finishGeneration(evt.totalNodes ?? count)
              return
            } else if (evt.type === 'error') {
              throw new Error(evt.message)
            }
          }
        }

        // Stream ended without explicit done
        triggerLayout(yNodes)
        finishGeneration(count)

      } catch (err) {
        if (err.name === 'AbortError') return
        console.error('[AIModal] stream error:', err)
        failGeneration(err.message || 'Generation thất bại')
      }
    })()

    // Close modal immediately — generation continues in background
    onClose()

  }, [hasPrompt, hasPdf, prompt, pdfFile, mode, mindmap._id, token, clearCanvas, yNodes, yEdges, onClose])

  // Mode badge
  const modeBadge = {
    combined: { label: 'PDF + Prompt', cls: 'bg-indigo-100 text-indigo-700' },
    pdf:      { label: 'From PDF',     cls: 'bg-blue-100 text-blue-700' },
    prompt:   { label: 'From Prompt',  cls: 'bg-purple-100 text-purple-700' },
  }[mode]

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
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Local validation error */}
          {localError && (
            <div className="flex items-start space-x-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{localError}</span>
            </div>
          )}

          {/* Info về background gen */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            <p className="text-xs text-blue-600">
              AI có thể hỗ trợ bạn tạo mindmap từ file có sẵn hoặc câu hỏi bạn đưa ra.
              Tuy nhiên, quá trình này có thể mất vài phút tùy vào độ dài tài liệu và độ phức tạp của câu hỏi.
              Tiến trình hiện ở góc phải màn hình.
            </p>
          </div>

          {/* Input form */}
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
                placeholder={hasPdf
                  ? 'Tập trung phân tích vào... (để trống = tóm tắt toàn bộ)'
                  : 'VD: "Kiến trúc microservices", "Quy trình DevOps"...'}
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
                  <button
                    onClick={() => setPdfFile(null)}
                    className="ml-2 p-1.5 text-blue-400 hover:text-red-500 rounded-lg"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${
                    dragOver
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={e => handleFile(e.target.files[0])}
                  />
                  <CloudArrowUpIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    <span className="text-purple-600 font-medium">Click để tải lên</span> hoặc kéo thả
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Chỉ PDF · Tối đa 20 MB</p>
                </div>
              )}
            </div>

            {/* Mode hint */}
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
              {!hasPrompt && !hasPdf && <p>💡 Nhập chủ đề <strong>hoặc</strong> tải PDF <strong>hoặc</strong> cả hai</p>}
              {hasPrompt && !hasPdf  && <p>✨ <strong>Prompt mode</strong> — AI tạo mindmap 4-5 cấp từ chủ đề</p>}
              {hasPdf && !hasPrompt  && <p>📄 <strong>PDF mode</strong> — AI đọc toàn bộ PDF, tạo mục lục 5-6 cấp chi tiết</p>}
              {hasPdf && hasPrompt   && <p>🔗 <strong>Combined</strong> — Kết hợp PDF + câu hỏi để phân tích có mục tiêu</p>}
              {(hasPdf || hasPrompt) && (
                <p className="text-yellow-600">⚠️ Sẽ xóa nội dung mindmap hiện tại khi bắt đầu</p>
              )}
              {(hasPdf || hasPrompt) && (
                <p className="text-green-600">✅ Đóng hộp thoại sau khi bắt đầu — gen vẫn tiếp tục</p>
              )}
            </div>
          </>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
            >
              Đóng
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || (!hasPrompt && !hasPdf)}
              className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center space-x-2"
            >
              <>
                <SparklesIcon className="w-4 h-4" />
                <span>
                  {isGenerating
                    ? 'Đang tạo (chạy nền)...'
                    : mode === 'combined' ? 'Tạo (PDF + Prompt)'
                    : mode === 'pdf'      ? 'Tạo từ PDF'
                    :                       'Tạo từ Prompt'}
                </span>
              </>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}