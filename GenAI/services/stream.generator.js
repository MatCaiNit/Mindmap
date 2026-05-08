// GenAI/services/stream.generator.js
// Progressive mindmap generation with SSE streaming
// Each node is emitted as soon as it's ready — user sees the tree grow in real-time

import { extractTextFromPDF, analyzeStructure, chunkText, chunkByStructure } from './pdfExtractor.js'
import { embedBatchSafe, embedText } from './embedder.js'
import PDFChunk from '../models/PDFChunk.js'
import {
  PROMPT_OUTLINE,
  PROMPT_OUTLINE_COMBINED,
  PROMPT_EXPAND_NODE_RAG,
  PROMPT_EXPAND_NODE_PROMPT,
  detectLang,
} from '../utils/prompts.js'
import { extractJSON } from '../utils/jsonSafe.js'
import {
  extractOutline,
  assignChunksToChapters,
  resolvePageRanges,
} from './outline.extractor.js'

const OLLAMA_BASE = process.env.OLLAMA_URL       || 'http://localhost:11434'
const GEN_MODEL   = process.env.OLLAMA_GEN_MODEL || 'qwen2.5:3b'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─────────────────────────────────────────────────────────────────────────────
// OLLAMA
// ─────────────────────────────────────────────────────────────────────────────

