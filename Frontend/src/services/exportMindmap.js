export function exportMindmapAsJSON(yNodes, yEdges, mindmapTitle = 'mindmap') {
  // 1. Snapshot toàn bộ nodes
  const nodesMap = {}
  yNodes.forEach((value, key) => {
    nodesMap[key] = { ...value }
  })

  // 2. Tìm root
  const rootNode = nodesMap['root-node']
  if (!rootNode) return null

  // 3. Build tree đệ quy
  function buildTree(nodeId) {
    const node = nodesMap[nodeId]
    if (!node) return null

    const children = []
    Object.entries(nodesMap).forEach(([childId, childData]) => {
      if (childData.parentId === nodeId) {
        const childTree = buildTree(childId)
        if (childTree) children.push(childTree)
      }
    })

    // Sort theo position.y để giữ thứ tự
    children.sort((a, b) => (nodesMap[a._id]?.position?.y ?? 0) - (nodesMap[b._id]?.position?.y ?? 0))

    return {
      text:     node.label || '',
      level:    node.level ?? 0,
      color:    node.color,
      side:     node.side,
      // Giữ source info nếu có (từ PDF)
      ...(node.pdfSource ? { pdfSource: node.pdfSource } : {}),
      children,
    }
  }

  const tree = buildTree('root-node')

  const exportData = {
    title:     mindmapTitle,
    exportedAt: new Date().toISOString(),
    root:      tree,
    // Flat list để dùng cho RAGAS / đo chỉ số
    flatNodes: Object.values(nodesMap).map(n => ({
      text:  n.label,
      level: n.level,
      page:  n.pdfSource?.page ?? null,
    })),
  }

  return exportData
}

export function downloadJSON(data, filename = 'mindmap') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${filename}_${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}


