// Frontend/src/components/mindmap/PDFSourceModal.jsx
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

export default function PDFSourceModal({ source, nodeLabel, onClose }) {
  if (!source) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <DocumentTextIcon className="w-5 h-5 text-blue-500" />
            <div>
              <p className="font-semibold text-gray-900 text-sm">{nodeLabel}</p>
              <p className="text-xs text-gray-500">
                Page {source.page ?? '?'} · Chunk #{source.chunkIndex}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Source text */}
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Đoạn văn gốc trong PDF
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {source.text}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Trang {source.page ?? 'không rõ'} trong file PDF
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