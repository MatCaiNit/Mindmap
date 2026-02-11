// Frontend/src/components/mindmap/TemplateSelectionModal.jsx - WITH THEME PREVIEW

import { useState } from 'react'
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { 
  MINDMAP_TEMPLATES, 
  TEMPLATE_CATEGORIES, 
  getTemplatesByCategory,
  getThemeDisplayName
} from '../../data/mindmapTemplates'

export default function TemplateSelectionModal({ onClose, onSelectTemplate }) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const templates = getTemplatesByCategory(selectedCategory)
  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelectTemplate = (template) => {
    onSelectTemplate(template)
    onClose()
  }

  // Get theme badge color
  const getThemeBadgeStyle = (theme) => {
    const styles = {
      modern: 'bg-blue-100 text-blue-700 border-blue-300',
      sketch: 'bg-amber-100 text-amber-700 border-amber-300',
      cartoon: 'bg-pink-100 text-pink-700 border-pink-300',
      circuit: 'bg-green-100 text-green-700 border-green-300',
      blueprint: 'bg-cyan-100 text-cyan-700 border-cyan-300',
      fluid: 'bg-purple-100 text-purple-700 border-purple-300',
      vintage: 'bg-orange-100 text-orange-700 border-orange-300'
    }
    return styles[theme] || 'bg-gray-100 text-gray-700 border-gray-300'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Choose a Template</h2>
              <p className="text-sm text-gray-600 mt-1">
                Each template has a unique theme and visual style
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="border-b border-gray-200 px-6 overflow-x-auto">
          <nav className="flex space-x-6 -mb-px">
            {TEMPLATE_CATEGORIES.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition flex items-center space-x-2 ${
                  selectedCategory === category.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{category.icon}</span>
                <span>{category.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Templates Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No templates found
              </h3>
              <p className="text-gray-600">
                Try adjusting your search or browse different categories
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className="text-left p-6 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:shadow-lg transition group"
                >
                  <div className="flex items-start space-x-3 mb-3">
                    <div 
                      className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                      style={{ 
                        backgroundColor: template.color 
                          ? `${template.color}15` 
                          : '#f3f4f6' 
                      }}
                    >
                      {template.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition truncate">
                        {template.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {template.category}
                      </p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                    {template.description}
                  </p>

                  {/* Template Info */}
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    {/* Theme Badge */}
                    {template.theme && (
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getThemeBadgeStyle(template.theme)}`}>
                          {getThemeDisplayName(template.theme)}
                        </span>
                      </div>
                    )}
                    
                    {/* Branches Count */}
                    {template.structure && (
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center space-x-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span>{template.structure.children?.length || 0} main branches</span>
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-600 text-center">
            💡 Tip: Each template has a distinct visual style - from hand-drawn sketches to circuit boards!
          </p>
        </div>
      </div>
    </div>
  )
}