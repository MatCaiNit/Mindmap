// Backend/utils/templateToYjs.js  (ESM)
import * as Y from 'yjs';

/**
 * 4 truly distinct themes.
 * Every property here maps 1-to-1 with what MindMeisterNode.jsx reads.
 */
export const THEME_CONFIGS = {
  // ── MODERN ────────────────────────────────────────────────────────────────
  modern: {
    root: {
      backgroundColor: '#1e40af',
      textColor: '#ffffff',
      fontSize: '20px',
      fontWeight: '700',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      borderRadius: '14px',
      border: '2px solid rgba(255,255,255,0.15)',
      boxShadow: '0 8px 24px rgba(30,64,175,0.35)',
      padding: '16px 28px',
    },
    level1: {
      textColor: '#ffffff',
      fontSize: '15px',
      fontWeight: '600',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      borderRadius: '10px',
      border: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
      padding: '10px 18px',
    },
    level2: {
      textColor: '#ffffff',
      fontSize: '13px',
      fontWeight: '500',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      borderRadius: '8px',
      border: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      padding: '8px 14px',
    },
    rootColor: '#1e40af',
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'],
    edgeColor: '#3b82f6',
  },

  // ── SKETCH ────────────────────────────────────────────────────────────────
  sketch: {
    root: {
      backgroundColor: '#fef08a',
      textColor: '#1c1917',
      fontSize: '21px',
      fontWeight: '700',
      fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
      borderRadius: '12px 4px 14px 6px',
      border: '3px solid #1c1917',
      boxShadow: '4px 5px 0px #1c1917',
      padding: '14px 22px',
      transform: 'rotate(-1.5deg)',
    },
    level1: {
      textColor: '#1c1917',
      fontSize: '16px',
      fontWeight: '600',
      fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
      borderRadius: '8px 3px 10px 4px',
      border: '2.5px solid #1c1917',
      boxShadow: '3px 4px 0px #1c1917',
      padding: '10px 16px',
      transform: 'rotate(1deg)',
    },
    level2: {
      textColor: '#1c1917',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
      borderRadius: '6px 2px 8px 3px',
      border: '2px solid #1c1917',
      boxShadow: '2px 3px 0px #1c1917',
      padding: '7px 12px',
      transform: 'rotate(-0.5deg)',
    },
    rootColor: '#fbbf24',
    colors: ['#fbbf24', '#86efac', '#93c5fd', '#f9a8d4', '#a5f3fc', '#d8b4fe', '#fca5a5'],
    edgeColor: '#1c1917',
  },

  // ── NEON ──────────────────────────────────────────────────────────────────
  neon: {
    root: {
      backgroundColor: '#0f172a',
      textColor: '#00f5ff',
      fontSize: '19px',
      fontWeight: '700',
      fontFamily: '"Courier New", "Consolas", monospace',
      borderRadius: '6px',
      border: '2px solid #00f5ff',
      boxShadow: '0 0 12px rgba(0,245,255,0.7), 0 0 30px rgba(0,245,255,0.25)',
      padding: '14px 22px',
    },
    level1: {
      textColor: '#ffffff',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: '"Courier New", "Consolas", monospace',
      borderRadius: '4px',
      border: '1.5px solid #00f5ff',
      boxShadow: '0 0 8px rgba(0,245,255,0.5)',
      padding: '9px 14px',
      backgroundColor: '#0f172a',
    },
    level2: {
      textColor: '#e2e8f0',
      fontSize: '12px',
      fontWeight: '400',
      fontFamily: '"Courier New", "Consolas", monospace',
      borderRadius: '3px',
      border: '1px solid #00f5ff',
      boxShadow: '0 0 6px rgba(0,245,255,0.3)',
      padding: '6px 10px',
      backgroundColor: '#1e293b',
    },
    rootColor: '#0f172a',
    colors: ['#00f5ff', '#39ff14', '#ff10f0', '#ffd700', '#ff6ec7', '#bf5fff', '#ff4500'],
    edgeColor: '#00f5ff',
  },

  // ── VINTAGE ───────────────────────────────────────────────────────────────
  vintage: {
    root: {
      backgroundColor: '#d4a853',
      textColor: '#1c0a00',
      fontSize: '21px',
      fontWeight: '700',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
      borderRadius: '4px',
      border: '3px double #1c0a00',
      boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
      padding: '16px 24px',
      letterSpacing: '0.04em',
    },
    level1: {
      textColor: '#1c0a00',
      fontSize: '16px',
      fontWeight: '600',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
      borderRadius: '3px',
      border: '2px solid #1c0a00',
      boxShadow: '3px 3px 0px rgba(0,0,0,0.25)',
      padding: '10px 16px',
      letterSpacing: '0.03em',
    },
    level2: {
      textColor: '#1c0a00',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
      borderRadius: '2px',
      border: '1.5px solid #4a2c00',
      boxShadow: '2px 2px 0px rgba(0,0,0,0.2)',
      padding: '7px 12px',
      letterSpacing: '0.02em',
    },
    rootColor: '#d4a853',
    colors: ['#d4a853', '#c17f3a', '#a05c1a', '#7c3f0a', '#b8860b', '#cd9b1d', '#daa520'],
    edgeColor: '#7c3f0a',
  },
};

