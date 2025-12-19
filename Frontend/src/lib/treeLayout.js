// Frontend/src/lib/treeLayout.js - UPDATED WITH TREE MODE FIX

const LEVEL_X_SPACING = 250
const MIN_Y_SPACING = 80
const NODE_HEIGHT = 50

/**
 * Calculate layout using subtree height algorithm
 */
export function calculateTreeLayout(yNodes, mode = 'balanced') {
  const tree = buildTree(yNodes)
  const positions = new Map()
  
  const ROOT_X = 600
  const ROOT_Y = 400
  
  // Find roots
  const roots = tree.filter(n => !n.parentId)
  
  roots.forEach((root, idx) => {
    const rootY = ROOT_Y + (idx * 600)
    
    // Position root
    positions.set(root.id, { x: ROOT_X, y: rootY })
    
    // 🔥 IMPORTANT: When switching to tree mode, update all children's side to 'right'
    if (mode === 'tree') {
      updateSidesToRight(root.id, yNodes)
    }
    
    if (mode === 'balanced') {
      layoutBalancedSubtree(root, tree, ROOT_X, rootY, positions, 1)
    } else {
      layoutTreeSubtree(root, tree, ROOT_X, rootY, positions, 1)
    }
  })
  
  return positions
}

/**
 * 🔥 NEW: Update all descendants to side='right' for tree mode
 */
function updateSidesToRight(nodeId, yNodes) {
  yNodes.forEach((value, key) => {
    if (value.parentId === nodeId) {
      // Update this node
      yNodes.set(key, {
        ...value,
        side: 'right'
      })
      
      // Recursively update children
      updateSidesToRight(key, yNodes)
    }
  })
}

/**
 * Build tree with metadata
 */
function buildTree(yNodes) {
  const nodes = []
  
  yNodes.forEach((value, key) => {
    nodes.push({
      id: key,
      parentId: value.parentId || null,
      label: value.label,
      side: value.side || null,
    })
  })
  
  return nodes
}

/**
 * Calculate subtree height
 */
function calculateSubtreeHeight(nodeId, tree) {
  const children = tree.filter(n => n.parentId === nodeId)
  
  if (children.length === 0) {
    return NODE_HEIGHT
  }
  
  const totalHeight = children.reduce((sum, child) => {
    return sum + calculateSubtreeHeight(child.id, tree)
  }, 0)
  
  const spacing = (children.length - 1) * MIN_Y_SPACING
  
  return totalHeight + spacing
}

/**
 * Layout balanced tree (left/right)
 */
function layoutBalancedSubtree(parent, tree, parentX, parentY, positions, level) {
  const children = tree.filter(n => n.parentId === parent.id)
  if (children.length === 0) return
  
  // Group by side
  const leftChildren = []
  const rightChildren = []
  
  children.forEach(child => {
    if (child.side === 'left') {
      leftChildren.push(child)
    } else if (child.side === 'right') {
      rightChildren.push(child)
    } else {
      // Auto-balance
      if (leftChildren.length <= rightChildren.length) {
        leftChildren.push(child)
        child.side = 'left'
      } else {
        rightChildren.push(child)
        child.side = 'right'
      }
    }
  })
  
  // Layout left side
  if (leftChildren.length > 0) {
    layoutSideBySubtree(leftChildren, parentX, parentY, 'left', tree, positions, level)
  }
  
  // Layout right side
  if (rightChildren.length > 0) {
    layoutSideBySubtree(rightChildren, parentX, parentY, 'right', tree, positions, level)
  }
}

/**
 * Layout siblings by subtree height
 */
function layoutSideBySubtree(siblings, parentX, parentY, side, tree, positions, level) {
  const direction = side === 'left' ? -1 : 1
  const x = parentX + (direction * LEVEL_X_SPACING)
  
  const siblingsWithHeight = siblings.map(s => ({
    node: s,
    height: calculateSubtreeHeight(s.id, tree)
  }))
  
  const totalHeight = siblingsWithHeight.reduce((sum, item) => sum + item.height, 0)
  const totalSpacing = (siblings.length - 1) * MIN_Y_SPACING
  const fullHeight = totalHeight + totalSpacing
  
  let currentY = parentY - (fullHeight / 2)
  
  siblingsWithHeight.forEach(item => {
    const centerY = currentY + (item.height / 2)
    
    positions.set(item.node.id, { x, y: centerY })
    
    const grandchildren = tree.filter(n => n.parentId === item.node.id)
    if (grandchildren.length > 0) {
      layoutBalancedSubtree(item.node, tree, x, centerY, positions, level + 1)
    }
    
    currentY += item.height + MIN_Y_SPACING
  })
}

/**
 * Tree mode (all right)
 */
function layoutTreeSubtree(parent, tree, parentX, parentY, positions, level) {
  const children = tree.filter(n => n.parentId === parent.id)
  if (children.length === 0) return
  
  const x = parentX + LEVEL_X_SPACING
  
  const childrenWithHeight = children.map(c => ({
    node: c,
    height: calculateSubtreeHeight(c.id, tree)
  }))
  
  const totalHeight = childrenWithHeight.reduce((sum, item) => sum + item.height, 0)
  const totalSpacing = (children.length - 1) * MIN_Y_SPACING
  const fullHeight = totalHeight + totalSpacing
  
  let currentY = parentY - (fullHeight / 2)
  
  childrenWithHeight.forEach(item => {
    const centerY = currentY + (item.height / 2)
    
    positions.set(item.node.id, { x, y: centerY })
    
    const grandchildren = tree.filter(n => n.parentId === item.node.id)
    if (grandchildren.length > 0) {
      layoutTreeSubtree(item.node, tree, x, centerY, positions, level + 1)
    }
    
    currentY += item.height + MIN_Y_SPACING
  })
}

/**
 * Calculate new node position
 */
export function calculateNewNodePosition(parentId, yNodes) {
  const parent = yNodes.get(parentId)
  if (!parent?.position) return { x: 0, y: 0 }
  
  const side = getSuggestedSide(parentId, yNodes)
  const direction = side === 'left' ? -1 : 1
  
  let siblingCount = 0
  yNodes.forEach(v => {
    if (v.parentId === parentId) siblingCount++
  })
  
  return {
    x: parent.position.x + (direction * LEVEL_X_SPACING),
    y: parent.position.y + (siblingCount * 40)
  }
}

/**
 * Auto-balance side
 */
export function getSuggestedSide(parentId, yNodes) {
  const parent = yNodes.get(parentId)
  if (!parent) return 'right'
  
  if (!parent.parentId) {
    let leftCount = 0
    let rightCount = 0
    
    yNodes.forEach(v => {
      if (v.parentId === parentId) {
        if (v.side === 'left') leftCount++
        else if (v.side === 'right') rightCount++
      }
    })
    
    return leftCount <= rightCount ? 'left' : 'right'
  }
  
  return parent.side || 'right'
}