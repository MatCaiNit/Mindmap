// GenAI/services/progressive.generator.js
// XMind-style two-phase pipeline: Outline → Expand per branch
// Supports: PDF only | Prompt only | Combined (PDF + Prompt)
// Each expansion uses node-level RAG for specificity

import PDFChunk from '../models/PDFChunk.js'
import { embedText, embedBatchSafe } from './embedder.js'
import {
  PROMPT_OUTLINE,
  PROMPT_OUTLINE_COMBINED,
  PROMPT_EXPAND_NODE_RAG,
  PROMPT_EXPAND_NODE_PROMPT,
  PROMPT_SUGGEST_NODES,
  detectLang,
} from '../utils/prompts.js'
import {
  extractOutline,
  assignChunksToChapters,
  resolvePageRanges,
} from './outline.extractor.js'
import { extractJSON } from '../utils/jsonSafe.js'

const OLLAMA_BASE = process.env.OLLAMA_URL       || 'http://localhost:11434'
const GEN_MODEL   = process.env.OLLAMA_GEN_MODEL || 'qwen2.5:3b'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─────────────────────────────────────────────────────────────────────────────
// OLLAMA CORE
// ─────────────────────────────────────────────────────────────────────────────

async function ollamaCall(prompt, { timeoutMs = 120_000, temperature = 0.1, numCtx = 8192 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    console.warn('[Gen] Ollama timeout — aborting')
    controller.abort()
  }, timeoutMs)

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEN_MODEL,
        prompt,
        format: 'json',
        stream: true,
        options: { temperature, num_ctx: numCtx, num_gpu: 99, num_thread: 4 },
      }),
    })

    if (!res.ok) throw new Error(`[Ollama] ${res.status}: ${await res.text()}`)

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value, { stream: true }).split('\n').filter(Boolean)) {
        try { const o = JSON.parse(line); if (o.response) full += o.response } catch (_) {}
      }
    }
    return full
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Ollama timed out after ${timeoutMs / 1000}s`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function callJSON(prompt, opts = {}) {
  const maxRetries = opts.maxRetries ?? 2
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await ollamaCall(prompt, opts)
      const parsed = extractJSON(raw)
      if (parsed !== null) return parsed
      console.warn(`[Gen] JSON parse failed attempt ${attempt + 1}`)
    } catch (err) {
      console.warn(`[Gen] Attempt ${attempt + 1}: ${err.message}`)
      if (attempt === maxRetries) throw err
    }
    if (attempt < maxRetries) await sleep(1500 * (attempt + 1))
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE-LEVEL RAG (XMind approach: query per node, not per document)
// ─────────────────────────────────────────────────────────────────────────────

function cosineSim(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
  return dot / (Math.sqrt(na * nb) + 1e-10)
}

function termOverlap(query, docText) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  const doc = docText.toLowerCase()
  return terms.reduce((s, t) => s + (doc.includes(t) ? 1 : 0), 0) / Math.max(terms.length, 1)
}

/**
 * Retrieve top chunks relevant to a specific node
 * query = nodeText + last 2 parent contexts (XMind-style focused query)
 */
async function retrieveForNode(nodeText, parentChain, mindmapId, topK = 4) {
  if (!mindmapId) return []
  try {
    // Focused query: node + 2 parent levels max
    const query = [...parentChain.slice(-2), nodeText].filter(Boolean).join(' ')
    const queryVec = await embedText(query)

    const chunks = await PDFChunk.find({ mindmapId })
      .select('text pageNum chunkIndex embedding')
      .lean()

    if (!chunks.length) return []

    // Hybrid scoring: vector (70%) + term overlap (30%)
    const scored = chunks.map(c => ({
      ...c,
      score: cosineSim(queryVec, c.embedding || []) * 0.7 + termOverlap(query, c.text) * 0.3,
    }))

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(c => ({ text: c.text, pageNum: c.pageNum, chunkIndex: c.chunkIndex, score: c.score }))
  } catch (err) {
    console.warn('[RAG] node retrieve error:', err.message)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: OUTLINE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

async function generateOutline({ title, context, userIntent, lang }) {
  console.log(`[Outline] Generating — "${title}" (lang: ${lang})`)

  const prompt = userIntent?.trim()
    ? PROMPT_OUTLINE_COMBINED({ title, userIntent, pdfContext: context, lang })
    : PROMPT_OUTLINE({ title, context, userIntent: null, lang })

  const result = await callJSON(prompt, { timeoutMs: 90_000, temperature: 0.15 })
  if (!result) return null

  const branches = result.branches || result.root?.children || result.children
  if (!Array.isArray(branches) || branches.length === 0) return null

  // Validate: remove branches with empty/generic titles
  const GENERIC_RE = /^(overview|introduction|summary|conclusion|tổng quan|giới thiệu|kết luận|các vấn đề)$/i
  const valid = branches.filter(b => b?.text && b.text.length > 2 && !GENERIC_RE.test(b.text.trim()))

  return { title: result.title || title, branches: valid.length > 0 ? valid : branches }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: NODE EXPANSION (with node-level RAG)
// ─────────────────────────────────────────────────────────────────────────────

async function expandNode({ nodeText, parentChain, mindmapId, chapterChunks, lang, maxChildren = 4 }) {
  // Use pre-fetched chapter chunks first, then do node-level RAG
  let ragChunks = []
  if (chapterChunks?.length >= 2) {
    // Filter chapter chunks relevant to this specific node
    const nodeTerms = nodeText.toLowerCase().split(/\s+/).filter(t => t.length > 2)
    const filtered = chapterChunks
      .map(c => ({ ...c, rel: nodeTerms.reduce((s, t) => s + (c.text.toLowerCase().includes(t) ? 1 : 0), 0) }))
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 4)
    ragChunks = filtered.length > 0 ? filtered : chapterChunks.slice(0, 3)
  } else if (mindmapId) {
    ragChunks = await retrieveForNode(nodeText, parentChain, mindmapId, 4)
  }

  const prompt = (ragChunks.length >= 1)
    ? PROMPT_EXPAND_NODE_RAG({ nodeText, parentChain, ragChunks, lang, maxChildren })
    : PROMPT_EXPAND_NODE_PROMPT({ nodeText, parentChain, topic: parentChain[0] || nodeText, lang, maxChildren })

  const result = await callJSON(prompt, { timeoutMs: 60_000, temperature: 0.2 })
  if (!result) return []

  const children = Array.isArray(result) ? result : (result.children || result.nodes || [])

  return children
    .filter(c => c?.text && c.text.length > 2)
    .slice(0, maxChildren + 2)
    .map(c => ({
      text: c.text.slice(0, 80),
      description: (c.description || '').slice(0, 150),
      keywords: Array.isArray(c.keywords) ? c.keywords.slice(0, 5) : [],
      sourceRef: typeof c.sourceRef === 'number' ? c.sourceRef : null,
      children: [],
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURSIVE BRANCH EXPANSION
// ─────────────────────────────────────────────────────────────────────────────

async function expandBranch(branchNode, parentChain, mindmapId, chapterChunks, lang, depth = 0) {
  if (depth > 2) return branchNode // Max 3 levels of expansion
  const newChain = [...parentChain, branchNode.text]

  if (branchNode.children?.length > 0) {
    // Already has children from outline — expand each child recursively
    const expanded = []
    for (let i = 0; i < branchNode.children.length; i++) {
      const child = branchNode.children[i]
      const result = await expandBranch(child, newChain, mindmapId, chapterChunks, lang, depth + 1)
      expanded.push(result)
      if (i < branchNode.children.length - 1) await sleep(150)
    }
    return { ...branchNode, children: expanded }
  }

  // Leaf in outline — expand with RAG
  if (depth <= 1) {
    const children = await expandNode({
      nodeText: branchNode.text,
      parentChain,
      mindmapId,
      chapterChunks,
      lang,
      maxChildren: depth === 0 ? 5 : 4,
    })

    // Level 3: expand each child into leaf nodes
    if (depth === 0 && children.length > 0) {
      const deepExpanded = []
      for (let i = 0; i < Math.min(children.length, 5); i++) {
        const child = children[i]
        const subRag = chapterChunks?.length
          ? chapterChunks.slice(0, 3)
          : await retrieveForNode(child.text, newChain, mindmapId, 3)

        const grandchildren = await expandNode({
          nodeText: child.text,
          parentChain: newChain,
          mindmapId,
          chapterChunks: subRag,
          lang,
          maxChildren: 3,
        })
        deepExpanded.push({ ...child, children: grandchildren })
        if (i < Math.min(children.length, 5) - 1) await sleep(100)
      }
      return { ...branchNode, children: deepExpanded }
    }

    return { ...branchNode, children }
  }

  return branchNode
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-PROCESSING
// ─────────────────────────────────────────────────────────────────────────────

function countNodes(node) {
  if (!node) return 0
  return 1 + (node.children || []).reduce((s, c) => s + countNodes(c), 0)
}

function normalizeNode(node, depth = 0) {
  if (!node?.text) return null
  return {
    text: (node.text || '').trim().slice(0, 80),
    description: (node.description || '').trim().slice(0, 200),
    keywords: (node.keywords || []).filter(k => typeof k === 'string').slice(0, 5),
    sourceRef: node.sourceRef ?? null,
    children: depth < 4
      ? (node.children || []).filter(c => c?.text).slice(0, 8).map(c => normalizeNode(c, depth + 1)).filter(Boolean)
      : [],
  }
}

function dedupeChildren(node) {
  if (!node?.children?.length) return node
  const seen = new Set()
  node.children = node.children
    .filter(c => {
      const key = (c.text || '').toLowerCase().replace(/\s+/g, '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(dedupeChildren)
  return node
}

function postProcess(mindmap) {
  const root = mindmap?.root ?? mindmap
  if (!root) return mindmap
  const normalized = normalizeNode(root)
  if (!normalized) return mindmap
  dedupeChildren(normalized)
  return { root: normalized }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: generateFromPdfProgressive
// Orchestrates: TOC extraction → outline → expand per branch with RAG
// ─────────────────────────────────────────────────────────────────────────────

export async function generateFromPdfProgressive(pagesData, savedChunks, title, mindmapId, options = {}) {
  const { userIntent, lang: forceLang } = options
  const allText = pagesData.map(p => p.text || '').join('\n')
  const lang = forceLang || detectLang(allText)

  console.log(`\n[Progressive-PDF] Starting — lang: ${lang}, chunks: ${savedChunks.length}`)
  if (userIntent) console.log(`[Progressive-PDF] User intent: "${userIntent}"`)
  const t0 = Date.now()

  // ── Phase 1: Try structural TOC extraction first ────────────────────────
  let outline = null
  const tocResult = await extractOutline(pagesData, { lang, useAI: false })

  if (tocResult?.chapters?.length >= 2) {
    console.log(`[Progressive-PDF] Structural TOC found: ${tocResult.chapters.length} chapters`)

    // Assign chunks to chapters by page range
    const chaptersWithRanges = resolvePageRanges(tocResult.chapters, pagesData)
    const assignments = assignChunksToChapters(chaptersWithRanges, savedChunks)

    // Expand each chapter branch concurrently (limited)
    const branchResults = []
    for (let i = 0; i < assignments.length; i++) {
      const { chapter, chunks } = assignments[i]
      console.log(`[Progressive-PDF] Expanding chapter ${i + 1}/${assignments.length}: "${chapter.title}"`)

      const branch = await expandBranchFromChapter({
        chapterTitle: chapter.title,
        subSections: chapter.subSections || [],
        chunks,
        parentChain: [title],
        mindmapId,
        lang,
        userIntent,
      })

      if (branch) branchResults.push(branch)
      if (i < assignments.length - 1) await sleep(200)
    }

    if (branchResults.length > 0) {
      outline = { title, branches: branchResults }
    }
  }

  // ── Phase 1 fallback: Generate outline from content ─────────────────────
  if (!outline?.branches?.length) {
    console.log('[Progressive-PDF] No TOC found — generating outline from content')
    const context = savedChunks
      .slice(0, 20) // Sample first 20 chunks for outline context
      .map(c => c.text)
      .join('\n')
      .slice(0, 4000)

    outline = await generateOutline({ title, context, userIntent, lang })

    if (outline?.branches?.length > 0) {
      const expandedBranches = []
      for (let i = 0; i < outline.branches.length; i++) {
        const branch = outline.branches[i]
        console.log(`[Progressive-PDF] Expanding branch ${i + 1}/${outline.branches.length}: "${branch.text}"`)
        const expanded = await expandBranch(branch, [title], mindmapId, null, lang, 0)
        expandedBranches.push(expanded)
        await sleep(200)
      }
      outline.branches = expandedBranches
    }
  }

  if (!outline?.branches?.length) throw new Error('Could not generate mindmap outline from PDF')

  const root = {
    text: outline.title || title,
    description: userIntent || '',
    keywords: [],
    sourceRef: null,
    children: outline.branches,
  }

  const mindmap = postProcess({ root })
  const totalNodes = countNodes(mindmap.root)
  console.log(`[Progressive-PDF] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${totalNodes} nodes`)

  return mindmap
}

/**
 * Expand a single chapter with its sub-sections and chunks
 * XMind-style: chapter → sub-sections → detail nodes
 */
async function expandBranchFromChapter({ chapterTitle, subSections, chunks, parentChain, mindmapId, lang, userIntent }) {
  // If we have explicit sub-sections from TOC, use them as L2 nodes
  if (subSections.length >= 2) {
    const children = []
    for (let i = 0; i < Math.min(subSections.length, 5); i++) {
      const subText = subSections[i]
      // Get chunks relevant to this sub-section
      const subTerms = subText.toLowerCase().split(/\s+/).filter(t => t.length > 2)
      const subChunks = chunks
        .map(c => ({ ...c, rel: subTerms.reduce((s, t) => s + (c.text.toLowerCase().includes(t) ? 1 : 0), 0) }))
        .sort((a, b) => b.rel - a.rel)
        .slice(0, 3)

      const grandchildren = await expandNode({
        nodeText: subText,
        parentChain: [...parentChain, chapterTitle],
        mindmapId,
        chapterChunks: subChunks.length ? subChunks : chunks.slice(0, 3),
        lang,
        maxChildren: 3,
      })
      children.push({ text: subText, description: '', keywords: [], sourceRef: null, children: grandchildren })
      await sleep(150)
    }
    return { text: chapterTitle, description: '', keywords: [], sourceRef: null, children }
  }

  // No explicit sub-sections — expand chapter directly
  const children = await expandNode({
    nodeText: chapterTitle,
    parentChain,
    mindmapId,
    chapterChunks: chunks,
    lang,
    maxChildren: 5,
  })

  // Expand top children one more level
  const deepExpanded = []
  for (let i = 0; i < Math.min(children.length, 4); i++) {
    const child = children[i]
    const subChunks = chunks.slice(0, 3)
    const grandchildren = await expandNode({
      nodeText: child.text,
      parentChain: [...parentChain, chapterTitle],
      mindmapId,
      chapterChunks: subChunks,
      lang,
      maxChildren: 3,
    })
    deepExpanded.push({ ...child, children: grandchildren })
    await sleep(100)
  }

  return { text: chapterTitle, description: '', keywords: [], sourceRef: null, children: deepExpanded }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: generateFromPromptProgressive
// ─────────────────────────────────────────────────────────────────────────────

export async function generateFromPromptProgressive(userPrompt) {
  const lang = detectLang(userPrompt)
  console.log(`\n[Progressive-Prompt] "${userPrompt.slice(0, 60)}" (lang: ${lang})`)
  const t0 = Date.now()

  // Phase 1: Generate outline
  const outline = await generateOutline({
    title: userPrompt,
    context: '',
    userIntent: userPrompt,
    lang,
  })

  if (!outline?.branches?.length) throw new Error('Could not generate outline from prompt')

  console.log(`[Progressive-Prompt] Outline: ${outline.branches.length} branches`)

  // Phase 2: Expand each branch
  const expandedBranches = []
  for (let i = 0; i < outline.branches.length; i++) {
    const branch = outline.branches[i]
    console.log(`[Progressive-Prompt] Expanding ${i + 1}/${outline.branches.length}: "${branch.text}"`)
    const expanded = await expandBranch(branch, [userPrompt], null, null, lang, 0)
    expandedBranches.push(expanded)
    await sleep(200)
  }

  const root = {
    text: outline.title || userPrompt,
    description: '',
    keywords: [],
    sourceRef: null,
    children: expandedBranches,
  }

  const mindmap = postProcess({ root })
  const totalNodes = countNodes(mindmap.root)
  console.log(`[Progressive-Prompt] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${totalNodes} nodes`)

  return mindmap
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: generateCombined (PDF + Prompt)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCombined(userPrompt, pagesData, savedChunks, title, mindmapId) {
  const combinedText = userPrompt + ' ' + pagesData.map(p => p.text || '').join('').slice(0, 500)
  const lang = detectLang(combinedText)
  console.log(`\n[Progressive-Combined] prompt: "${userPrompt.slice(0, 50)}" (lang: ${lang})`)

  return generateFromPdfProgressive(pagesData, savedChunks, title, mindmapId, {
    userIntent: userPrompt,
    lang,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESSIVE API: expand single node on demand (frontend "+" click)
// ─────────────────────────────────────────────────────────────────────────────

export async function expandSingleNode({ nodeText, parentChain, mindmapId, lang }) {
  const detectedLang = lang || detectLang(nodeText + ' ' + parentChain.join(' '))
  const ragChunks = mindmapId
    ? await retrieveForNode(nodeText, parentChain, mindmapId, 4)
    : []

  return expandNode({
    nodeText,
    parentChain,
    mindmapId,
    chapterChunks: ragChunks,
    lang: detectedLang,
    maxChildren: 5,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUGGEST NODES (toolbar AI button)
// ─────────────────────────────────────────────────────────────────────────────

export async function suggestChildNodes({ nodeText, parentChain, siblings, mindmapId }) {
  const lang = detectLang(nodeText)
  let ragContext = ''

  if (mindmapId) {
    const chunks = await retrieveForNode(nodeText, parentChain, mindmapId, 3)
    ragContext = chunks.map(c => c.text).join('\n---\n')
  }

  const prompt = PROMPT_SUGGEST_NODES({ currentNode: nodeText, parentChain, siblings, ragContext, lang })
  const raw = await ollamaCall(prompt, { format: 'json', timeoutMs: 30_000 })
  const result = extractJSON(raw)

  if (!result) return []
  return Array.isArray(result) ? result : (result.suggestions || [])
}