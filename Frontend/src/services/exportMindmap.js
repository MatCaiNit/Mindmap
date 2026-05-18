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

export function exportMindmapAsMarkdown(yNodes, yEdges, mindmapTitle = 'mindmap') {
  const nodesMap = {}
  yNodes.forEach((value, key) => { nodesMap[key] = { ...value } })

  if (!nodesMap['root-node']) return null

  const lines = []

  const emit = (nodeId, depth) => {
    const node = nodesMap[nodeId]
    if (!node) return

    const rawLabel = (node.label || node.text || '').trim()
    const desc     = (node.description || '').trim()

    // Tách phần label "thuần" nếu label đã chứa " — description" (AI gộp sẵn)
    let label = rawLabel
    let extra = ''
    if (desc && !rawLabel.includes(desc)) {
      extra = desc
    } else if (rawLabel.includes(' — ')) {
      const i = rawLabel.indexOf(' — ')
      label = rawLabel.slice(0, i).trim()
      extra = rawLabel.slice(i + 3).trim()
    }

    // Làm sạch để không phá cú pháp markdown
    label = label.replace(/\s*\|\s*/g, ' / ').replace(/\n+/g, ' ').trim()
    extra = extra.replace(/\n+/g, ' ').trim()

    const hashes = '#'.repeat(Math.min(depth + 1, 6))
    lines.push(extra ? `${hashes} ${label} | ${extra}` : `${hashes} ${label}`)

    // Con: sort theo position.y giữ đúng thứ tự đọc
    const children = Object.entries(nodesMap)
      .filter(([, c]) => c.parentId === nodeId)
      .sort((a, b) => (a[1]?.position?.y ?? 0) - (b[1]?.position?.y ?? 0))

    for (const [childId] of children) emit(childId, depth + 1)
  }

  emit('root-node', 0)
  return lines.join('\n') + '\n'
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

export function downloadMarkdown(md, filename = 'mindmap') {
  const blob = new Blob([md], { type: 'text/markdown' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${filename}_${new Date().toISOString().slice(0,10)}.md`
  a.click()
  URL.revokeObjectURL(url)
}