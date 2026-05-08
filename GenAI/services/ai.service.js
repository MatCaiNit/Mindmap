// GenAI/services/ai.service.js
// Main orchestrator — XMind-style two-phase progressive pipeline
// Handles: PDF only | Prompt only | PDF + Prompt combined

import PDFChunk from '../models/PDFChunk.js'
import { extractTextFromPDF } from './pdfExtractor.js'
import { embedBatchSafe } from './embedder.js'
import {
  generateFromPdfProgressive,
  generateFromPromptProgressive,
  generateCombined,
  expandSingleNode,
  suggestChildNodes,
} from './progressive.generator.js'
import { calculateMetrics } from '../utils/validate.js'
import { detectLang } from '../utils/prompts.js'
import dotenv from 'dotenv'
dotenv.config()

const GEN_MODEL = process.env.OLLAMA_GEN_MODEL || 'qwen2.5:3b'

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function truncateForEmbed(text, maxChars = 2000) {
  return text.length > maxChars ? text.slice(0, maxChars) : text
}

function countNodes(node) {
  if (!node) return 0
  return 1 + (node.children || []).reduce((s, c) => s + countNodes(c), 0)
}

const SYSTEM_PROMPT = `
You are an expert in creating structured mindmaps like XMind.

RULES:
- Output ONLY valid JSON
- Minimum depth: 3 levels (root -> main -> sub -> detail)
- Each node must have:
  - title (short)
  - children (if any)
- Each main branch must have 3-6 children
- Use clear hierarchy, not flat list
- Avoid generic titles like "Introduction"
- Add meaningful details

FORMAT:
{
  "title": "...",
  "children": [...]
}
`;

function normalizeTree(node, level = 0) {
  if (!node.children || node.children.length === 0) {
    if (level < 2) {
      node.children = [{ title: "Expand...", children: [] }]
    }
  }

  node.children?.forEach(child => normalizeTree(child, level + 1))
  return node
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: generateFromPdf
// Orchestrates: extract → chunk → embed → store → generate
// Optional: userPrompt for combined mode (PDF + Prompt)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateFromPdf(fileBuffer, filename, mindmapId, userPrompt = null) {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`[AI] generateFromPdf — ${filename}`)
  if (userPrompt) console.log(`[AI] Combined mode — user prompt: "${userPrompt.slice(0, 60)}"`)
  console.log('='.repeat(50))
  const t0 = Date.now()

  const title = filename.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').trim()

  // 1. Extract text with layout info
  const { pagesData } = await extractTextFromPDF(fileBuffer)
  console.log(`[AI] Extracted ${pagesData.length} pages`)

  // Check for scanned/empty PDF
  const totalText = pagesData.reduce((s, p) => s + (p.text?.length || 0), 0)
  if (totalText < 300) {
    return {
      ok: false,
      error: 'PDF appears to be scanned/image-based. Please use a text-based PDF.',
      mindmap: null,
      chunks: [],
      meta: { totalChunks: 0, genModel: GEN_MODEL },
    }
  }

  // 2. Adaptive chunking — structure-aware when possible
  const { chunkText, chunkByStructure, analyzeStructure } = await import('./pdfExtractor.js')
  const structureInfo = analyzeStructure(pagesData)
  const rawChunks = structureInfo.isStructured
    ? chunkByStructure(pagesData, structureInfo)
    : chunkText(pagesData, { maxChunkSize: 1200, overlap: 200 })
  console.log(`[AI] ${rawChunks.length} chunks (structured: ${structureInfo.isStructured}, type: ${structureInfo.docType})`)

  // 3. Embed all chunks
  console.log('[AI] Embedding chunks...')
  const embeddings = await embedBatchSafe(
    rawChunks.map(c => truncateForEmbed(c.text)),
    64
  )

  // 4. Store in MongoDB (clear old, insert new)
  await PDFChunk.deleteMany({ mindmapId })
  const saved = await PDFChunk.insertMany(
    rawChunks.map((c, i) => ({
      mindmapId,
      text: c.text,
      pageNum: c.pageNum,
      chunkIndex: i,
      embedding: embeddings[i] || [],
    }))
  )
  console.log(`[AI] Stored ${saved.length} chunks`)

  // 5. Generate mindmap
  let mindmap
  if (userPrompt?.trim()) {
    // Combined mode: respect user intent while using PDF content
    mindmap = await generateCombined(userPrompt.trim(), pagesData, saved, title, mindmapId)
  } else {
    // PDF-only mode
    mindmap = await generateFromPdfProgressive(pagesData, saved, title, mindmapId)
  }

  if (!mindmap?.root) {
    return {
      ok: false,
      error: 'Could not generate a meaningful mindmap from this document.',
      mindmap: null,
      chunks: saved.map(c => ({ _id: c._id, text: c.text, pageNum: c.pageNum, chunkIndex: c.chunkIndex })),
      meta: { totalChunks: saved.length, genModel: GEN_MODEL },
    }
  }

  // 6. Quality metrics
  const rawPdfText = saved.map(c => c.text).join(' ')
  try {
    const report = calculateMetrics(mindmap, rawPdfText, filename)
    console.log('\n[AI] Quality Report:', report.status)
    console.log('  Coverage:', report.metrics.coverage)
    console.log('  Depth:', report.metrics.depth)
    console.log('  Total nodes:', report.metrics.total_nodes)
  } catch (_) {}

  const totalNodes = countNodes(mindmap.root)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n[AI] Done in ${elapsed}s — ${totalNodes} nodes, ${saved.length} chunks`)
  console.log('='.repeat(50) + '\n')

  return {
    ok: true,
    mindmap,
    chunks: saved.map(c => ({ _id: c._id, text: c.text, pageNum: c.pageNum, chunkIndex: c.chunkIndex })),
    meta: {
      totalChunks: saved.length,
      totalNodes,
      genModel: GEN_MODEL,
      lang: detectLang(rawPdfText.slice(0, 1000)),
      hasUserPrompt: !!userPrompt,
      elapsedSeconds: parseFloat(elapsed),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: generateFromPrompt
// ─────────────────────────────────────────────────────────────────────────────

export async function generateFromPrompt(promptText) {
  console.log(`\n[AI] generateFromPrompt — "${promptText.slice(0, 60)}"`)
  const t0 = Date.now()

  const mindmap = await generateFromPromptProgressive(promptText)

  if (!mindmap?.root) throw new Error('Could not generate mindmap from prompt')

  const totalNodes = countNodes(mindmap.root)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[AI] Prompt done in ${elapsed}s — ${totalNodes} nodes`)

  return {
    ok: true,
    mindmap,
    groundingSources: [],
    meta: { totalNodes, genModel: GEN_MODEL, elapsedSeconds: parseFloat(elapsed) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESSIVE API: expand node on demand
// ─────────────────────────────────────────────────────────────────────────────

export async function expandNode(nodeText, parentChain, mindmapId, lang) {
  console.log(`[AI] expandNode — "${nodeText}"`)
  const children = await expandSingleNode({ nodeText, parentChain, mindmapId, lang })
  return { ok: true, children }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUGGEST NODES
// ─────────────────────────────────────────────────────────────────────────────

export async function suggestNodes(context) {
  const {
    currentNode,
    parentNodes = [],
    siblings = [],
    mindmapId,
  } = context

  const suggestions = await suggestChildNodes({
    nodeText: currentNode,
    parentChain: parentNodes,
    siblings,
    mindmapId,
  })

  return suggestions
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE CHUNKS
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteChunks(mindmapId) {
  const res = await PDFChunk.deleteMany({ mindmapId })
  return res.deletedCount
}