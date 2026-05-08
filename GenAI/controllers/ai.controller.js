// GenAI/controllers/ai.controller.js
// Fixed: proper named import, stream SSE, source routing

import {
  generateFromPdf,
  generateFromPrompt,
  expandNode,
  suggestNodes,
  deleteChunks,
} from '../services/ai.service.js'
import { streamMindmapGeneration } from '../services/stream.generator.js'
import { extractTextFromPDF, analyzeStructure, chunkText, chunkByStructure } from '../services/pdfExtractor.js'
import { embedBatchSafe } from '../services/embedder.js'
import PDFChunk from '../models/PDFChunk.js'
import { detectLang } from '../utils/prompts.js'
import multer from 'multer'

// ── POST /ai/generate-from-pdf ────────────────────────────────────────────
export async function generateFromPdfController(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing PDF file' })
    const mindmapId  = req.body.mindmapId
    const filename   = req.body.filename || req.file.originalname || 'document.pdf'
    const userPrompt = (req.body.userPrompt || req.body.prompt || '').trim() || null
    if (!mindmapId) return res.status(400).json({ error: 'Missing mindmapId' })
    console.log(`[Controller] generate-from-pdf: ${filename}`)
    const result = await generateFromPdf(req.file.buffer, filename, mindmapId, userPrompt)
    res.json(result)
  } catch (err) {
    console.error('[Controller] generateFromPdf error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── POST /ai/generate-from-prompt ────────────────────────────────────────
export async function generateFromPromptController(req, res) {
  try {
    const { prompt, text } = req.body
    const input = (prompt || text || '').trim()
    if (!input) return res.status(400).json({ error: 'Missing prompt' })
    const result = await generateFromPrompt(input)
    res.json(result)
  } catch (err) {
    console.error('[Controller] generateFromPrompt error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── POST /ai/generate-stream ──────────────────────────────────────────────
// SSE endpoint — streams node/edge events as the mindmap is built
// Accepts: multipart/form-data { pdf?: File, mindmapId, prompt?, mode? }
//
// Client receives text/event-stream lines:
//   data: {"type":"status","message":"..."}
//   data: {"type":"node","node":{id,parentId,label,level,side,color,...}}
//   data: {"type":"edge","edge":{id,source,target,...}}
//   data: {"type":"done","totalNodes":42}
//   data: {"type":"error","message":"..."}
export async function generateStreamController(req, res) {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (obj) => {
    if (res.writableEnded) return
    res.write(`data: ${JSON.stringify(obj)}\n\n`)
  }

  const sendError = (message) => {
    send({ type: 'error', message })
    if (!res.writableEnded) res.end()
  }

  try {
    const mindmapId  = req.body.mindmapId
    const userPrompt = (req.body.prompt || req.body.userPrompt || '').trim() || null
    const mode       = req.body.mode || (req.file ? 'pdf' : 'prompt')

    if (!mindmapId) return sendError('Missing mindmapId')

    let pagesData    = null
    let savedChunks  = []
    let title        = userPrompt || 'Mindmap'

    // ── Handle PDF upload ──────────────────────────────────────────────
    if (req.file) {
      send({ type: 'status', message: 'Đang đọc tài liệu PDF...' })

      const { pagesData: pages } = await extractTextFromPDF(req.file.buffer)
      pagesData = pages

      const filename = (req.body.filename || req.file.originalname || 'document.pdf')
        .replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').trim()
      title = userPrompt || filename

      const totalText = pages.reduce((s, p) => s + (p.text?.length || 0), 0)
      if (totalText < 300) {
        return sendError('PDF dường như là bản scan/ảnh. Hãy dùng PDF có text thực.')
      }

      send({ type: 'status', message: 'Tạo embeddings...' })

      const struct = analyzeStructure(pages)
      const rawChunks = struct.isStructured
        ? chunkByStructure(pages, struct)
        : chunkText(pages, { maxChunkSize: 1200, overlap: 200 })

      console.log(`[Stream] ${rawChunks.length} chunks, structured: ${struct.isStructured}`)

      const embeddings = await embedBatchSafe(
        rawChunks.map(c => (c.text || '').slice(0, 2000)),
        64
      )

      await PDFChunk.deleteMany({ mindmapId })
      const saved = await PDFChunk.insertMany(
        rawChunks.map((c, i) => ({
          mindmapId,
          text:       c.text,
          pageNum:    c.pageNum,
          chunkIndex: i,
          embedding:  embeddings[i] || [],
        }))
      )

      savedChunks = saved.map(s => ({
        text:       s.text,
        pageNum:    s.pageNum,
        chunkIndex: s.chunkIndex,
        embedding:  s.embedding,
      }))

      send({ type: 'status', message: `Đã index ${savedChunks.length} đoạn văn bản` })

    } else {
      // Prompt-only or combined — load existing chunks if any
      const existing = await PDFChunk.find({ mindmapId })
        .select('text pageNum chunkIndex embedding')
        .lean()
      if (existing.length > 0) {
        savedChunks = existing
        send({ type: 'status', message: `Dùng ${savedChunks.length} đoạn đã lưu` })
      }
    }

    // ── Stream generation ──────────────────────────────────────────────
    const stream = streamMindmapGeneration({
      title,
      pagesData,
      savedChunks,
      mindmapId,
      userPrompt,
      mode,
    })

    for await (const event of stream) {
      send(event)
      if (event.type === 'done' || event.type === 'error') break
    }

    if (!res.writableEnded) res.end()

  } catch (err) {
    console.error('[Controller] generateStream error:', err)
    sendError(err.message || 'Generation failed')
  }
}

// ── POST /ai/expand-node ─────────────────────────────────────────────────
export async function expandNodeController(req, res) {
  try {
    const { nodeText, parentChain, mindmapId, lang } = req.body
    if (!nodeText?.trim()) return res.status(400).json({ error: 'Missing nodeText' })
    const result = await expandNode(nodeText.trim(), Array.isArray(parentChain) ? parentChain : [], mindmapId || null, lang || null)
    res.json(result)
  } catch (err) {
    console.error('[Controller] expandNode error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── POST /ai/suggest ─────────────────────────────────────────────────────
export async function suggestController(req, res) {
  try {
    const { context } = req.body
    if (!context) return res.status(400).json({ error: 'Missing context' })
    const suggestions = await suggestNodes(context)
    res.json({ ok: true, suggestions })
  } catch (err) {
    console.error('[Controller] suggest error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── DELETE /ai/chunks/:mindmapId ────────────────────────────────────────
export async function deleteChunksController(req, res) {
  try {
    const count = await deleteChunks(req.params.mindmapId)
    res.json({ ok: true, deleted: count })
  } catch (err) {
    console.error('[Controller] deleteChunks error:', err)
    res.status(500).json({ error: err.message })
  }
}

// Legacy alias
export async function generateMindmapController(req, res) {
  req.body.prompt = req.body.text || req.body.prompt
  return generateFromPromptController(req, res)
}