/**
 * Build a Y.Doc from a template and return it as a Buffer.
 * Edges are stored in a Y.Array (matching the canvas) NOT a Y.Map.
 */
export function applyTemplateToYDoc(template) {
  if (!template?.structure) return null;

  const ydoc   = new Y.Doc();
  const yNodes = ydoc.getMap('nodes');
  const yEdges = ydoc.getArray('edges');   // ← ARRAY, same as canvas
  const yMeta  = ydoc.getMap('metadata');

  const themeKey = (template.theme && THEME_CONFIGS[template.theme])
    ? template.theme
    : 'modern';
  const theme = THEME_CONFIGS[themeKey];

  console.log(`🎨 applyTemplateToYDoc — theme="${themeKey}" template="${template.name}"`);

  // Metadata — canvas reads this to avoid re-initialising with a blank root
  yMeta.set('isTemplate',   true);
  yMeta.set('templateId',   template.id);
  yMeta.set('templateName', template.name);
  yMeta.set('theme',        themeKey);
  yMeta.set('createdAt',    new Date().toISOString());

  // Root node
  yNodes.set('root-node', {
    label:    template.structure.text ?? template.name,
    position: { x: 600, y: 400 },
    parentId: null,
    side:     null,
    level:    0,
    autoAlign: true,
    isRoot:   true,
    color:    theme.rootColor,
    themeKey,
    ...theme.root,
    backgroundColor: theme.rootColor,
  });

  // Children
  if (Array.isArray(template.structure.children)) {
    processChildren(
      template.structure.children,
      'root-node',
      yNodes,
      yEdges,
      theme,
      themeKey,
      1,
    );
  }

  const update = Y.encodeStateAsUpdate(ydoc);
  console.log(`✅ Encoded ${update.byteLength} bytes | ${yNodes.size} nodes | ${yEdges.length} edges`);
  return Buffer.from(update);
}

function processChildren(children, parentId, yNodes, yEdges, theme, themeKey, level) {
  children.forEach((child, index) => {
    // Unique, deterministic id
    const nodeId   = `tmpl-${parentId}-${index}`;
    const levelKey = level === 1 ? 'level1' : 'level2';
    const style    = theme[levelKey];
    const nodeColor = theme.colors[index % theme.colors.length];

    // Side: alternate left / right for first-level children of root
    const side = (level === 1)
      ? (index % 2 === 0 ? 'right' : 'left')
      : (yNodes.get(parentId)?.side ?? 'right');

    yNodes.set(nodeId, {
      label:    child.text ?? '',
      position: { x: 0, y: 0 },
      parentId,
      side,
      level,
      autoAlign: true,
      color:    nodeColor,
      themeKey,
      ...style,
      backgroundColor: style.backgroundColor ?? nodeColor,
    });

    const sourceHandle = side === 'right' ? 'source-right' : 'source-left';
    const targetHandle = side === 'right' ? 'target-left'  : 'target-right';

    // Push to Y.Array (NOT Y.Map)
    yEdges.push([{
      id:           `e-${parentId}-${nodeId}`,
      source:       parentId,
      target:       nodeId,
      sourceHandle,
      targetHandle,
      color:        theme.edgeColor,
      width:        2,
      style:        'solid',
      isParentChild: true,
    }]);

    if (Array.isArray(child.children) && child.children.length > 0) {
      processChildren(child.children, nodeId, yNodes, yEdges, theme, themeKey, level + 1);
    }
  });
}