// Frontend/src/components/mindmap/MindMeisterCanvas.jsx
import { useReactFlow } from 'reactflow'
import { useEffect, useState, useCallback, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useAuthStore }    from '../../stores/authStore'
import { useAwareness }    from '../../hooks/useAwareness'
import MindMeisterNode     from './MindMeisterNode'
import CustomEdge          from './CustomEdge'
import FloatingToolbar     from './FloatingToolbar'
import AIAssistantModal    from './AIAssistantModal'
import Cursor              from './Cursor'
import {
  calculateBalancedLayout,
  calculateNewNodePosition,
  getSuggestedSide,
  updateSubtreeSide,
  determineFreeNodeSide,
} from '../../lib/treeLayout'
import { PlusCircleIcon, SparklesIcon } from '@heroicons/react/24/solid'
import { DocumentArrowUpIcon } from '@heroicons/react/24/outline'
import PDFUploadModal from './PDFUploadModal'

// ─── Theme configs (mirrors Backend/utils/templateToYjs.js) ──────────────────
// Used when adding new child nodes so they inherit the parent's visual style.
const THEME_CONFIGS = {
  modern: {
    level1: {
      textColor: '#ffffff', fontSize: '15px', fontWeight: '600',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      borderRadius: '10px', border: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: '10px 18px',
    },
    level2: {
      textColor: '#ffffff', fontSize: '13px', fontWeight: '500',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      borderRadius: '8px', border: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '8px 14px',
    },
    colors:    ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'],
    edgeColor: '#3b82f6',
  },
  sketch: {
    level1: {
      textColor: '#1c1917', fontSize: '16px', fontWeight: '600',
      fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
      borderRadius: '8px 3px 10px 4px', border: '2.5px solid #1c1917',
      boxShadow: '3px 4px 0px #1c1917', padding: '10px 16px', transform: 'rotate(1deg)',
    },
    level2: {
      textColor: '#1c1917', fontSize: '14px', fontWeight: '500',
      fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
      borderRadius: '6px 2px 8px 3px', border: '2px solid #1c1917',
      boxShadow: '2px 3px 0px #1c1917', padding: '7px 12px', transform: 'rotate(-0.5deg)',
    },
    colors:    ['#fbbf24','#86efac','#93c5fd','#f9a8d4','#a5f3fc','#d8b4fe','#fca5a5'],
    edgeColor: '#1c1917',
  },
  neon: {
    level1: {
      textColor: '#ffffff', fontSize: '14px', fontWeight: '500',
      fontFamily: '"Courier New", "Consolas", monospace',
      borderRadius: '4px', border: '1.5px solid #00f5ff',
      boxShadow: '0 0 8px rgba(0,245,255,0.5)', padding: '9px 14px',
      backgroundColor: '#0f172a',
    },
    level2: {
      textColor: '#e2e8f0', fontSize: '12px', fontWeight: '400',
      fontFamily: '"Courier New", "Consolas", monospace',
      borderRadius: '3px', border: '1px solid #00f5ff',
      boxShadow: '0 0 6px rgba(0,245,255,0.3)', padding: '6px 10px',
      backgroundColor: '#1e293b',
    },
    colors:    ['#00f5ff','#39ff14','#ff10f0','#ffd700','#ff6ec7','#bf5fff','#ff4500'],
    edgeColor: '#00f5ff',
  },
  vintage: {
    level1: {
      textColor: '#1c0a00', fontSize: '16px', fontWeight: '600',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
      borderRadius: '3px', border: '2px solid #1c0a00',
      boxShadow: '3px 3px 0px rgba(0,0,0,0.25)', padding: '10px 16px', letterSpacing: '0.03em',
    },
    level2: {
      textColor: '#1c0a00', fontSize: '14px', fontWeight: '500',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
      borderRadius: '2px', border: '1.5px solid #4a2c00',
      boxShadow: '2px 2px 0px rgba(0,0,0,0.2)', padding: '7px 12px', letterSpacing: '0.02em',
    },
    colors:    ['#d4a853','#c17f3a','#a05c1a','#7c3f0a','#b8860b','#cd9b1d','#daa520'],
    edgeColor: '#7c3f0a',
  },
};

const DEFAULT_COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316'];
const USER_COLORS    = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899'];

function getUserColor(userId) {
  const h = userId.split('').reduce((a,c) => a + c.charCodeAt(0), 0);
  return USER_COLORS[h % USER_COLORS.length];
}

