// Frontend/src/components/mindmap/MindMeisterNode.jsx
// Source badges:
//   📄  pdfSource  → opens PDF viewer panel at the cited page/chunk
//   ✨  aiSource   → if sources[].url exists: opens in new tab; else shows tooltip "no web source"
// Both can coexist on the same node (combined mode).

import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { Handle, Position } from 'reactflow'
import { PlusCircleIcon } from '@heroicons/react/24/solid'
import { usePdfViewerStore } from '../../stores/pdfViewerStore'

const MindMeisterNode = memo(({ data, id, selected, dragging }) => {
  const [isEditing,   setIsEditing]   = useState(false)
  const [localLabel,  setLocalLabel]  = useState(data.label)
  const [showAnchors, setShowAnchors] = useState(false)
  const [noSrcMsg,    setNoSrcMsg]    = useState('')
  const inputRef          = useRef(null)
  const isComposingRef    = useRef(false)
  const editingSetRef     = useRef(false)

  const showPdfViewer = usePdfViewerStore(s => s.show)

  const isReadOnly  = data.isReadOnly  || false
  const level       = data.level       || 0
  const side        = data.side
  const isRoot      = data.isRoot      || id === 'root-node'
  const autoAlign   = data.autoAlign   !== false
  const isConnMode  = data.isCreatingConnection || false
  const pdfSource   = data.pdfSource   || null
  const aiSource    = data.aiSource    || null
  const hasBoth     = !!(pdfSource && aiSource)

  // Styling
  const color        = data.color        || '#3b82f6'
  const textColor    = data.textColor    || (level === 0 ? '#1f2937' : '#ffffff')
  const fontSize     = data.fontSize     || (level === 0 ? '20px' : level === 1 ? '16px' : level === 2 ? '14px' : '12px')
  const fontWeight   = data.fontWeight   || (level === 0 ? 'bold' : level === 1 ? '600' : '500')
  const borderRadius = data.borderRadius || (level === 0 ? '12px' : '8px')
  const fontFamily   = data.fontFamily   || 'inherit'
  const transform    = data.transform    || 'none'
  const bold         = data.bold         || (level === 0)
  const italic       = data.italic       || false
  const underline    = data.underline    || false

  useEffect(() => { setLocalLabel(data.label) }, [data.label])

  useEffect(() => {
    if (data.editing && !isReadOnly && !editingSetRef.current) {
      editingSetRef.current = true
      setTimeout(() => {
        setIsEditing(true)
        if (data.onEditingChange) data.onEditingChange(true)
        setTimeout(() => {
          const node = data.yNodes?.get(id)
          if (node?.editing) data.yNodes.set(id, { ...node, editing: false })
        }, 100)
      }, 50)
    }
  }, [data.editing, id, data.yNodes, isReadOnly, data.onEditingChange])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
      }))
    }
  }, [isEditing])

  const handleDoubleClick = () => {
    if (isReadOnly) return
    setIsEditing(true)
    if (data.onEditingChange) data.onEditingChange(true)
  }

  const handleBlur = useCallback(() => {
    if (isComposingRef.current) return
    setIsEditing(false)
    editingSetRef.current = false
    if (data.onEditingChange) data.onEditingChange(false)
    if (data.yNodes) {
      const node = data.yNodes.get(id)
      if (node) {
        const label = localLabel.trim() || (isRoot ? node.label : 'New Node')
        data.yNodes.set(id, { ...node, label })
      }
    }
  }, [id, localLabel, data, isRoot])

  const handleKeyDown = (e) => {
    if (isComposingRef.current) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBlur() }
    if (e.key === 'Escape') {
      setLocalLabel(data.label); setIsEditing(false); editingSetRef.current = false
      if (data.onEditingChange) data.onEditingChange(false)
    }
    if (e.key === 'Tab') e.stopPropagation()
  }

  // ── SOURCE HANDLERS ──────────────────────────────────────────────────────

  // PDF badge: open PDF viewer panel at the cited page/chunk
  const handlePdfClick = useCallback((e) => {
    e.stopPropagation()
    if (!pdfSource) return
    showPdfViewer(
      pdfSource.page        ?? null,
      pdfSource.text        ?? null,
      pdfSource.chunkIndex  ?? null,
    )
  }, [pdfSource, showPdfViewer])

  // AI badge: open web source in new tab, or show brief tooltip
  const handleAiClick = useCallback((e) => {
    e.stopPropagation()
    const sources = aiSource?.sources || []
    if (!sources.length) {
      showMsg('Không có nguồn web cho node này')
      return
    }
    const src = sources[0]
    if (!src?.url?.startsWith('http')) { showMsg('URL nguồn không hợp lệ'); return }
    let url = src.url.trim()
    if (src.searchText) url += `#:~:text=${encodeURIComponent(src.searchText.trim())}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [aiSource])

  const showMsg = (msg) => { setNoSrcMsg(msg); setTimeout(() => setNoSrcMsg(''), 2500) }

  // ── NODE STYLE ──────────────────────────────────────────────────────────
  const nodeStyle = {
    backgroundColor: data.background || color,
    color:           textColor,
    fontSize,
    fontWeight:      bold ? 'bold' : fontWeight,
    fontStyle:       italic ? 'italic' : 'normal',
    textDecoration:  underline ? 'underline' : 'none',
    fontFamily, borderRadius, transform,
    border:          data.border    || 'none',
    boxShadow:       data.boxShadow || (level === 0 ? '0 4px 12px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.08)'),
    padding:         data.padding   || (level === 0 ? '16px 24px' : level === 1 ? '12px 20px' : '8px 16px'),
    letterSpacing:   data.letterSpacing || 'normal',
    position: 'relative',
    minWidth: level === 0 ? '180px' : '100px',
    maxWidth: '350px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    // Left border if AI-generated (subtle purple stripe)
    ...(aiSource && !pdfSource ? { borderLeft: '3px solid rgba(139,92,246,0.6)' } : {}),
  }

  const addBtnSide = side === 'left' ? 'left' : 'right'

  return (
    <div
      className="relative group"
      onMouseEnter={() => isConnMode && setShowAnchors(true)}
      onMouseLeave={() => setShowAnchors(false)}
    >
      <div
        className={[
          'cursor-pointer',
          selected   ? 'ring-4 ring-primary-400 ring-opacity-50' : '',
          !isReadOnly ? 'hover:shadow-lg hover:scale-105' : '',
          dragging   ? 'opacity-50' : '',
        ].join(' ')}
        style={nodeStyle}
        onDoubleClick={handleDoubleClick}
      >
        {/* ── PDF source badge 📄 ────────────────────────────────────── */}
        {pdfSource && (
          <button
            onClick={handlePdfClick}
            title={pdfSource.page ? `Xem PDF — trang ${pdfSource.page}` : 'Xem đoạn PDF gốc'}
            style={{
              position: 'absolute', top: '4px',
              right: hasBoth ? '26px' : '4px',
              width: '18px', height: '18px',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.25)',
              border: '1px solid rgba(255,255,255,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, fontSize: '10px',
            }}
          >
            📄
          </button>
        )}

        {/* ── AI source badge ✨ ─────────────────────────────────────── */}
        {aiSource && (
          <>
            <button
              onClick={handleAiClick}
              title={
                aiSource?.sources?.length
                  ? 'Mở nguồn web trong tab mới'
                  : 'AI tạo — không có nguồn web'
              }
              style={{
                position: 'absolute', top: '4px', right: '4px',
                width: '18px', height: '18px',
                borderRadius: '4px',
                background: 'rgba(139,92,246,0.25)',
                border: '1px solid rgba(139,92,246,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: aiSource?.sources?.length ? 'pointer' : 'default',
                padding: 0, fontSize: '10px',
              }}
            >
              ✨
            </button>
            {noSrcMsg && (
              <div style={{
                position: 'absolute', top: '-30px', right: '0',
                background: 'rgba(0,0,0,0.75)', color: '#fff',
                padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20,
              }}>
                {noSrcMsg}
              </div>
            )}
          </>
        )}

        {/* ── Connection anchors ─────────────────────────────────────── */}
        {isConnMode && showAnchors && ['top','right','bottom','left'].map(pos => (
          <div
            key={pos}
            onClick={e => { e.stopPropagation(); data.onAnchorClick?.(id, pos, e) }}
            className={[
              'absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full',
              'cursor-pointer hover:bg-blue-600 hover:scale-110 transition z-10',
              'flex items-center justify-center text-white text-xs font-bold',
              pos === 'top'    ? '-top-3 left-1/2 -translate-x-1/2'    : '',
              pos === 'right'  ? '-right-3 top-1/2 -translate-y-1/2'   : '',
              pos === 'bottom' ? '-bottom-3 left-1/2 -translate-x-1/2' : '',
              pos === 'left'   ? '-left-3 top-1/2 -translate-y-1/2'    : '',
            ].join(' ')}
          >+</div>
        ))}

        {/* ── Label ─────────────────────────────────────────────────── */}
        {isEditing && !isReadOnly ? (
          <input
            ref={inputRef}
            type="text"
            value={localLabel}
            onChange={e => setLocalLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={e => { isComposingRef.current = false; setLocalLabel(e.target.value) }}
            className="w-full outline-none bg-transparent text-center"
            style={{ color: nodeStyle.color, fontSize: nodeStyle.fontSize, fontWeight: nodeStyle.fontWeight }}
          />
        ) : (
          <div className="text-center whitespace-pre-wrap break-words" style={{ fontSize: nodeStyle.fontSize, fontWeight: nodeStyle.fontWeight, fontStyle: nodeStyle.fontStyle }}>
            {localLabel || 'Empty'}
          </div>
        )}

        {/* ── React Flow handles ─────────────────────────────────────── */}
        {['target','source'].map(type =>
          ['Top','Right','Bottom','Left'].map(pos => (
            <Handle key={`${type}-${pos}`} type={type} position={Position[pos]}
              id={`${type}-${pos.toLowerCase()}`} className="!opacity-0 !w-1 !h-1" />
          ))
        )}
      </div>

      {/* ── Add child button ──────────────────────────────────────────── */}
      {!isReadOnly && !isConnMode && (
        <button
          onClick={e => { e.stopPropagation(); data.onAddChild?.(id) }}
          className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
          style={{ [addBtnSide]: '-16px', zIndex: 10 }}
          title="Thêm node con (Tab)"
        >
          <PlusCircleIcon className="w-8 h-8 drop-shadow-lg" style={{ color }} />
        </button>
      )}

      {/* ── Free-drag indicator ───────────────────────────────────────── */}
      {!isRoot && !autoAlign && !dragging && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-xs shadow-lg" title="Đã mở khóa (có thể kéo tự do)">
          🔓
        </div>
      )}
    </div>
  )
})

MindMeisterNode.displayName = 'MindMeisterNode'
export default MindMeisterNode