async function ollamaCall(prompt, { timeoutMs = 90_000, temperature = 0.15, numCtx = 6144 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
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
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
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
    if (err.name === 'AbortError') throw new Error(`Ollama timeout after ${timeoutMs / 1000}s`)
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
      console.warn(`[Stream] JSON parse failed attempt ${attempt + 1}: ${raw.slice(0, 200)}`)
    } catch (err) {
      console.warn(`[Stream] Attempt ${attempt + 1}: ${err.message}`)
      if (attempt === maxRetries) throw err
    }
    if (attempt < maxRetries) await sleep(1500 * (attempt + 1))
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG helpers
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

async function retrieveForNode(nodeText, parentChain, mindmapId, topK = 4) {
  if (!mindmapId) return []
  try {
    const query = [...parentChain.slice(-2), nodeText].filter(Boolean).join(' ')
    const queryVec = await embedText(query)
    const chunks = await PDFChunk.find({ mindmapId }).select('text pageNum chunkIndex embedding').lean()
    if (!chunks.length) return []
    const scored = chunks.map(c => ({
      ...c,
      score: cosineSim(queryVec, c.embedding || []) * 0.7 + termOverlap(query, c.text) * 0.3,
    }))
    return scored.sort((a, b) => b.score - a.score).slice(0, topK)
  } catch (err) {
    console.warn('[Stream RAG] error:', err.message)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate outline (phase 1)
// ─────────────────────────────────────────────────────────────────────────────

async function generateOutline({ title, context, userIntent, lang }) {
  const prompt = userIntent?.trim()
    ? PROMPT_OUTLINE_COMBINED({ title, userIntent, pdfContext: context, lang })
    : PROMPT_OUTLINE({ title, context, userIntent: null, lang })

  const result = await callJSON(prompt, { timeoutMs: 90_000, temperature: 0.15 })
  if (!result) return null

  const branches = result.branches || result.root?.children || result.children
  if (!Array.isArray(branches) || branches.length === 0) return null

  const GENERIC_RE = /^(overview|introduction|summary|conclusion|tổng quan|giới thiệu|kết luận|các vấn đề)$/i
  const valid = branches.filter(b => b?.text && b.text.length > 2 && !GENERIC_RE.test(b.text.trim()))
  return { title: result.title || title, branches: valid.length > 0 ? valid : branches }
}

// ─────────────────────────────────────────────────────────────────────────────
// Expand a single node — returns array of children
// ─────────────────────────────────────────────────────────────────────────────

async function expandNodeChildren({ nodeText, parentChain, mindmapId, chapterChunks, lang, maxChildren = 4 }) {
  let ragChunks = []

  if (chapterChunks?.length >= 1) {
    const nodeTerms = nodeText.toLowerCase().split(/\s+/).filter(t => t.length > 2)
    const filtered = chapterChunks
      .map(c => ({ ...c, rel: nodeTerms.reduce((s, t) => s + (c.text.toLowerCase().includes(t) ? 1 : 0), 0) }))
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 4)
    ragChunks = filtered.length > 0 ? filtered : chapterChunks.slice(0, 3)
  } else if (mindmapId) {
    ragChunks = await retrieveForNode(nodeText, parentChain, mindmapId, 4)
  }

  const prompt = ragChunks.length >= 1
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
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE ID generator
// ─────────────────────────────────────────────────────────────────────────────

let _nodeCounter = 0
function freshId(prefix = 'n') {
  return `${prefix}-${Date.now()}-${++_nodeCounter}`
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: streamMindmapGeneration — async generator that yields SSE events
//
// Events:
//   { type: 'status',  message: string }
//   { type: 'node',    node: NodePayload }   ← emitted per node
//   { type: 'edge',    edge: EdgePayload }   ← emitted per edge
//   { type: 'done',    totalNodes: number }
//   { type: 'error',   message: string }
//
// NodePayload = { id, parentId, label, level, side, color, isRoot,
//                 pdfSource?, aiSource?, position: {x,y} }
// ─────────────────────────────────────────────────────────────────────────────

export async function* streamMindmapGeneration({
  title,
  pagesData,        // null for prompt-only
  savedChunks,      // pre-embedded chunks from DB
  mindmapId,
  userPrompt,
  mode,             // 'pdf' | 'prompt' | 'combined'
}) {
  _nodeCounter = 0
  const allText = pagesData ? pagesData.map(p => p.text || '').join('\n') : (userPrompt || title)
  const lang = detectLang(allText)

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
  const ROOT_COLOR = mode === 'pdf' ? '#3b82f6' : '#8b5cf6'
  const ROOT_X = 600, ROOT_Y = 400

  // ── Emit root node immediately ─────────────────────────────────────────
  const rootId = 'root-node'
  yield {
    type: 'node',
    node: {
      id: rootId,
      parentId: null,
      label: title,
      level: 0,
      side: null,
      color: ROOT_COLOR,
      isRoot: true,
      position: { x: ROOT_X, y: ROOT_Y },
      ...(mode !== 'pdf' ? { aiSource: { aiGenerated: true, sources: [] } } : {}),
    },
  }

  let outline = null

  // ── Phase 1: Structural TOC (PDF only) ────────────────────────────────
  if (pagesData && savedChunks?.length) {
    yield { type: 'status', message: lang === 'vi' ? 'Phân tích cấu trúc tài liệu...' : 'Analyzing document structure...' }

    const tocResult = await extractOutline(pagesData, { lang, useAI: false })

    if (tocResult?.chapters?.length >= 2) {
      yield { type: 'status', message: `${lang === 'vi' ? 'Tìm thấy' : 'Found'} ${tocResult.chapters.length} ${lang === 'vi' ? 'chương' : 'chapters'}` }

      const chaptersWithRanges = resolvePageRanges(tocResult.chapters, pagesData)
      const assignments = assignChunksToChapters(chaptersWithRanges, savedChunks)

      // Emit L1 + L2 + L3 per chapter
      for (let ci = 0; ci < assignments.length; ci++) {
        const { chapter, chunks } = assignments[ci]
        const side = ci % 2 === 0 ? 'right' : 'left'
        const color = COLORS[ci % COLORS.length]

        yield { type: 'status', message: `${lang === 'vi' ? 'Đang mở rộng' : 'Expanding'}: ${chapter.title}` }

        // L1 node
        const l1Id = freshId('ch')
        const l1X = ROOT_X + (side === 'right' ? 280 : -280)
        const l1Y = ROOT_Y + (ci - assignments.length / 2) * 120

        yield {
          type: 'node',
          node: { id: l1Id, parentId: rootId, label: chapter.title, level: 1, side, color, isRoot: false, position: { x: l1X, y: l1Y }, ...(mode !== 'prompt' ? {} : { aiSource: { aiGenerated: true, sources: [] } }) },
        }
        yield {
          type: 'edge',
          edge: { id: `e-${rootId}-${l1Id}`, source: rootId, target: l1Id, sourceHandle: side === 'right' ? 'source-right' : 'source-left', targetHandle: side === 'right' ? 'target-left' : 'target-right', color: ROOT_COLOR, isParentChild: true },
        }

        // L2 nodes (sub-sections from TOC or AI expand)
        const subSources = chapter.subSections?.length >= 2
          ? chapter.subSections.slice(0, 5).map(s => ({ text: s, description: '', keywords: [], sourceRef: null }))
          : await expandNodeChildren({ nodeText: chapter.title, parentChain: [title], mindmapId, chapterChunks: chunks, lang, maxChildren: 4 })

        for (let si = 0; si < subSources.length; si++) {
          const sub = subSources[si]
          const l2Id = freshId('sub')
          const l2X = l1X + (side === 'right' ? 260 : -260)
          const l2Y = l1Y + (si - subSources.length / 2) * 90

          const pdfSrc = mode !== 'prompt' && sub.sourceRef != null
            ? { chunkIndex: sub.sourceRef, text: savedChunks[sub.sourceRef]?.text?.slice(0, 200) ?? null, page: savedChunks[sub.sourceRef]?.pageNum ?? null }
            : null

          yield {
            type: 'node',
            node: {
              id: l2Id, parentId: l1Id, label: sub.text, level: 2, side, color,
              isRoot: false, position: { x: l2X, y: l2Y },
              ...(pdfSrc ? { pdfSource: pdfSrc } : mode !== 'pdf' ? { aiSource: { aiGenerated: true, sources: [] } } : {}),
            },
          }
          yield {
            type: 'edge',
            edge: { id: `e-${l1Id}-${l2Id}`, source: l1Id, target: l2Id, sourceHandle: side === 'right' ? 'source-right' : 'source-left', targetHandle: side === 'right' ? 'target-left' : 'target-right', color, isParentChild: true },
          }

          // L3 nodes
          const l3Items = await expandNodeChildren({ nodeText: sub.text, parentChain: [title, chapter.title], mindmapId, chapterChunks: chunks.slice(0, 3), lang, maxChildren: 3 })
          await sleep(100)

          for (let li = 0; li < l3Items.length; li++) {
            const leaf = l3Items[li]
            const l3Id = freshId('leaf')
            const l3X = l2X + (side === 'right' ? 240 : -240)
            const l3Y = l2Y + (li - l3Items.length / 2) * 70

            const pdfLeafSrc = mode !== 'prompt' && leaf.sourceRef != null
              ? { chunkIndex: leaf.sourceRef, text: savedChunks[leaf.sourceRef]?.text?.slice(0, 200) ?? null, page: savedChunks[leaf.sourceRef]?.pageNum ?? null }
              : null

            yield {
              type: 'node',
              node: {
                id: l3Id, parentId: l2Id, label: leaf.text, level: 3, side, color,
                isRoot: false, position: { x: l3X, y: l3Y },
                ...(pdfLeafSrc ? { pdfSource: pdfLeafSrc } : mode !== 'pdf' ? { aiSource: { aiGenerated: true, sources: [] } } : {}),
              },
            }
            yield {
              type: 'edge',
              edge: { id: `e-${l2Id}-${l3Id}`, source: l2Id, target: l3Id, sourceHandle: side === 'right' ? 'source-right' : 'source-left', targetHandle: side === 'right' ? 'target-left' : 'target-right', color, isParentChild: true },
            }
          }

          await sleep(80)
        }
        await sleep(150)
      }

      yield { type: 'done', totalNodes: _nodeCounter + 1 }
      return
    }
  }

  // ── Phase 1 fallback: Generate outline from text ──────────────────────
  yield { type: 'status', message: lang === 'vi' ? 'Tạo khung mindmap...' : 'Generating mindmap outline...' }

  const context = savedChunks?.length
    ? savedChunks.slice(0, 20).map(c => c.text).join('\n').slice(0, 4000)
    : ''

  outline = await generateOutline({ title, context, userIntent: userPrompt, lang })

  if (!outline?.branches?.length) {
    yield { type: 'error', message: 'Could not generate mindmap outline' }
    return
  }

  yield { type: 'status', message: `${lang === 'vi' ? 'Tìm thấy' : 'Found'} ${outline.branches.length} ${lang === 'vi' ? 'nhánh' : 'branches'}` }

  // ── Phase 2: Expand each branch progressively ─────────────────────────
  for (let bi = 0; bi < outline.branches.length; bi++) {
    const branch = outline.branches[bi]
    const side = bi % 2 === 0 ? 'right' : 'left'
    const color = COLORS[bi % COLORS.length]

    yield { type: 'status', message: `${lang === 'vi' ? 'Mở rộng' : 'Expanding'}: ${branch.text}` }

    // L1
    const l1Id = freshId('b')
    const l1X = ROOT_X + (side === 'right' ? 280 : -280)
    const l1Y = ROOT_Y + (bi - outline.branches.length / 2) * 120

    yield {
      type: 'node',
      node: {
        id: l1Id, parentId: rootId, label: branch.text, level: 1, side, color,
        isRoot: false, position: { x: l1X, y: l1Y },
        aiSource: { aiGenerated: true, sources: [] },
      },
    }
    yield {
      type: 'edge',
      edge: { id: `e-${rootId}-${l1Id}`, source: rootId, target: l1Id, sourceHandle: side === 'right' ? 'source-right' : 'source-left', targetHandle: side === 'right' ? 'target-left' : 'target-right', color: ROOT_COLOR, isParentChild: true },
    }

    // If outline already has children, use them; else AI expand
    const l2Sources = branch.children?.length >= 1
      ? branch.children.map(c => ({ text: c.text || c, description: '', keywords: [], sourceRef: null }))
      : await expandNodeChildren({ nodeText: branch.text, parentChain: [title], mindmapId, chapterChunks: savedChunks?.slice(0, 5) || [], lang, maxChildren: 4 })

    for (let si = 0; si < l2Sources.length; si++) {
      const sub = l2Sources[si]
      const l2Id = freshId('s')
      const l2X = l1X + (side === 'right' ? 260 : -260)
      const l2Y = l1Y + (si - l2Sources.length / 2) * 90

      yield {
        type: 'node',
        node: {
          id: l2Id, parentId: l1Id, label: sub.text, level: 2, side, color,
          isRoot: false, position: { x: l2X, y: l2Y },
          aiSource: { aiGenerated: true, sources: [] },
        },
      }
      yield {
        type: 'edge',
        edge: { id: `e-${l1Id}-${l2Id}`, source: l1Id, target: l2Id, sourceHandle: side === 'right' ? 'source-right' : 'source-left', targetHandle: side === 'right' ? 'target-left' : 'target-right', color, isParentChild: true },
      }

      // L3
      const l3Items = await expandNodeChildren({ nodeText: sub.text, parentChain: [title, branch.text], mindmapId, chapterChunks: savedChunks?.slice(0, 3) || [], lang, maxChildren: 3 })
      await sleep(80)

      for (let li = 0; li < l3Items.length; li++) {
        const leaf = l3Items[li]
        const l3Id = freshId('l')
        const l3X = l2X + (side === 'right' ? 240 : -240)
        const l3Y = l2Y + (li - l3Items.length / 2) * 70

        yield {
          type: 'node',
          node: {
            id: l3Id, parentId: l2Id, label: leaf.text, level: 3, side, color,
            isRoot: false, position: { x: l3X, y: l3Y },
            aiSource: { aiGenerated: true, sources: [] },
          },
        }
        yield {
          type: 'edge',
          edge: { id: `e-${l2Id}-${l3Id}`, source: l2Id, target: l3Id, sourceHandle: side === 'right' ? 'source-right' : 'source-left', targetHandle: side === 'right' ? 'target-left' : 'target-right', color, isParentChild: true },
        }
      }

      await sleep(60)
    }
    await sleep(150)
  }

  yield { type: 'done', totalNodes: _nodeCounter + 1 }
}