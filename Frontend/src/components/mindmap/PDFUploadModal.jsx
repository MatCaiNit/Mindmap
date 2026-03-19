// Frontend/src/components/mindmap/PDFUploadModal.jsx
import { useState, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { aiService } from '../../services/aiService'
import {
  XMarkIcon,
  DocumentArrowUpIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import * as Y from 'yjs'

/**
 * Upload PDF → Backend → GenAI → mindmap JSON → write vào Yjs
 *
 * Props:
 *  mindmap   – mindmap object (cần _id)
 *  yNodes    – Y.Map
 *  yEdges    – Y.Array
 *  onClose   – fn
 */
export default function PDFUploadModal({ mindmap, yNodes, yEdges, onClose }) {
  const [file,        setFile]        = useState(null)
  const [dragOver,    setDragOver]    = useState(false)
  const [progress,    setProgress]    = useState(0)   // upload %
  const [phase,       setPhase]       = useState('')  // 'uploading' | 'generating' | 'applying' | 'done' | 'error'
  const [errorMsg,    setErrorMsg]    = useState('')
  const fileInputRef = useRef(null)

  // ── File selection ──────────────────────────────────────────────────────
  const pickFile = (f) => {
    if (!f) return
    if (f.type !== 'application/pdf') {
      setErrorMsg('Only PDF files are supported.')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setErrorMsg('File must be smaller than 20 MB.')
      return
    }
    setErrorMsg('')
    setFile(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    pickFile(e.dataTransfer.files[0])
  }

  // ── Write mindmap tree into Yjs ──────────────────────────────────────────
  const applyMindmapToYjs = useCallback((mindmapJson) => {
    // mindmapJson = { root: { text, children[] } }  (from ai.service.js)
    const root = mindmapJson.root ?? mindmapJson

    // Clear existing nodes / edges (except root-node will be re-created)
    const existingIds = []
    yNodes.forEach((_, id) => existingIds.push(id))
    existingIds.forEach(id => yNodes.delete(id))

    const existingEdgeLen = yEdges.length
    if (existingEdgeLen > 0) yEdges.delete(0, existingEdgeLen)

    const ROOT_X = 600, ROOT_Y = 400
    const LEVEL_GAP = 260

    // ── Build flat list with positions ────────────────────────────────────
    const COLOR_POOL = [
      '#3b82f6','#10b981','#f59e0b','#ef4444',
      '#8b5cf6','#ec4899','#14b8a6','#f97316',
    ]

    let nodeCounter = 0

    // Helper: build pdfSource từ chunk index
    const buildSource = (sourceChunkIdx) => {
      if (sourceChunkIdx === undefined || sourceChunkIdx === null) return null
      const chunk = chunks[sourceChunkIdx]
      if (!chunk) return null
      return {
        text:       chunk.text,
        page:       chunk.pageNum ?? chunk.metadata?.pageEstimate ?? null,
        chunkIndex: sourceChunkIdx,
      }
    }

    function processNode(node, parentId, level, side, x, y, colorIdx) {
      const nodeId = level === 0 ? 'root-node' : `pdf-node-${++nodeCounter}`
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
          fontSize:   level === 1 ? '15px' : '13px',
          fontWeight: level === 1 ? '600' : '500',
          borderRadius: level === 1 ? '10px' : '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding:   level === 1 ? '10px 18px' : '8px 14px',
          textColor: '#ffffff',
        }),
      })

      if (parentId) {
        const sh = side === 'right' ? 'source-right' : 'source-left'
        const th = side === 'right' ? 'target-left'  : 'target-right'
        yEdges.push([{
          id:            `e-${parentId}-${nodeId}`,
          source:        parentId,
          target:        nodeId,
          sourceHandle:  sh,
          targetHandle:  th,
          color:         '#3b82f6',
          width:         2,
          style:         'solid',
          isParentChild: true,
        }])
      }

      const children = node.children ?? []
      if (children.length === 0) return

      // Distribute children alternating left/right for level-1,
      // same side for deeper
      const childX = x + (side === 'left' ? -LEVEL_GAP : LEVEL_GAP)
      const rowH   = level === 0 ? 100 : 80
      const totalH = children.length * rowH
      let   startY = y - totalH / 2

      children.forEach((child, i) => {
        const childSide = level === 0
          ? (i % 2 === 0 ? 'right' : 'left')
          : side
        const childX2   = level === 0
          ? ROOT_X + (childSide === 'right' ? LEVEL_GAP : -LEVEL_GAP)
          : childX
        const childY    = level === 0
          ? ROOT_Y + (i - (children.length - 1) / 2) * rowH
          : startY + i * rowH + rowH / 2

        processNode(child, nodeId, level + 1, childSide, childX2, childY, i)
        if (level === 0) startY = childY // unused but harmless
      })
    }

    processNode(root, null, 0, 'right', ROOT_X, ROOT_Y, 0)
  }, [yNodes, yEdges])

  // ── Main mutation ────────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async () => {
      setPhase('uploading')
      setProgress(0)
      const result = await aiService.generateFromPdf(
        mindmap._id,
        file,
        (pct) => setProgress(pct),
      )
      return result
    },
    onSuccess: (data) => {
      setPhase('applying')
      // data = { ok, mindmap: { root: {...} }, chunksUsed }
      const mindmapJson = data.mindmap ?? data
      const chunks      = data.chunks ?? [] 
      setTimeout(() => {
        applyMindmapToYjs(mindmapJson)
        setPhase('done')
      }, 300)
    },
    onError: (err) => {
      setPhase('error')
      setErrorMsg(err.response?.data?.message || err.message || 'Generation failed.')
    },
  })

  const handleGenerate = () => {
    if (!file) return
    setErrorMsg('')
    generateMutation.mutate()
  }

  // ── Status messages ──────────────────────────────────────────────────────
  const phaseLabel = {
    uploading:  `Uploading PDF… ${progress}%`,
    generating: 'AI is reading your document…',
    applying:   'Building mindmap…',
    done:       'Mindmap generated!',
    error:      errorMsg,
  }[phase] || ''

  const isBusy = ['uploading', 'generating', 'applying'].includes(phase)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
              <SparklesIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Generate from PDF</h2>
              <p className="text-xs text-gray-500">Upload a PDF and AI will create a mindmap</p>
            </div>
          </div>
          {!isBusy && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
              <XMarkIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Drop zone */}
        {phase !== 'done' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !isBusy && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-4
              ${dragOver ? 'border-purple-400 bg-purple-50'
                : file   ? 'border-green-400 bg-green-50'
                : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'}
              ${isBusy ? 'pointer-events-none opacity-60' : ''}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => pickFile(e.target.files[0])}
            />

            {file ? (
              <div className="flex items-center justify-center space-x-3">
                <DocumentArrowUpIcon className="w-8 h-8 text-green-500" />
                <div className="text-left">
                  <p className="font-medium text-gray-900 truncate max-w-[260px]">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
            ) : (
              <>
                <DocumentArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="font-medium text-gray-700">Drop PDF here or click to browse</p>
                <p className="text-xs text-gray-500 mt-1">Max 20 MB · PDF only</p>
              </>
            )}
          </div>
        )}

        {/* Progress bar */}
        {isBusy && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">{phaseLabel}</span>
              {phase === 'uploading' && <span className="text-gray-500">{progress}%</span>}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: phase === 'uploading' ? `${progress}%` : '100%' }}
              />
            </div>
            {phase !== 'uploading' && (
              <div className="flex items-center space-x-2 mt-2">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-500">{phaseLabel}</span>
              </div>
            )}
          </div>
        )}

        {/* Done state */}
        {phase === 'done' && (
          <div className="flex flex-col items-center py-4 mb-4">
            <CheckCircleIcon className="w-14 h-14 text-green-500 mb-2" />
            <p className="font-semibold text-gray-900">Mindmap created successfully!</p>
            <p className="text-sm text-gray-500 mt-1">Your PDF has been converted into a mindmap.</p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}

        {/* Static error (file validation) */}
        {errorMsg && phase !== 'error' && (
          <p className="text-sm text-red-600 mb-3">{errorMsg}</p>
        )}

        {/* Warning: replaces existing content */}
        {file && !isBusy && phase !== 'done' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-800">
            ⚠️ This will <strong>replace</strong> the current mindmap content.
          </div>
        )}

        {/* Actions */}
        <div className="flex space-x-3">
          {phase === 'done' ? (
            <button onClick={onClose} className="btn-primary w-full">
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={isBusy}
                className="btn-secondary flex-1 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!file || isBusy}
                className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg px-4 py-2 font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isBusy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    <span>Generate Mindmap</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}