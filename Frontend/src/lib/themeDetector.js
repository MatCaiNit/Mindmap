// Frontend/src/lib/themeDetector.js
// Utility to detect and apply theme from existing mindmap nodes
import { MINDMAP_THEMES } from "../data/mindmapThemes";
/**
 * Detect theme from any existing node in the mindmap
 * @param {Y.Map} yNodes - Yjs nodes map
 * @returns {Object|null} Theme configuration or null if no theme found
 */
export function detectTheme(yNodes) {
  if (!yNodes || yNodes.size === 0) return null;
  
  // Search for any node with themeMetadata
  for (const [nodeId, nodeData] of yNodes.entries()) {
    if (nodeData.themeMetadata) {
      console.log(' Theme detected from node:', nodeId);
      console.log('   Theme:', nodeData.themeMetadata.themeName || 'Unknown');
      return MINDMAP_THEMES[nodeData.themeMetadata.themeId] || null;
    }
  }
  
  console.log('  No theme found in existing nodes');
  return null;
}

/**
 * Calculate node level by traversing parent chain
 * @param {string} nodeId - Target node ID
 * @param {Y.Map} yNodes - Yjs nodes map
 * @returns {number} Node level (0 = root, 1 = level1, 2+ = level2)
 */
export function calculateNodeLevel(nodeId, yNodes) {
  if (!nodeId || !yNodes) return 0;
  
  let currentId = nodeId;
  let level = 0;
  const visited = new Set();
  
  // Traverse up the parent chain
  while (currentId && level < 10) { // Max 10 levels to prevent infinite loop
    if (visited.has(currentId)) break; // Circular reference protection
    visited.add(currentId);
    
    const node = yNodes.get(currentId);
    if (!node || !node.parentId) break; // Reached root or invalid node
    
    currentId = node.parentId;
    level++;
  }
  
  return level;
}

/**
 * Get theme style for a specific level
 * @param {Object} theme - Theme configuration object
 * @param {number} level - Node level
 * @returns {Object} Style properties for the level
 */
export function getThemeStyleForLevel(theme, level) {
  if (!theme) return {};
  
  // Determine which level key to use
  const levelKey = level === 0 ? 'root' : level === 1 ? 'level1' : 'level2';
  const levelStyle = theme[levelKey] || {};
  
  return {
    fontSize: levelStyle.fontSize,
    fontWeight: levelStyle.fontWeight,
    fontFamily: levelStyle.fontFamily,
    borderRadius: levelStyle.borderRadius,
    border: levelStyle.border,
    boxShadow: levelStyle.boxShadow,
    padding: levelStyle.padding,
    textColor: levelStyle.textColor,
    letterSpacing: levelStyle.letterSpacing,
    transform: levelStyle.transform,
    filter: levelStyle.filter,
    background: levelStyle.background,
  };
}

/**
 * Count siblings to determine color index
 * @param {string} nodeId - New node ID
 * @param {string} parentId - Parent node ID
 * @param {Y.Map} yNodes - Yjs nodes map
 * @returns {number} Sibling index for color cycling
 */
export function countSiblings(nodeId, parentId, yNodes) {
  if (!parentId || !yNodes) return 0;
  
  let siblingCount = 0;
  
  yNodes.forEach((value, key) => {
    if (key !== nodeId && value.parentId === parentId) {
      siblingCount++;
    }
  });
  
  return siblingCount;
}

/**
 * Apply theme to a new node based on parent and existing theme
 * @param {string} nodeId - New node ID
 * @param {string} parentId - Parent node ID
 * @param {Y.Map} yNodes - Yjs nodes map
 * @returns {Object} Theme properties to apply to new node
 */
export function applyThemeToNode(nodeId, parentId, yNodes) {
  // 1. Detect theme from existing nodes
  const themeId = detectTheme(yNodes);

  const existingNode = yNodes.get(nodeId);

    if (existingNode?.themeMetadata?.themeId === theme.id) {
    return {}; //  ĐÃ APPLY → KHÔNG APPLY LẠI
    }

    if (!themeId) {
    console.log('  No theme detected, using default styling');
    return {};
    }

    const theme = MINDMAP_THEMES[themeId];

    if (!theme) {
    console.warn(' Theme not found in registry:', themeId);
    return {};
    }
  
  // 2. Calculate level for new node
  const level = parentId ? calculateNodeLevel(parentId, yNodes) + 1 : 0;
  
  console.log(' Applying theme to new node:');
  console.log('   Node ID:', nodeId);
  console.log('   Level:', level);
  console.log('   Theme:', theme.id);
  
  // 3. Get style for this level
  const levelStyle = getThemeStyleForLevel(theme, level);
  
  // 4. Select color from theme colors (cycle through colors)
  const siblingIndex = countSiblings(nodeId, parentId, yNodes);
  const colors = theme.colors || ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
  const colorIndex = siblingIndex % colors.length;
  const backgroundColor = colors[colorIndex];
  
  console.log('   Color index:', colorIndex, '→', backgroundColor);
  
  // 5. Return complete theme object
  return {
    ...levelStyle,
    backgroundColor: levelStyle.background || backgroundColor,
    color: levelStyle.textColor,
    themeMetadata: {
        themeId: theme.id,       
        themeName: theme.name,   
    },
  };
}