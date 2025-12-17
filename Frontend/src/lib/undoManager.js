//Frontend/src/lib/undoManager.js
import * as Y from 'yjs'

/**
 * Tạo Undo Manager cho Yjs document
 * @param {Y.Doc} ydoc 
 * @param {Object} options
 * @returns {Y.UndoManager}
 */
export function createUndoManager(ydoc, options = {}) {
  const yNodes = ydoc.getMap('nodes')
  const yEdges = ydoc.getArray('edges')
  
  // Tạo UndoManager track cả nodes và edges
  const undoManager = new Y.UndoManager([yNodes, yEdges], {
    trackedOrigins: new Set([null]), // Track tất cả local changes
    captureTimeout: 500, // Gom các thao tác trong 500ms thành 1 undo step
    ...options
  })

  return undoManager
}

/**
 * Hook để bind keyboard shortcuts
 * @param {Y.UndoManager} undoManager 
 */
export function useUndoShortcuts(undoManager) {
  if (!undoManager) return

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      if (undoManager.canUndo()) {
        undoManager.undo()
      }
    }
    
    // Ctrl/Cmd + Shift + Z hoặc Ctrl/Cmd + Y: Redo
    if (
      ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
      ((e.ctrlKey || e.metaKey) && e.key === 'y')
    ) {
      e.preventDefault()
      if (undoManager.canRedo()) {
        undoManager.redo()
      }
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  
  return () => {
    document.removeEventListener('keydown', handleKeyDown)
  }
}