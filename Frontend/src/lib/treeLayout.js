// Frontend/src/lib/treeLayout.js

const MIN_Y_SPACING = 80
const NODE_HEIGHT = 60
const HORIZONTAL_GAP = 70 
export function estimateNodeWidth(label = '') {
  const textLen = label ? label.length : 0
  const estimated = 40 + (textLen * 8)
  const MIN_WIDTH = 120
  const MAX_WIDTH = 350 
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, estimated))
}

/**
 * Calculate subtree height recursively
 */
function calculateSubtreeHeight(nodeId, tree) {
  const children = tree.filter(n => n.parentId === nodeId)

  if (children.length === 0) {
    return NODE_HEIGHT
  }

  const childrenHeight = children.reduce((sum, child) => {
    return sum + calculateSubtreeHeight(child.id, tree)
  }, 0)

  const childrenSpacing = (children.length - 1) * MIN_Y_SPACING

  return Math.max(NODE_HEIGHT, childrenHeight + childrenSpacing)
}

/**
 * Calculate balanced layout
 */
export function calculateBalancedLayout(yNodes) {
  const tree = buildTree(yNodes)
  const positions = new Map()
  
  const ROOT_X = 600
  const ROOT_Y = 400
  
  const roots = tree.filter(n => !n.parentId)
  
  roots.forEach((root, idx) => {
    const rootY = ROOT_Y + (idx * 600)
    positions.set(root.id, { x: ROOT_X, y: rootY })
    layoutBalancedSubtree(root, tree, ROOT_X, rootY, positions, 1, yNodes)
  })
  
  return positions
}

/**
 * Build tree structure
 */
function buildTree(yNodes) {
  const nodes = []
  
  yNodes.forEach((value, key) => {
    if (value.autoAlign !== false) {
      nodes.push({
        id: key,
        parentId: value.parentId || null,
        label: value.label || '',
        side: value.side || null,
        autoAlign: value.autoAlign !== false,
      })
    }
  })
  
  return nodes
}

/**
 * Layout balanced tree
 */
function layoutBalancedSubtree(parent, tree, parentX, parentY, positions, level, yNodes) {
  const children = tree.filter(n => n.parentId === parent.id)
  if (children.length === 0) return
  
  const isRootLevel = !parent.parentId
  
  if (isRootLevel) {
    const leftChildren = []
    const rightChildren = []
    
    children.forEach(child => {
      if (child.side === 'left') {
        leftChildren.push(child)
      } else if (child.side === 'right') {
        rightChildren.push(child)
      } else {
        if (leftChildren.length <= rightChildren.length) {
          leftChildren.push(child)
          child.side = 'left'
          const node = yNodes.get(child.id)
          if (node) {
            yNodes.set(child.id, { ...node, side: 'left' })
          }
        } else {
          rightChildren.push(child)
          child.side = 'right'
          const node = yNodes.get(child.id)
          if (node) {
            yNodes.set(child.id, { ...node, side: 'right' })
          }
        }
      }
    })
    
    if (leftChildren.length > 0) {
      layoutSideBySubtree(leftChildren, parent, parentX, parentY, 'left', tree, positions, level, yNodes)
    }
    
    if (rightChildren.length > 0) {
      layoutSideBySubtree(rightChildren, parent, parentX, parentY, 'right', tree, positions, level, yNodes)
    }
  } else {
    const parentSide = parent.side || 'right'
    layoutSideBySubtree(children, parent, parentX, parentY, parentSide, tree, positions, level, yNodes)
  }
}

/**
 * Layout siblings on one side
 */
function layoutSideBySubtree(siblings, parent, parentX, parentY, side, tree, positions, level, yNodes) {
  const direction = side === 'left' ? -1 : 1
  
  const parentWidth = estimateNodeWidth(parent.label)
  
  const maxSiblingWidth = Math.max(...siblings.map(s => estimateNodeWidth(s.label)))
  
  const dynamicXSpacing = (parentWidth / 2) + HORIZONTAL_GAP + (maxSiblingWidth / 2)
  const x = parentX + (direction * dynamicXSpacing)
  
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
    
    if (item.node.side !== side) {
      item.node.side = side
      const node = yNodes.get(item.node.id)
      if (node) {
        yNodes.set(item.node.id, { ...node, side })
      }
    }
    
    const grandchildren = tree.filter(n => n.parentId === item.node.id)
    if (grandchildren.length > 0) {
      layoutBalancedSubtree(item.node, tree, x, centerY, positions, level + 1, yNodes)
    }
    
    currentY += item.height + MIN_Y_SPACING
  })
}

export function calculateNewNodePosition(parentId, yNodes, side = null) {
  const parent = yNodes.get(parentId)
  if (!parent?.position) return { x: 0, y: 0 }
  
  const nodeSide = side || getSuggestedSide(parentId, yNodes)
  const direction = nodeSide === 'left' ? -1 : 1
  
  let moreYSpacing = 0
  if (parent.isFree) {
    moreYSpacing = 40
  }
  
  let siblingCount = 0
  yNodes.forEach(v => {
    if (v.parentId === parentId && v.autoAlign !== false) siblingCount++
  })
  
  const parentWidth = estimateNodeWidth(parent.label)
  const defaultChildWidth = 120 // Node mới tinh thường chưa có text dài
  const dynamicXSpacing = (parentWidth / 2) + HORIZONTAL_GAP + (defaultChildWidth / 2)

  return {
    x: parent.position.x + (direction * dynamicXSpacing),
    y: parent.position.y + (siblingCount * (40 + moreYSpacing))
  }
}

export function getSuggestedSide(parentId, yNodes) {
  const parent = yNodes.get(parentId)
  if (!parent) return 'right'
  
  if (!parent.parentId) {
    let leftCount = 0
    let rightCount = 0
    
    yNodes.forEach(v => {
      if (v.parentId === parentId && v.autoAlign !== false) {
        if (v.side === 'left') leftCount++
        else if (v.side === 'right') rightCount++
      }
    })
    
    return leftCount <= rightCount ? 'left' : 'right'
  }
  
  return parent.side || 'right'
}

export function determineFreeNodeSide(nodeX, rootX) {
  return nodeX < rootX ? 'left' : 'right'
}

export function updateSubtreeSide(nodeId, newSide, yNodes, yEdges) {
  const node = yNodes.get(nodeId)
  if (!node) return

  yNodes.set(nodeId, {
    ...node,
    side: newSide,
  })

  const edges = yEdges.toArray()
  const edgeIndex = edges.findIndex(
    (e) => e.isParentChild && e.target === nodeId
  )

  if (edgeIndex !== -1) {
    const edge = edges[edgeIndex]
    const sourceHandle = newSide === 'left' ? 'source-left' : 'source-right'
    const targetHandle = newSide === 'left' ? 'target-right' : 'target-left'

    yEdges.delete(edgeIndex, 1)
    yEdges.insert(edgeIndex, [
      {
        ...edge,
        sourceHandle,
        targetHandle,
      },
    ])
  }

  yNodes.forEach((value, key) => {
    if (value.parentId === nodeId) {
      updateSubtreeSide(key, newSide, yNodes, yEdges)
    }
  })
}