/** Return the themeKey stored in any node of this ydoc, or null. */
function detectThemeKey(yNodes) {
  for (const [, v] of yNodes.entries()) {
    if (v.themeKey) return v.themeKey;
  }
  return null;
}

/** Count how many children of parentId exist (to cycle colours). */
function countChildren(parentId, yNodes) {
  let n = 0;
  yNodes.forEach(v => { if (v.parentId === parentId) n++; });
  return n;
}

const nodeTypes = { mindmeister: MindMeisterNode };
const edgeTypes = { custom: CustomEdge };

export default function MindMeisterCanvas({ ydoc, awareness, mindmap, isReadOnly = false }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode,       setSelectedNode]       = useState(null);
  const [toolbarPosition,    setToolbarPosition]    = useState(null);
  const [showAIModal,        setShowAIModal]        = useState(false);
  const [isCreatingConnection, setIsCreatingConnection] = useState(false);
  const [connectionSource,   setConnectionSource]   = useState(null);
  const [tempConnTarget,     setTempConnTarget]     = useState(null);
  const [dragStartPos,       setDragStartPos]       = useState(null);
  const [hiddenEdges,        setHiddenEdges]        = useState(new Set());
  const [showPDFModal, setShowPDFModal] = useState(false)
  const user              = useAuthStore(s => s.user);
  const yNodes            = ydoc.getMap('nodes');
  const yEdges            = ydoc.getArray('edges');
  const yMeta             = ydoc.getMap('metadata');
  const awarenessStates   = useAwareness(awareness);
  const reactFlowInstance = useReactFlow();
  const isEditingRef      = useRef(false);

  // ── Prevent double-init: once we've written or confirmed content, lock it ──
  const initDoneRef = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Awareness
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!awareness || !user) return;
    const uid = user.id || user._id;
    awareness.setLocalStateField('user', { id: uid, name: user.name, email: user.email, color: getUserColor(uid) });
    const t = setInterval(() => awareness.setLocalStateField('lastUpdated', Date.now()), 3000);
    return () => { clearInterval(t); awareness.setLocalState(null); };
  }, [awareness, user]);

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────
  const calculateLevel = useCallback((nodeId) => {
    const node = yNodes.get(nodeId);
    if (!node || !node.parentId) return 0;
    return 1 + calculateLevel(node.parentId);
  }, [yNodes]);

  const applyLayout = useCallback(() => {
    const positions = calculateBalancedLayout(yNodes);
    positions.forEach((pos, id) => {
      const n = yNodes.get(id);
      if (n && n.autoAlign !== false && !n.isFree) {
        yNodes.set(id, { ...n, position: pos });
      }
    });
  }, [yNodes]);

  // ─────────────────────────────────────────────────────────────────────────
  // Add child — inherits theme from parent
  // ─────────────────────────────────────────────────────────────────────────
  const handleAddChild = useCallback((parentId) => {
    if (isReadOnly) return;
    const parent = yNodes.get(parentId);
    if (!parent) return;

    const newId    = `node-${Date.now()}`;
    const level    = calculateLevel(parentId) + 1;
    const isRoot   = parentId === 'root-node';
    const side     = isRoot ? getSuggestedSide(parentId, yNodes) : (parent.side ?? 'right');
    const position = calculateNewNodePosition(parentId, yNodes, side);

    // ── Theme-aware styling ────────────────────────────────────────────────
    const themeKey  = detectThemeKey(yNodes);
    const themeCfg  = themeKey ? THEME_CONFIGS[themeKey] : null;
    const levelKey  = level === 1 ? 'level1' : 'level2';
    const themeStyle = themeCfg ? themeCfg[levelKey] : {};
    const colorPool  = themeCfg ? themeCfg.colors : DEFAULT_COLORS;
    const edgeColor  = themeCfg ? themeCfg.edgeColor : '#3b82f6';

    // Cycle colour based on sibling count
    const siblingCount = countChildren(parentId, yNodes);
    const nodeColor    = colorPool[siblingCount % colorPool.length];

    yNodes.set(newId, {
      label: '',
      position,
      parentId,
      level,
      side,
      autoAlign: true,
      editing:   true,
      // theme props
      themeKey:  themeKey ?? undefined,
      color:     nodeColor,
      ...themeStyle,
      backgroundColor: themeStyle.backgroundColor ?? nodeColor,
    });

    const sh = side === 'right' ? 'source-right' : 'source-left';
    const th = side === 'right' ? 'target-left'  : 'target-right';
    yEdges.push([{
      id:            `e-${parentId}-${newId}`,
      source:        parentId,
      target:        newId,
      sourceHandle:  sh,
      targetHandle:  th,
      color:         edgeColor,
      width:         2,
      style:         'solid',
      isParentChild: true,
    }]);

    setTimeout(() => applyLayout(), 100);
  }, [yNodes, yEdges, calculateLevel, isReadOnly, applyLayout]);

  // ─────────────────────────────────────────────────────────────────────────
  // Free node
  // ─────────────────────────────────────────────────────────────────────────
  const handleAddFreeNode = useCallback(() => {
    if (isReadOnly) return;
    const pos  = reactFlowInstance.project({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const root = yNodes.get('root-node');
    const side = determineFreeNodeSide(pos.x, root?.position?.x ?? 600);
    yNodes.set(`node-${Date.now()}`, {
      label: 'Free Node', position: pos,
      parentId: null, level: 1, color: '#64748b', side,
      autoAlign: false, isFree: true,
    });
  }, [reactFlowInstance, yNodes, isReadOnly]);

  const handleToggleAutoAlign = useCallback((nodeId) => {
    const n = yNodes.get(nodeId);
    if (n && nodeId !== 'root-node') {
      yNodes.set(nodeId, { ...n, autoAlign: !n.autoAlign });
      if (!n.autoAlign) setTimeout(() => applyLayout(), 100);
    }
  }, [yNodes, applyLayout]);

  // ─────────────────────────────────────────────────────────────────────────
  // Connection mode
  // ─────────────────────────────────────────────────────────────────────────
  const cancelConn = useCallback(() => {
    setIsCreatingConnection(false);
    setConnectionSource(null);
    setTempConnTarget(null);
  }, []);

  const handleStartConn = useCallback(() => {
    if (isReadOnly) return;
    setIsCreatingConnection(true);
    setToolbarPosition(null);
  }, [isReadOnly]);

  const handleAnchorClick = useCallback((nodeId, anchor, event) => {
    if (!isCreatingConnection) return;
    if (!connectionSource) {
      const el   = event.target.closest('.react-flow__node');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pts  = {
        top:    { x: rect.left + rect.width / 2, y: rect.top },
        right:  { x: rect.right,  y: rect.top + rect.height / 2 },
        bottom: { x: rect.left + rect.width / 2, y: rect.bottom },
        left:   { x: rect.left,   y: rect.top + rect.height / 2 },
      };
      setConnectionSource({ nodeId, anchor, ...pts[anchor] });
    } else {
      if (connectionSource.nodeId === nodeId) { cancelConn(); return; }
      const themeKey  = detectThemeKey(yNodes);
      const edgeColor = themeKey ? (THEME_CONFIGS[themeKey]?.edgeColor ?? '#3b82f6') : '#3b82f6';
      yEdges.push([{
        id:            `custom-${Date.now()}`,
        source:        connectionSource.nodeId,
        target:        nodeId,
        sourceHandle:  `source-${connectionSource.anchor}`,
        targetHandle:  `target-${anchor}`,
        color:         edgeColor,
        width:         2,
        style:         'solid',
        isParentChild: false,
        curvature:     0.25,
      }]);
      cancelConn();
    }
  }, [isCreatingConnection, connectionSource, yEdges, yNodes, cancelConn]);

  const handleUpdateEdge = useCallback((edgeId, updates) => {
    if (isReadOnly) return;
    const arr = yEdges.toArray();
    const idx = arr.findIndex(e => e.id === edgeId);
    if (idx !== -1 && !arr[idx].isParentChild) {
      yEdges.delete(idx, 1);
      yEdges.insert(idx, [{ ...arr[idx], ...updates }]);
    }
  }, [yEdges, isReadOnly]);

  const handleDeleteEdge = useCallback((edgeId) => {
    if (isReadOnly) return;
    const arr = yEdges.toArray();
    const idx = arr.findIndex(e => e.id === edgeId);
    if (idx !== -1) {
      if (arr[idx].isParentChild) { alert('Cannot delete parent-child edge'); return; }
      yEdges.delete(idx, 1);
    }
  }, [yEdges, isReadOnly]);

  const handleReparent = useCallback((dragId, newParentId) => {
    if (isReadOnly) return;
    const dragData  = yNodes.get(dragId);
    const newParent = yNodes.get(newParentId);
    if (!dragData || !newParent || dragId === newParentId) return;

    let cur = newParentId;
    while (cur) {
      if (cur === dragId) { alert('Cannot create cycle'); return; }
      cur = yNodes.get(cur)?.parentId;
    }

    const arr = yEdges.toArray();
    const oldIdx = arr.findIndex(e => e.isParentChild && e.target === dragId);
    if (oldIdx !== -1) yEdges.delete(oldIdx, 1);

    const newSide = !newParent.parentId
      ? getSuggestedSide(newParentId, yNodes)
      : (newParent.side ?? 'right');

    updateSubtreeSide(dragId, newSide, yNodes, yEdges);
    yNodes.set(dragId, { ...dragData, parentId: newParentId, side: newSide, color: newParent.color, autoAlign: true });

    const themeKey  = detectThemeKey(yNodes);
    const edgeColor = themeKey ? (THEME_CONFIGS[themeKey]?.edgeColor ?? newParent.color) : newParent.color;

    yEdges.push([{
      id:            `e-${newParentId}-${dragId}`,
      source:        newParentId,
      target:        dragId,
      sourceHandle:  newSide === 'right' ? 'source-right' : 'source-left',
      targetHandle:  newSide === 'right' ? 'target-left'  : 'target-right',
      color:         edgeColor,
      isParentChild: true,
    }]);
    setTimeout(() => applyLayout(), 100);
  }, [yNodes, yEdges, isReadOnly, applyLayout]);

  // ─────────────────────────────────────────────────────────────────────────
  // Sync Yjs → React Flow
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sync = () => {
      const nd = [];
      yNodes.forEach((v, k) => {
        nd.push({
          id:       k,
          type:     'mindmeister',
          position: v.position || { x: 0, y: 0 },
          data: {
            ...v,
            level:     calculateLevel(k),
            yNodes,
            isReadOnly,
            isRoot:    v.isRoot || k === 'root-node',
            autoAlign: v.autoAlign !== false,
            isCreatingConnection,
            onAddChild:        handleAddChild,
            onToggleAutoAlign: handleToggleAutoAlign,
            onAnchorClick:     handleAnchorClick,
            onEditingChange:   (e) => { isEditingRef.current = e; },
          },
          draggable: !isReadOnly && k !== 'root-node',
        });
      });
      setNodes(nd);

      const ed = yEdges.toArray()
        .filter(e => !hiddenEdges.has(e.id))
        .map(e => ({
          id:           e.id,
          source:       e.source,
          target:       e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type:         'custom',
          data: {
            color:        e.color || '#3b82f6',
            width:        e.width || 2,
            style:        e.style || 'solid',
            isParentChild: e.isParentChild || false,
            curvature:    e.curvature || 0.25,
            onUpdateEdge: handleUpdateEdge,
            onDeleteEdge: handleDeleteEdge,
          },
        }));
      setEdges(ed);
    };

    sync();
    yNodes.observe(sync);
    yEdges.observe(sync);
    return () => { yNodes.unobserve(sync); yEdges.unobserve(sync); };
  }, [
    yNodes, yEdges, calculateLevel, handleAddChild, handleToggleAutoAlign,
    handleAnchorClick, handleUpdateEdge, handleDeleteEdge,
    isReadOnly, isCreatingConnection, hiddenEdges,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Root-node init — only write blank root if doc is truly empty
  // Guarded by initDoneRef so WS re-sync never re-triggers this.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isReadOnly) return;

    // Wait 1 s for WebSocket initial sync to arrive
    const timer = setTimeout(() => {
      if (initDoneRef.current) return;          // already done
      if (yMeta.get('isTemplate')) {            // template loaded → skip
        initDoneRef.current = true;
        return;
      }
      if (yNodes.size > 0) {                    // content exists → skip
        initDoneRef.current = true;
        return;
      }
      // Truly blank new mindmap
      console.log('📝 Writing blank root-node');
      initDoneRef.current = true;
      yNodes.set('root-node', {
        label:     mindmap.title || 'Main Topic',
        position:  { x: 600, y: 400 },
        color:     '#3b82f6',
        level:     0,
        parentId:  null,
        side:      null,
        autoAlign: true,
        isRoot:    true,
      });
    }, 1000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // run once on mount

  // ─────────────────────────────────────────────────────────────────────────
  // After template snapshot arrives → run layout ONCE
  // ─────────────────────────────────────────────────────────────────────────
  const layoutDoneRef = useRef(false);

  useEffect(() => {
    const check = () => {
      if (layoutDoneRef.current) return;
      if (yMeta.get('isTemplate') && yNodes.size > 1) {
        layoutDoneRef.current = true;
        initDoneRef.current   = true;
        console.log('🎨 Template detected → running layout');
        setTimeout(() => applyLayout(), 300);
      }
    };
    yMeta.observe(check);
    check();
    return () => yMeta.unobserve(check);
  }, [yMeta, yNodes, applyLayout]);

  // ─────────────────────────────────────────────────────────────────────────
  // Node click / drag
  // ─────────────────────────────────────────────────────────────────────────
  const onNodeClick = useCallback((event, node) => {
    if (isReadOnly || isCreatingConnection) return;
    setSelectedNode(node);
    const el = event.target.closest('.react-flow__node');
    if (el) {
      const r = el.getBoundingClientRect();
      setToolbarPosition({ x: r.left + r.width / 2, y: r.top });
    }
  }, [isReadOnly, isCreatingConnection]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setToolbarPosition(null);
    if (isCreatingConnection) cancelConn();
  }, [isCreatingConnection, cancelConn]);

  const onNodeDragStart = useCallback((_, node) => {
    if (isReadOnly) return;
    setDragStartPos(yNodes.get(node.id)?.position);
    const connected = yEdges.toArray().filter(e => e.source === node.id || e.target === node.id).map(e => e.id);
    setHiddenEdges(new Set(connected));
  }, [yNodes, yEdges, isReadOnly]);

  const onNodeDragStop = useCallback((_, node) => {
    if (isReadOnly) return;
    const nd = yNodes.get(node.id);
    if (!nd) return;

    const drop = nodes.find(n => {
      if (n.id === node.id || n.id === 'root-node') return false;
      const dx = n.position.x - node.position.x;
      const dy = n.position.y - node.position.y;
      return Math.sqrt(dx*dx + dy*dy) < 50;
    });

    if (drop) {
      handleReparent(node.id, drop.id);
    } else if (nd.autoAlign) {
      yNodes.set(node.id, { ...nd, position: dragStartPos });
      setTimeout(() => applyLayout(), 100);
    } else {
      const root    = yNodes.get('root-node');
      const newSide = determineFreeNodeSide(node.position.x, root?.position?.x ?? 600);
      yNodes.set(node.id, { ...nd, position: node.position, side: newSide });
    }
    setHiddenEdges(new Set());
    setDragStartPos(null);
  }, [yNodes, yEdges, nodes, isReadOnly, handleReparent, applyLayout, dragStartPos]);

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isReadOnly) return;
    const onKey = (e) => {
      if (isEditingRef.current) return;
      if (e.key === 'Escape' && isCreatingConnection) { cancelConn(); return; }
      if (!selectedNode) return;
      if (e.key === 'Tab') { e.preventDefault(); handleAddChild(selectedNode.id); }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const p = yNodes.get(selectedNode.id)?.parentId;
        if (p) handleAddChild(p);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode.id !== 'root-node') {
        e.preventDefault();
        const del = (id) => {
          yNodes.forEach((_, k) => { if (yNodes.get(k)?.parentId === id) del(k); });
          yNodes.delete(id);
        };
        del(selectedNode.id);
        setSelectedNode(null);
        setToolbarPosition(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedNode, handleAddChild, yNodes, isReadOnly, isCreatingConnection, cancelConn]);

  const handleAIClick = () => {
    setSelectedNode(null); setToolbarPosition(null);
    setIsCreatingConnection(false); setConnectionSource(null); setTempConnTarget(null);
    setShowAIModal(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  const safeOnNodesChange = useCallback((changes) => {
      // Chặn bất kỳ thay đổi nào xóa root-node
      const safe = changes.filter(c => !(c.type === 'remove' && c.id === 'root-node'))
      onNodesChange(safe)
    }, [onNodesChange])
  return (
    <div
      className="w-full h-full relative bg-gradient-to-br from-gray-50 to-gray-100"
      onMouseMove={(e) => { if (isCreatingConnection && connectionSource) setTempConnTarget({ x: e.clientX, y: e.clientY }); }}
    >
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={isReadOnly ? undefined : safeOnNodesChange}
        onEdgesChange={isReadOnly ? undefined : onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={isReadOnly ? undefined : onNodeDragStart}
        onNodeDragStop={isReadOnly ? undefined : onNodeDragStop}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        nodesDraggable={!isReadOnly} nodesConnectable={false}
        fitView minZoom={0.2} maxZoom={2}
      >
        <Background color="#e5e7eb" gap={20} size={1} />
        <Controls />
        <MiniMap nodeColor={n => n.data.color || '#3b82f6'} />
      </ReactFlow>

      {selectedNode && toolbarPosition && !isReadOnly && !isCreatingConnection && (
        <FloatingToolbar
          selectedNode={selectedNode} position={toolbarPosition}
          yNodes={yNodes} yEdges={yEdges}
          onToggleAutoAlign={() => handleToggleAutoAlign(selectedNode.id)}
          onStartConnection={handleStartConn}
          isCreatingConnection={isCreatingConnection}
          mindmapId={mindmap._id}
        />
      )}

      {!isReadOnly && (
        <div className="absolute top-4 left-4 flex flex-col space-y-2 z-10">
          <button onClick={handleAddFreeNode}
            className="bg-white rounded-lg shadow-lg px-3 py-2 hover:shadow-xl transition flex items-center space-x-2">
            <PlusCircleIcon className="w-5 h-5 text-gray-700" />
            <span className="text-sm font-medium">Free Node</span>
          </button>
          <button
            onClick={() => setShowPDFModal(true)}
            className="bg-white rounded-lg shadow-lg px-3 py-2 hover:shadow-xl transition flex items-center space-x-2"
          >
            <DocumentArrowUpIcon className="w-5 h-5 text-gray-700" />
            <span className="text-sm font-medium">From PDF</span>
          </button>
          <button onClick={handleAIClick}
            className="bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg shadow-lg px-3 py-2 hover:shadow-xl transition flex items-center space-x-2">
            <SparklesIcon className="w-5 h-5" />
            <span className="text-sm font-medium">AI Assistant</span>
          </button>
        </div>
      )}

      {awarenessStates.length > 0 && (
        <>
          {awarenessStates.map(s => s.cursor && (
            <Cursor key={s.clientId} user={s.user} position={s.cursor} color={s.user?.color || '#3b82f6'} />
          ))}
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg px-3 py-2 text-sm">
            <div className="flex items-center space-x-2">
              <div className="flex -space-x-2">
                {awarenessStates.slice(0, 3).map(s => (
                  <div key={s.clientId}
                    className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: s.user?.color || '#3b82f6' }}>
                    {(s.user?.name || s.user?.email || '?')[0].toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-gray-600">{awarenessStates.length} online</span>
            </div>
          </div>
        </>
      )}

      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg px-4 py-3 text-xs text-gray-600 space-y-1">
        {isReadOnly ? <p>👁️ View-only mode</p>
         : isCreatingConnection ? (<><p>🔗 <strong>Connection Mode</strong></p><p><kbd>ESC</kbd> Cancel</p></>)
         : (<><p><kbd>Tab</kbd> Add child · <kbd>Enter</kbd> Sibling</p><p><kbd>Del</kbd> Delete · drag to reparent</p></>)}
      </div>

      {isCreatingConnection && connectionSource && tempConnTarget && (
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
          <defs>
            <marker id="prev-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
            </marker>
          </defs>
          <path d={`M ${connectionSource.x},${connectionSource.y} Q ${(connectionSource.x+tempConnTarget.x)/2},${(connectionSource.y+tempConnTarget.y)/2} ${tempConnTarget.x},${tempConnTarget.y}`}
            stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" fill="none" markerEnd="url(#prev-arrow)" />
        </svg>
      )}

      {showAIModal && (
        <AIAssistantModal mindmap={mindmap} yNodes={yNodes} yEdges={yEdges} onClose={() => setShowAIModal(false)} />
      )}

      {showPDFModal && (
        <PDFUploadModal
          mindmap={mindmap}
          yNodes={yNodes}
          yEdges={yEdges}
          onClose={() => setShowPDFModal(false)}
        />
      )}
    </div>
  );
}