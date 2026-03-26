// Frontend/src/components/mindmap/WebSourceModal.jsx  — NEW FILE
// Shows sources for nodes generated from a text prompt (aiSource field).

import { XMarkIcon, SparklesIcon, ArrowTopRightOnSquareIcon, GlobeAltIcon } from '@heroicons/react/24/outline'

export default function WebSourceModal({ aiSource, nodeLabel, onClose }) {
  if (!aiSource) return null

  const sources = aiSource.sources || []
  const isAIGenerated = aiSource.aiGenerated !== false

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <SparklesIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{nodeLabel}</p>
              <p className="text-xs text-gray-500">AI Generated Node</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {/* AI badge */}
          {isAIGenerated && (
            <div className="flex items-center space-x-2 mb-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <SparklesIcon className="w-4 h-4 text-purple-500 flex-shrink-0" />
              <p className="text-xs text-purple-700">
                Nội dung node này được tạo bởi AI từ prompt văn bản.
                Các nguồn dưới đây là gợi ý của AI — hãy kiểm chứng trước khi sử dụng.
              </p>
            </div>
          )}

          {/* Sources list */}
          {sources.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Nguồn tham khảo ({sources.length})
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition group"
                  >
                    <GlobeAltIcon className="w-4 h-4 text-gray-400 group-hover:text-purple-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-purple-700 truncate">
                        {src.title || src.url}
                      </p>
                      {src.url && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{src.url}</p>
                      )}
                    </div>
                    <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-400 group-hover:text-purple-500 flex-shrink-0" />
                  </a>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-gray-400">
              <GlobeAltIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Không có nguồn tham khảo cụ thể</p>
              <p className="text-xs mt-1 text-gray-300">
                Node này được tạo từ kiến thức AI, chưa có URL nguồn.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400 flex items-center space-x-1">
            <SparklesIcon className="w-3 h-3" />
            <span>Tạo bởi AI · Cần kiểm chứng</span>
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