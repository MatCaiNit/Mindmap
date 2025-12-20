// Frontend/src/lib/treeLayout.js - WITH FREE NODE SUPPORT

const LEVEL_X_SPACING = 250
const MIN_Y_SPACING = 80
const NODE_HEIGHT = 50
const NODE_VERTICAL_GAP = 12      // 👈 khoảng cách tối thiểu giữa 2 node
const SUBTREE_VERTICAL_GAP = 24 
/**
 * Calculate balanced layout (only mode)
 */
export function calculateBalancedLayout(yNodes) {
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
    
    // Layout children on both sides
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
    // Only include nodes with autoAlign enabled
    if (value.autoAlign !== false) {
      nodes.push({
        id: key,
        parentId: value.parentId || null,
        label: value.label,
        side: value.side || null,
        autoAlign: value.autoAlign !== false,
      })
    }
  })
  
  return nodes
}

/**
 * Calculate subtree height
 */
function calculateSubtreeHeight(nodeId, tree) {
  const children = tree.filter(n => n.parentId === nodeId)

  // 🌱 Leaf
  if (children.length === 0) {
    return NODE_HEIGHT
  }

  // 🌳 Internal node
  const childrenHeight = children.reduce((sum, child) => {
    return sum + calculateSubtreeHeight(child.id, tree)
  }, 0)

  const childrenSpacing = (children.length - 1) * MIN_Y_SPACING

  // 🔥 QUAN TRỌNG: cộng thêm chiều cao node hiện tại
  return Math.max(
    NODE_HEIGHT,
    childrenHeight + childrenSpacing
  )
}


/**
 * Layout balanced tree (left/right distribution)
 */
function layoutBalancedSubtree(parent, tree, parentX, parentY, positions, level, yNodes) {
  const children = tree.filter(n => n.parentId === parent.id)
  if (children.length === 0) return
  
  const isRootLevel = !parent.parentId
  
  if (isRootLevel) {
    // Root level: split left/right
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
          // Update in Yjs
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
    
    // Layout left side
    if (leftChildren.length > 0) {
      layoutSideBySubtree(leftChildren, parentX, parentY, 'left', tree, positions, level, yNodes)
    }
    
    // Layout right side
    if (rightChildren.length > 0) {
      layoutSideBySubtree(rightChildren, parentX, parentY, 'right', tree, positions, level, yNodes)
    }
  } else {
    // Non-root: inherit parent's side
    const parentSide = parent.side || 'right'
    layoutSideBySubtree(children, parentX, parentY, parentSide, tree, positions, level, yNodes)
  }
}

/**
 * Layout siblings on one side
 */
function layoutSideBySubtree(siblings, parentX, parentY, side, tree, positions, level, yNodes) {
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
    
    // Ensure side is set
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

/**
 * Calculate position for new child node
 */
export function calculateNewNodePosition(parentId, yNodes, side = null) {
  const parent = yNodes.get(parentId)
  if (!parent?.position) return { x: 0, y: 0 }
  
  // Use provided side or determine it
  const nodeSide = side || getSuggestedSide(parentId, yNodes)
  const direction = nodeSide === 'left' ? -1 : 1
  let moreYSpacing = 0
  if(parent.isFree){
    moreYSpacing = 40
  }
  let siblingCount = 0
  yNodes.forEach(v => {
    if (v.parentId === parentId && v.autoAlign !== false) siblingCount++
  })
  
  return {
    x: parent.position.x + (direction * LEVEL_X_SPACING),
    y: parent.position.y + (siblingCount * (40 + moreYSpacing))
  }
}

/**
 * Get suggested side for new child
 */
export function getSuggestedSide(parentId, yNodes) {
  const parent = yNodes.get(parentId)
  if (!parent) return 'right'
  
  // If parent is root, balance left/right
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
  
  // Otherwise, inherit parent's side
  return parent.side || 'right'
}

/**
 * 🔥 NEW: Determine free node side based on position
 */
export function determineFreeNodeSide(nodeX, rootX) {
  return nodeX < rootX ? 'left' : 'right'
}

// /**
//  * Update entire subtree to new side when reparenting
//  */
// export function updateSubtreeSide(nodeId, newSide, yNodes, yEdges) {
//   const node = yNodes.get(nodeId)
//   if (!node) return
  
//   // Update this node's side
//   yNodes.set(nodeId, {
//     ...node,
//     side: newSide
//   })
  
//   // Update all descendants recursively
//   yNodes.forEach((value, key) => {
//     if (value.parentId === nodeId) {
//       updateSubtreeSide(key, newSide, yNodes, yEdges)
//     }
//   })
  
//   // Update edge handles for this node
//   const edgesArray = yEdges.toArray()
  
//   edgesArray.forEach((edge, idx) => {
//     if (edge.isParentChild) {
//       // If this is the edge connecting to this node
//       if (edge.target === nodeId) {
//         const sourceHandle = newSide === 'left' ? 'source-left' : 'source-right'
//         const targetHandle = newSide === 'left' ? 'target-right' : 'target-left'
        
//         yEdges.delete(idx, 1)
//         yEdges.insert(idx, [{
//           ...edge,
//           sourceHandle,
//           targetHandle
//         }])
//       }
//       // If this node is the parent
//       else if (edge.source === nodeId) {
//         const childNode = yNodes.get(edge.target)
//         if (childNode) {
//           const childSide = childNode.side || newSide
//           const sourceHandle = childSide === 'left' ? 'source-left' : 'source-right'
//           const targetHandle = childSide === 'left' ? 'target-right' : 'target-left'
          
//           yEdges.delete(idx, 1)
//           yEdges.insert(idx, [{
//             ...edge,
//             sourceHandle,
//             targetHandle
//           }])
//         }
//       }
//     }
//   })
// }

/**
 * Update entire subtree to new side when reparenting
 */
export function updateSubtreeSide(nodeId, newSide, yNodes, yEdges) {
  const node = yNodes.get(nodeId)
  if (!node) return

  // 1️⃣ Update node side
  yNodes.set(nodeId, {
    ...node,
    side: newSide,
  })

  // 2️⃣ Update edge connecting this node to its parent
  const edges = yEdges.toArray()
  const edgeIndex = edges.findIndex(
    (e) => e.isParentChild && e.target === nodeId
  )

  if (edgeIndex !== -1) {
    const edge = edges[edgeIndex]
    const sourceHandle =
      newSide === 'left' ? 'source-left' : 'source-right'
    const targetHandle =
      newSide === 'left' ? 'target-right' : 'target-left'

    yEdges.delete(edgeIndex, 1)
    yEdges.insert(edgeIndex, [
      {
        ...edge,
        sourceHandle,
        targetHandle,
      },
    ])
  }

  // 3️⃣ Recurse children
  yNodes.forEach((value, key) => {
    if (value.parentId === nodeId) {
      updateSubtreeSide(key, newSide, yNodes, yEdges)
    }
  })
}
