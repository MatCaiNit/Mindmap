import { useState } from 'react'
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline'
import TemplateSelectionModal from './TemplateSelectionModal'

export default function CreateMindmapModal({ onClose, onCreate }) {
  const [showTemplates, setShowTemplates] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (title.trim()) {
      onCreate(title, description, selectedTemplate)
    }
  }

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template)
    if (!title) {
      // Auto-fill title based on template
      if (template.structure) {
        setTitle(template.structure.text)
      } else {
        setTitle('New Mindmap')
      }
    }
  }

  if (showTemplates) {
    return (
      <TemplateSelectionModal
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={handleSelectTemplate}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Create Mindmap</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Template Selection Button */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="w-full flex items-center justify-between p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                <SparklesIcon className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900 group-hover:text-primary-600">
                  {selectedTemplate ? selectedTemplate.name : 'Choose a Template'}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedTemplate 
                    ? 'Click to change template' 
                    : 'Start with a pre-built structure'}
                </p>
              </div>
            </div>
            <svg 
              className="w-5 h-5 text-gray-400 group-hover:text-primary-600" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Selected Template Info */}
        {selectedTemplate && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <span className="text-2xl">{selectedTemplate.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900">
                  {selectedTemplate.name}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  {selectedTemplate.description}
                </p>
                {selectedTemplate.structure && (
                  <p className="text-xs text-blue-600 mt-1">
                    ✓ {selectedTemplate.structure.children?.length || 0} main branches included
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedTemplate(null)}
                className="flex-shrink-0 text-blue-400 hover:text-blue-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder={selectedTemplate?.structure?.text || "My new mindmap"}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input resize-none"
              rows={3}
              placeholder="What's this mindmap about?"
            />
          </div>

          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              {selectedTemplate ? 'Create from Template' : 'Create Blank'}
            </button>
          </div>
        </form>

        {!selectedTemplate && (
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              or{' '}
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                browse templates
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}