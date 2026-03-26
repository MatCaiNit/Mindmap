// GenAI/services/ai.service.js

import { GoogleGenerativeAI } from '@google/generative-ai'
import PDFChunk from '../models/PDFChunk.js'
import { extractTextFromPDF, chunkText } from './pdfExtractor.js'
import { embedText, embedBatch } from './embedder.js'
import { cosineSimilarity } from '../utils/validate.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const GENERATION_MODEL  = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const TOP_K             = 5
const MAX_CHUNK_IN_PROMPT = 380

// ── HELPERS ──────────────────────────────────────────────────────────────────

function parseJSON(raw) {
  const clean = raw.replace(/```json|```/g, '').trim()
  try { return JSON.parse(clean) } catch (_) {
    const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (m) return JSON.parse(m[0])
    throw new Error('AI returned invalid JSON')
  }
}

async function getModel(useSearch = false) {
  if (useSearch && process.env.GEMINI_SEARCH_GROUNDING === 'true') {
    return genAI.getGenerativeModel({
      model: GENERATION_MODEL,
      tools: [{ googleSearch: {} }],
    })
  }
  return genAI.getGenerativeModel({ model: GENERATION_MODEL })
}

async function retrieveRelevant(mindmapId, query, k = TOP_K) {
  const queryVec = await embedText(query, 'RETRIEVAL_QUERY')
  const all = await PDFChunk.find({ mindmapId })
    .select('text pageNum chunkIndex embedding')
    .lean()

  const scored = all.map(c => ({
    ...c,
    score: cosineSimilarity(queryVec, c.embedding),
  }))
  scored.sort((a, b) => b.score - a.score)

  const selected = []
  for (const c of scored) {
    if (selected.length >= k) break
    const isDup = selected.some(
      s => Math.abs(s.score - c.score) < 0.03 && s.pageNum === c.pageNum
    )
    if (!isDup) selected.push(c)
  }
  return selected
}

// ── 1. GENERATE FROM PDF ─────────────────────────────────────────────────────

export async function generateFromPdf(fileBuffer, filename, mindmapId) {
  console.log(`\n[AI] generateFromPdf — ${filename} (${mindmapId})`)

  // Step 1: extract text per page using pdfExtractor
  const { pagesData } = await extractTextFromPDF(fileBuffer)
  console.log(`[AI]  Extracted ${pagesData.length} pages`)

  // Step 2: chunk using pdfExtractor's chunkText
  const rawChunks = chunkText(pagesData, { chunkSize: 250, overlap: 60 })
  console.log(`[AI]  ${rawChunks.length} chunks`)

  // Step 3: embed in batches of 20
  const BATCH = 20
  const embeddings = []
  for (let i = 0; i < rawChunks.length; i += BATCH) {
    const batch = rawChunks.slice(i, i + BATCH).map(c => c.text)
    const vecs = await embedBatch(batch, 'RETRIEVAL_DOCUMENT')
    embeddings.push(...vecs)
  }

  // Step 4: persist chunks
  await PDFChunk.deleteMany({ mindmapId })
  const saved = await PDFChunk.insertMany(
    rawChunks.map((c, idx) => ({
      mindmapId,
      text:       c.text,
      pageNum:    c.pageNum,
      chunkIndex: idx,
      embedding:  embeddings[idx] || [],
    }))
  )
  console.log(`[AI]  Stored ${saved.length} chunks`)

  // Step 5: retrieve top-K relevant to overview
  const overviewQuery = pagesData.slice(0, 2).map(p => p.text.slice(0, 200)).join(' ')
  const topChunks = await retrieveRelevant(mindmapId, overviewQuery, TOP_K)

  // Step 6: generate mindmap
  const contextStr = topChunks
    .map(c => `[${c.chunkIndex}|p${c.pageNum}] ${c.text.slice(0, MAX_CHUNK_IN_PROMPT)}`)
    .join('\n---\n')

  const prompt = `You are a mindmap generator. Given these document excerpts (format: [chunkIdx|pageN] text):

${contextStr}

Create a hierarchical mindmap JSON for "${filename}". Rules:
- 4-6 main branches, max 3 depth levels
- Each node: "text" (concise), "sourceChunk" (integer chunk index above, or null)
- Return ONLY valid JSON, no markdown

JSON schema:
{"root":{"text":"string","children":[{"text":"string","sourceChunk":0,"children":[{"text":"string","sourceChunk":null}]}]}}`

  const model = await getModel(false)
  const result = await model.generateContent(prompt)
  const raw = result.response.text()
  console.log(`[AI]  Raw response length: ${raw.length}`)

  const mindmap = parseJSON(raw)

  return {
    ok: true,
    mindmap,
    chunks: saved.map(c => ({
      _id:        c._id,
      text:       c.text,
      pageNum:    c.pageNum,
      chunkIndex: c.chunkIndex,
    })),
    meta: { totalChunks: saved.length, usedChunks: topChunks.length },
  }
}

// ── 2. GENERATE FROM PROMPT ──────────────────────────────────────────────────

export async function generateFromPrompt(promptText) {
  console.log(`\n[AI] generateFromPrompt — "${promptText.slice(0, 80)}..."`)

  const model = await getModel(true)

  const prompt = `Create a comprehensive mindmap about: "${promptText}"

Rules:
- 4-6 main branches, 2-4 sub-nodes each, max 3 depth levels
- For each node, if you know a reliable web source add it (title + URL)
- Set "aiGenerated": true on every node
- Return ONLY valid JSON, no markdown

JSON schema:
{"root":{"text":"string","aiGenerated":true,"children":[{"text":"string","aiGenerated":true,"sources":[{"title":"string","url":"string"}],"children":[{"text":"string","aiGenerated":true,"sources":[]}]}]}}`

  const result = await model.generateContent(prompt)
  const raw = result.response.text()

  let groundingSources = []
  try {
    const meta = result.response.candidates?.[0]?.groundingMetadata
    if (meta?.groundingChunks) {
      groundingSources = meta.groundingChunks
        .filter(c => c.web?.uri)
        .map(c => ({ title: c.web.title || c.web.uri, url: c.web.uri }))
    }
  } catch (_) { /* grounding not available */ }

  const mindmap = parseJSON(raw)

  if (groundingSources.length > 0) {
    attachGroundingSources(mindmap.root, groundingSources)
  }

  return { ok: true, mindmap, groundingSources }
}

function attachGroundingSources(node, sources) {
  if (!node) return
  if (!node.sources?.length && sources.length) node.sources = sources.slice(0, 2)
  ;(node.children || []).forEach(c => attachGroundingSources(c, sources))
}

// ── 3. SUGGEST NODES ─────────────────────────────────────────────────────────

export async function suggestNodes(context) {
  const { currentNode, parentNodes = [], siblings = [] } = context
  console.log(`[AI] suggestNodes — "${currentNode}"`)

  const model = await getModel(false)

  const prompt = `Suggest 5 child mindmap nodes for: "${currentNode}"
Parent chain: ${parentNodes.slice(-3).join(' > ') || 'root'}
Existing siblings: ${siblings.slice(0, 3).join(', ') || 'none'}

Return ONLY a JSON array of 5 objects:
[{"text":"concise label"},...]
No explanation, no markdown.`

  const result = await model.generateContent(prompt)
  const raw = result.response.text()
  const arr = parseJSON(raw)
  return Array.isArray(arr) ? arr : (arr.suggestions || [])
}

// ── 4. DELETE CHUNKS ─────────────────────────────────────────────────────────

export async function deleteChunks(mindmapId) {
  const res = await PDFChunk.deleteMany({ mindmapId })
  return res.deletedCount
}