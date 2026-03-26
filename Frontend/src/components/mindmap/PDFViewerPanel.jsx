// Frontend/src/components/mindmap/PDFViewerPanel.jsx

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  DocumentMagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../../stores/authStore'
import { usePdfViewerStore } from '../../stores/pdfViewerStore'

const MIN_WIDTH = 340
const DEFAULT_WIDTH = 480

export default function PDFViewerPanel() {
  const { id: mindmapId } = useParams()
  const token = useAuthStore((s) => s.accessToken)
  const { isVisible, pageNum, chunkText, hide } = usePdfViewerStore()

  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [expanded, setExpanded] = useState(false)
  const [searchHighlight, setSearchHighlight] = useState(false)

  const iframeRef = useRef(null)
  const blobUrlRef = useRef(null) // keep ref for cleanup
  const resizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(DEFAULT_WIDTH)

  // ── Load PDF blob when panel opens ──────────────────────────────────────
  useEffect(() => {
    if (!isVisible || !mindmapId || !token) return

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/mindmaps/${mindmapId}/pdf-file`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((d) => {
            throw new Error(d.message || `HTTP ${res.status}`)
          })
        }
        return res.blob()
      })
      .then((blob) => {
        if (cancelled) return
        // Revoke previous blob URL
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setBlobUrl(url)
        setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isVisible, mindmapId, token])

  // ── Navigate to cited page when source is opened ─────────────────────────
  useEffect(() => {
    if (pageNum != null) {
      setCurrentPage(pageNum)
      setSearchHighlight(true)
      setTimeout(() => setSearchHighlight(false), 3000)
    }
  }, [pageNum, isVisible])

  // ── Revoke blob on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  // ── Resize drag handlers ──────────────────────────────────────────────────
  const onResizeStart = useCallback((e) => {
    resizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = panelWidth
    e.preventDefault()
  }, [panelWidth])

  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current) return
      const delta = startXRef.current - e.clientX
      const newW = Math.max(MIN_WIDTH, Math.min(window.innerWidth * 0.8, startWidthRef.current + delta))
      setPanelWidth(newW)
    }
    const onUp = () => { resizingRef.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Iframe src (navigate to page) ─────────────────────────────────────────
  const iframeSrc = blobUrl ? `${blobUrl}#page=${currentPage}` : null

  if (!isVisible) return null

  const effectiveWidth = expanded ? '50vw' : panelWidth

  return (
    <>
      {/* Drag-resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="fixed top-0 bottom-0 z-[60] cursor-ew-resize w-1 hover:bg-blue-400 transition-colors"
        style={{
          right: typeof effectiveWidth === 'string' ? effectiveWidth : effectiveWidth,
          background: 'transparent',
        }}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white border-l border-gray-200 shadow-2xl"
        style={{ width: effectiveWidth }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-900 text-white flex-shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <DocumentMagnifyingGlassIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-sm font-semibold truncate">PDF Source</span>
            {currentPage && (
              <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full flex-shrink-0">
                p.{currentPage}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded hover:bg-gray-700 transition"
              title={expanded ? 'Collapse' : 'Expand to 50%'}
            >
              {expanded
                ? <ArrowsPointingInIcon className="w-4 h-4" />
                : <ArrowsPointingOutIcon className="w-4 h-4" />
              }
            </button>
            <button
              onClick={hide}
              className="p-1.5 rounded hover:bg-gray-700 transition"
              title="Close"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Cited passage ─────────────────────────────────────────────── */}
        {chunkText && (
          <div
            className={`px-3 py-2 border-b text-xs flex-shrink-0 transition-colors duration-500 ${
              searchHighlight
                ? 'bg-yellow-100 border-yellow-300'
                : 'bg-amber-50 border-amber-100'
            }`}
          >
            <p className="font-semibold text-amber-900 mb-1 flex items-center space-x-1">
              <span>📌</span>
              <span>Cited passage{currentPage ? ` — page ${currentPage}` : ''}</span>
            </p>
            <p className="text-amber-800 leading-relaxed line-clamp-4">{chunkText}</p>
          </div>
        )}

        {/* ── Page navigation ───────────────────────────────────────────── */}
        {blobUrl && !loading && !error && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex-shrink-0">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-600">
              Page{' '}
              <input
                type="number"
                min={1}
                value={currentPage}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v > 0) setCurrentPage(v)
                }}
                className="w-12 text-center border border-gray-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </span>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              className="p-1 rounded hover:bg-gray-200 transition"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Main content ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">
          {/* Loading */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading PDF…</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gray-50">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-1">PDF Unavailable</p>
              <p className="text-xs text-gray-500 text-center mb-4">{error}</p>
              <p className="text-xs text-gray-400 text-center">
                PDF files are cached for 4 hours.<br />Re-upload the PDF to view it again.
              </p>
              {chunkText && (
                <div className="mt-4 w-full p-3 bg-white border border-gray-200 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-1">Text from source:</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{chunkText}</p>
                </div>
              )}
            </div>
          )}

          {/* PDF iframe */}
          {iframeSrc && !loading && !error && (
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              className="w-full h-full border-0"
              title="PDF Viewer"
            />
          )}
        </div>

        {/* ── Footer tip ────────────────────────────────────────────────── */}
        {blobUrl && !loading && !error && (
          <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200 flex-shrink-0">
            <p className="text-xs text-gray-400 text-center">
              Drag the left edge to resize • Use browser zoom to fit
            </p>
          </div>
        )}
      </div>
    </>
  )
}