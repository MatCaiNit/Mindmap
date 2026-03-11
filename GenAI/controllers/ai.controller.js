import PDFChunk from '../models/PDFChunk.js'
import { extractTextFromPDF, chunkText } from '../services/pdfExtractor.js'
import { embedBatch } from '../services/embedder.js'
import { retrieveRelevantChunks } from '../services/retriever.js'
import { generateMindmapFromText, generateMindmapFromContext, suggestNodes } from '../services/ai.service.js'

export async function generateMindmap(req, res) {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'Missing text' })
    const structure = await generateMindmapFromText(text)
    res.json({ ok: true, structure })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function generateFromPdf(req, res) {
  try {
    const { mindmapId, filename } = req.body
    if (!req.file)    return res.status(400).json({ error: 'Missing PDF' })
    if (!mindmapId)   return res.status(400).json({ error: 'Missing mindmapId' })

    // 1. Extract
    const { text, pages } = await extractTextFromPDF(req.file.buffer)

    // 2. Chunk
    const rawChunks = chunkText(text, { chunkSize: 400, overlap: 80 })

    // 3. Xóa chunks cũ
    await PDFChunk.deleteMany({ mindmapId })

    // 4. Embed theo batch
    const BATCH = 10
    const saved = []
    for (let i = 0; i < rawChunks.length; i += BATCH) {
      const batch      = rawChunks.slice(i, i + BATCH)
      const embeddings = await embedBatch(batch)
      const docs = batch.map((text, j) => ({
        mindmapId,
        text,
        embedding:  embeddings[j],
        chunkIndex: i + j,
        metadata:   { filename, pageEstimate: Math.floor((i+j) * pages / rawChunks.length) + 1 }
      }))
      saved.push(...await PDFChunk.insertMany(docs))
      console.log(`Embedded ${Math.min(i + BATCH, rawChunks.length)}/${rawChunks.length}`)
    }

    // 5. Generate mindmap từ top chunks
    const topChunks = saved.slice(0, 15)
    const structure = await generateMindmapFromContext(topChunks)

    res.json({ ok: true, structure, meta: { filename, pages, totalChunks: rawChunks.length } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function suggest(req, res) {
  try {
    const result = await suggestNodes(req.body.context)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function deleteChunks(req, res) {
  try {
    const { mindmapId } = req.params
    const result = await PDFChunk.deleteMany({ mindmapId })
    res.json({ ok: true, deleted: result.deletedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}