// Frontend/src/components/mindmap/FloatingToolbar.jsx - COMBINED VERSION

import { useState, useEffect, useRef } from 'react'
import {
  LockClosedIcon,
  LockOpenIcon,
  LinkIcon,
} from '@heroicons/react/24/outline'

const NODE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
]

const TEXT_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#f97316'
]

const FONT_SIZES = [
  { label: 'XS', value: '12px' },
  { label: 'S', value: '14px' },
  { label: 'M', value: '16px' },
  { label: 'L', value: '20px' },
  { label: 'XL', value: '24px' },
]

export default function FloatingToolbar({ 
  selectedNode, 
  position, 
  yNodes,
  onToggleAutoAlign,
  onStartConnection,
  isCreatingConnection 
}) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showTextColorPicker, setShowTextColorPicker] = useState(false)
  const [showFontSize, setShowFontSize] = useState(false)
  const toolbarRef = useRef(null)

  const currentNode = yNodes.get(selectedNode.id) || {}
  const isRoot = selectedNode.id === 'root-node'
  const autoAlign = currentNode.autoAlign !== false

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setShowColorPicker(false)
        setShowTextColorPicker(false)
        setShowFontSize(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const updateNode = (updates) => {
    if (!selectedNode || !yNodes) return
    
    const node = yNodes.get(selectedNode.id)
    if (node) {
      yNodes.set(selectedNode.id, {
        ...node,
        ...updates
      })
    }
  }

  const handleBoldToggle = () => {
    updateNode({ bold: !currentNode.bold })
  }

  const handleItalicToggle = () => {
    updateNode({ italic: !currentNode.italic })
  }

  const handleUnderlineToggle = () => {
    updateNode({ underline: !currentNode.underline })
  }

  const handleNodeColorChange = (color) => {
    updateNode({ color })
    setShowColorPicker(false)
  }

  const handleTextColorChange = (color) => {
    updateNode({ textColor: color })
    setShowTextColorPicker(false)
  }

  const handleFontSizeChange = (size) => {
    updateNode({ fontSize: size.value })
    setShowFontSize(false)
  }

  const handleConnectionClick = () => {
    if (onStartConnection) {
      onStartConnection()
    }
  }

  if (!selectedNode || !position) return null

  return (
    <div
      ref={toolbarRef}
      className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 px-3 py-2 flex items-center space-x-2 z-50"
      style={{
        left: position.x,
        top: position.y - 70,
        transform: 'translateX(-50%)'
      }}
    >
      {/* Auto-Align Lock - Not for root */}
      {!isRoot && (
        <>
          <button
            onClick={onToggleAutoAlign}
            className={`p-2 rounded transition ${
              autoAlign 
                ? 'bg-blue-100 text-blue-600' 
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={autoAlign ? "Locked (auto-align)" : "Unlocked (draggable)"}
          >
            {autoAlign ? (
              <LockClosedIcon className="w-5 h-5" />
            ) : (
              <LockOpenIcon className="w-5 h-5" />
            )}
          </button>
          
          <div className="w-px h-6 bg-gray-200" />
        </>
      )}

      {/* Text Formatting */}
      <div className="flex items-center space-x-1 pr-2 border-r border-gray-200">
        <button
          onClick={handleBoldToggle}
          className={`px-2.5 py-1.5 rounded font-bold transition ${
            currentNode.bold 
              ? 'bg-blue-600 text-white' 
              : 'hover:bg-gray-100 text-gray-700'
          }`}
          title="Bold"
        >
          B
        </button>
        
        <button
          onClick={handleItalicToggle}
          className={`px-2.5 py-1.5 rounded italic transition ${
            currentNode.italic 
              ? 'bg-blue-600 text-white' 
              : 'hover:bg-gray-100 text-gray-700'
          }`}
          title="Italic"
        >
          I
        </button>
        
        <button
          onClick={handleUnderlineToggle}
          className={`px-2.5 py-1.5 rounded underline transition ${
            currentNode.underline 
              ? 'bg-blue-600 text-white' 
              : 'hover:bg-gray-100 text-gray-700'
          }`}
          title="Underline"
        >
          U
        </button>
      </div>

      {/* Font Size */}
      <div className="relative pr-2 border-r border-gray-200">
        <button
          onClick={() => setShowFontSize(!showFontSize)}
          className="px-3 py-1.5 rounded hover:bg-gray-100 transition flex items-center space-x-1"
          title="Font Size"
        >
          <span className="text-sm font-medium">A</span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showFontSize && (
          <div 
            className="absolute top-12 left-0 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-[100]"
            style={{ minWidth: '200px' }}
          >
            <div className="space-y-1">
              {FONT_SIZES.map(size => (
                <button
                  key={size.value}
                  onClick={() => handleFontSizeChange(size)}
                  className={`w-full px-3 py-2 rounded text-left transition ${
                    currentNode.fontSize === size.value
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span style={{ fontSize: size.value }}>{size.label} - Sample</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Node Color Picker */}
      <div className="relative pr-2 border-r border-gray-200">
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="p-2 rounded hover:bg-gray-100 transition"
          title="Node Background"
        >
          <div 
            className="w-6 h-6 rounded border-2 border-gray-300"
            style={{ backgroundColor: currentNode.color || '#3b82f6' }}
          />
        </button>

        {showColorPicker && (
          <div 
            className="absolute top-12 left-0 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-[100]"
            style={{ minWidth: '240px' }}
          >
            <p className="text-xs font-medium text-gray-700 mb-2">Node Color</p>
            <div className="grid grid-cols-5 gap-3">
              {NODE_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => handleNodeColorChange(color)}
                  className={`w-10 h-10 rounded-full border-2 hover:scale-110 transition ${
                    currentNode.color === color 
                      ? 'border-gray-900 ring-2 ring-blue-400' 
                      : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Text Color Picker */}
      <div className="relative pr-2 border-r border-gray-200">
        <button
          onClick={() => setShowTextColorPicker(!showTextColorPicker)}
          className="p-2 rounded hover:bg-gray-100 transition"
          title="Text Color"
        >
          <div className="relative">
            <span className="text-lg font-bold">A</span>
            <div 
              className="absolute bottom-0 left-0 right-0 h-1 rounded"
              style={{ backgroundColor: currentNode.textColor || '#ffffff' }}
            />
          </div>
        </button>

        {showTextColorPicker && (
          <div 
            className="absolute top-12 left-0 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-[100]"
            style={{ minWidth: '240px' }}
          >
            <p className="text-xs font-medium text-gray-700 mb-2">Text Color</p>
            <div className="grid grid-cols-5 gap-3">
              {TEXT_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => handleTextColorChange(color)}
                  className={`w-10 h-10 rounded-full border-2 hover:scale-110 transition ${
                    currentNode.textColor === color 
                      ? 'border-gray-900 ring-2 ring-blue-400' 
                      : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Custom Connection Button */}
      <button
        onClick={handleConnectionClick}
        className={`p-2 rounded transition ${
          isCreatingConnection
            ? 'bg-blue-100 text-blue-600' 
            : 'hover:bg-gray-100 text-gray-700'
        }`}
        title="Add Custom Connection"
      >
        <LinkIcon className="w-5 h-5" />
      </button>
    </div>
  )
}