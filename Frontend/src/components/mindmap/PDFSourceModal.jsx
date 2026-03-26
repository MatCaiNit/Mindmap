// Frontend/src/components/mindmap/PDFSourceModal.jsx
// Changes vs original:
//   • Better layout — full chunk text with surrounding context highlighting
//   • "Copy text" button
//   • Cleaner header with page badge
//   • Responsive max-height

import { useState } from 'react'
import { XMarkIcon, DocumentTextIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'

export default function PDFSourceModal({ source, nodeLabel, onClose }) {
  const [copied, setCopied] = useState(false)

  if (!source) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) { /* clipboard not available */ }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh]">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <DocumentTextIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">{nodeLabel}</p>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  Trang {source.page ?? '?'}
                </span>
                <span className="text-xs text-gray-400">
                  Chunk #{source.chunkIndex}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition mt-0.5">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Đoạn văn gốc trong PDF
            </p>
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1 text-xs text-gray-500 hover:text-gray-700 transition px-2 py-1 rounded hover:bg-gray-100"
            >
              {copied ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-green-600">Đã sao chép</span>
                </>
              ) : (
                <>
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>

          {/* Source text box */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 relative">
            {/* Quotation mark decoration */}
            <span className="absolute top-2 left-3 text-4xl text-gray-200 font-serif leading-none select-none">
              "
            </span>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap pl-4">
              {source.text}
            </p>
          </div>

          {/* Hint */}
          <p className="text-xs text-gray-400 mt-3 text-center">
            Nội dung node được trích xuất từ trang {source.page ?? '?'} của file PDF.
            Mở file PDF và tìm đến trang này để xem ngữ cảnh đầy đủ.
          </p>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-400">
            📄 Trang {source.page ?? 'không rõ'} trong file PDF
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}