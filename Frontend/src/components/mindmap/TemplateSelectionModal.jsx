// Frontend/src/components/mindmap/TemplateSelectionModal.jsx
import { useState } from 'react'
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import {
  MINDMAP_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
  getThemeDisplayName,
} from '../../data/mindmapTemplates'

// Colours used as subtle tint for the theme badge
const THEME_BADGE = {
  modern:  'bg-blue-50   text-blue-700  border-blue-200',
  sketch:  'bg-amber-50  text-amber-700 border-amber-200',
  neon:    'bg-green-50  text-green-700 border-green-200',
  vintage: 'bg-orange-50 text-orange-700 border-orange-200',
}

// Small colour swatches shown inside each card so the user knows what the
// theme looks like before clicking.
const THEME_PREVIEW_COLORS = {
  modern:  ['#1e40af', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
  sketch:  ['#fbbf24', '#86efac', '#93c5fd', '#f9a8d4', '#a5f3fc'],
  neon:    ['#0f172a', '#00f5ff', '#39ff14', '#ff10f0', '#ffd700'],
  vintage: ['#d4a853', '#c17f3a', '#a05c1a', '#7c3f0a', '#cd9b1d'],
}

export default function TemplateSelectionModal({ onClose, onSelectTemplate }) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery]           = useState('')

  const templates = getTemplatesByCategory(selectedCategory)
  const filtered  = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelect = (template) => {
    onSelectTemplate(template)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Choose a Template</h2>
              <p className="text-sm text-gray-500 mt-1">
                4 templates, each with a unique visual theme
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition mt-1">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
        </div>

        {/* ── Category tabs ───────────────────────────────────────────────── */}
        <div className="border-b border-gray-100 px-6 overflow-x-auto">
          <nav className="flex space-x-6 -mb-px">
            {TEMPLATE_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`py-3 px-1 border-b-2 text-sm font-medium whitespace-nowrap transition flex items-center space-x-1.5 ${
                  selectedCategory === cat.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* ── Template grid ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-5xl mb-3">🔍</p>
              <p className="font-medium">No templates match that search</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="text-left p-5 border-2 border-gray-100 rounded-xl hover:border-primary-400 hover:shadow-lg transition-all group"
                >
                  {/* Top row: icon + title + theme badge */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-3xl">{template.icon}</span>
                      <div>
                        <p className="font-semibold text-gray-900 group-hover:text-primary-600 transition">
                          {template.name}
                        </p>
                        <p className="text-xs text-gray-400">{template.category}</p>
                      </div>
                    </div>

                    {template.theme && (
                      <span className={`ml-2 flex-shrink-0 text-xs font-medium px-2 py-1 rounded-full border ${THEME_BADGE[template.theme] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {getThemeDisplayName(template.theme)}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                    {template.description}
                  </p>

                  {/* Colour swatches preview */}
                  {template.theme && THEME_PREVIEW_COLORS[template.theme] && (
                    <div className="flex items-center space-x-1.5">
                      {THEME_PREVIEW_COLORS[template.theme].map((col, i) => (
                        <span
                          key={i}
                          className="w-5 h-5 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: col }}
                        />
                      ))}
                      <span className="text-xs text-gray-400 ml-1">
                        {template.structure?.children?.length ?? 0} branches
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl text-center text-xs text-gray-400">
          Each template locks in a visual theme — Modern · Sketch · Neon · Vintage
        </div>
      </div>
    </div>
  )
}