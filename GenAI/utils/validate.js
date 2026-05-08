// GenAI/utils/validate.js
// Mindmap quality metrics — Vietnamese-aware keyword coverage

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function requireString(val, name) {
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return val.trim()
}


const VI_STOPWORDS = new Set([
  'và', 'của', 'các', 'là', 'có', 'được', 'cho', 'với', 'từ', 'trong',
  'này', 'đó', 'một', 'những', 'hay', 'hoặc', 'nhưng', 'mà', 'khi', 'nếu',
  'thì', 'vì', 'do', 'bởi', 'theo', 'qua', 'lên', 'xuống', 'ra', 'vào',
  'tại', 'trên', 'dưới', 'sau', 'trước', 'đến', 'về', 'như', 'để', 'đã',
  'đang', 'sẽ', 'bị', 'được', 'cũng', 'còn', 'rất', 'nhiều', 'ít', 'hơn',
])

const EN_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
  'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
  'use', 'man', 'men', 'say', 'she', 'too', 'any', 'each', 'from', 'into',
  'this', 'that', 'with', 'have', 'they', 'will', 'been', 'more', 'also',
  'than', 'then', 'when', 'were', 'what', 'your', 'said', 'each', 'which',
])

function tokenizeMultilingual(text) {
  if (!text || typeof text !== 'string') return []

  // Detect language from Vietnamese diacritics density
  const viChars = (text.match(/[àáâãèéêìíòóôõùúýăđơư]/gi) || []).length
  const isVi    = viChars > 10

  // Split on whitespace and punctuation, preserve unicode letters
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\sàáâãèéêìíòóôõùúýăđơưÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐƠƯ]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= (isVi ? 2 : 3))   // Vietnamese: min 2 chars, EN: min 3

  const stopwords = isVi ? VI_STOPWORDS : EN_STOPWORDS
  return tokens.filter(t => !stopwords.has(t) && !/^\d+$/.test(t))
}

// ─────────────────────────────────────────────────────────────────────────────
// Flatten mindmap tree to array of nodes
// ─────────────────────────────────────────────────────────────────────────────

function flattenMindmap(node, depth = 0, result = []) {
  if (!node) return result
  const nodeText = node.text || node.label || node.name || node.title || ''
  const isLeaf   = !node.children || node.children.length === 0
  result.push({ text: nodeText, depth, isLeaf })
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => flattenMindmap(child, depth + 1, result))
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateMetrics
// ─────────────────────────────────────────────────────────────────────────────

export function calculateMetrics(mindmap, rawPdfText, filename = 'Document') {
  // Unwrap root
  let rootNode = mindmap
  if (mindmap?.root)      rootNode = mindmap.root
  else if (mindmap?.data) rootNode = mindmap.data
  else if (Array.isArray(mindmap)) rootNode = mindmap[0]

  if (!rootNode || (!rootNode.text && !rootNode.label && !rootNode.name && !rootNode.title)) {
    return { filename, metrics: { coverage: '0%' }, status: 'EMPTY DATA' }
  }

  const root  = Array.isArray(rootNode) ? rootNode[0] : rootNode
  const nodes = flattenMindmap(root)

  if (nodes.length === 0) {
    return {
      filename,
      metrics: { coverage: '0%', depth: 0, total_nodes: 0, branching_avg: '0', detail_richness: '0%' },
      status: 'FAIL (No nodes found)',
    }
  }

  // ── 1. KEYWORD COVERAGE (multilingual-aware) ──────────────────────────────
  const safePdfText   = (rawPdfText || '').toLowerCase()
  const pdfTokens     = tokenizeMultilingual(safePdfText)
  // Take top 150 most frequent tokens as "keywords"
  const freqMap       = {}
  pdfTokens.forEach(t => { freqMap[t] = (freqMap[t] || 0) + 1 })
  const pdfKeywords   = Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 150)
    .map(([w]) => w)

  const mindmapText     = nodes.map(n => (n.text || '').toLowerCase()).join(' ')
  const coveredKeywords = pdfKeywords.filter(kw => mindmapText.includes(kw))
  const coverageScore   = pdfKeywords.length > 0
    ? (coveredKeywords.length / pdfKeywords.length) * 100
    : 0

  // ── 2. STRUCTURAL DENSITY ─────────────────────────────────────────────────
  const maxDepth    = Math.max(...nodes.map(n => n.depth || 0))
  const totalNodes  = nodes.length
  const leafNodes   = nodes.filter(n => n.isLeaf).length
  const denominator = (totalNodes - leafNodes) || 1
  const branchingFactor = (totalNodes - 1) / denominator

  // ── 3. DETAIL RICHNESS ────────────────────────────────────────────────────
  const detailNodes = nodes.filter(n => n.depth >= 4).length
  const detailRatio = (detailNodes / totalNodes) * 100

  const pass = coverageScore > 40 && maxDepth >= 3   // relaxed threshold for 3B model

  return {
    filename,
    metrics: {
      coverage:        `${coverageScore.toFixed(2)}%`,
      depth:           maxDepth,
      total_nodes:     totalNodes,
      branching_avg:   branchingFactor.toFixed(2),
      detail_richness: `${detailRatio.toFixed(2)}%`,
    },
    status: pass ? 'PASS' : 'WARNING (Cần đào sâu thêm)',
  }
}