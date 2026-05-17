import {
  generateFromPdf, generateFromPrompt, expandNode, suggestNodes, deleteChunks,
} from '../services/ai.service.js'
import { dumpTOC,streamMindmapGeneration }       from '../services/stream.generator.js'
import { extractTextFromPDF }            from '../services/pdfExtractor.js'
import { embedBatchSafe }                from '../services/embedder.js'
import { hybridChunk }                   from '../services/chunkingStrategy.js'
import { extractTOCBest }                            from '../utils/tocExtractor.js'
import { detectLang }                    from '../utils/prompts.js'
import PDFChunk                          from '../models/PDFChunk.js'


const pdfBufferCache = new Map()
const PDF_CACHE_TTL  = 12 * 60 * 60 * 1000  // 12 hours

function cachePDF(mindmapId, buffer, filename) {
  // Clean expired entries
  const now = Date.now()
  for (const [id, entry] of pdfBufferCache) {
    if (now - entry.uploadedAt > PDF_CACHE_TTL) pdfBufferCache.delete(id)
  }
  pdfBufferCache.set(mindmapId, { buffer, filename, uploadedAt: now })
  console.log(`[PDFCache] Cached ${mindmapId} (${(buffer.length/1024).toFixed(0)}KB)`)
}


export async function getPdfController(req, res) {
  const { mindmapId } = req.params
  const cached = pdfBufferCache.get(mindmapId)
  if (!cached) {
    return res.status(404).json({
      error: 'PDF not cached. Please re-generate the mindmap from PDF to view the source.',
      cached: false,
    })
  }
  const filename = cached.filename || 'document.pdf'
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.send(cached.buffer)
}


export async function getPdfStatusController(req, res) {
  const { mindmapId } = req.params
  const cached = pdfBufferCache.get(mindmapId)
  if (!cached) return res.json({ cached: false })
  res.json({
    cached: true,
    filename: cached.filename,
    sizeKB: Math.round(cached.buffer.length / 1024),
    uploadedAt: cached.uploadedAt,
  })
}

export async function generateFromPdfController(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing PDF file' })
    const mindmapId  = req.body.mindmapId
    const filename   = req.body.filename || req.file.originalname || 'document.pdf'
    const userPrompt = (req.body.userPrompt || req.body.prompt || '').trim() || null
    if (!mindmapId) return res.status(400).json({ error: 'Missing mindmapId' })
    const result = await generateFromPdf(req.file.buffer, filename, mindmapId, userPrompt)
    res.json(result)
  } catch (err) {
    console.error('[Controller] generateFromPdf:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function generateFromPromptController(req, res) {
  try {
    const { prompt, text } = req.body
    const input = (prompt || text || '').trim()
    if (!input) return res.status(400).json({ error: 'Missing prompt' })
    res.json(await generateFromPrompt(input))
  } catch (err) {
    console.error('[Controller] generateFromPrompt:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function generateStreamController(req, res) {
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (obj) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`)
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

    let pagesData   = null
    let savedChunks = []
    let title       = userPrompt || 'Mindmap'
    let tocChapters = null

    if (req.file) {
      send({ type: 'status', message: 'Reading PDF...' })

      const { pagesData: pages } = await extractTextFromPDF(req.file.buffer)
      pagesData = pages

      const filename = (req.body.filename || req.file.originalname || 'document.pdf')
        .replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').trim()
      title = userPrompt || filename

      const totalText = pages.reduce((s, p) => s + (p.text?.length || 0), 0)
      if (totalText < 150)
        return sendError('PDF appears to be scanned/image-based. Please use a text-based PDF.')

      cachePDF(mindmapId, req.file.buffer, req.file.originalname || filename + '.pdf')

      const lang = detectLang(pages.map(p => p.text || '').join(''))
      send({ type: 'status', message: `↓ Analyzing structure (${pages.length} pages)...` })
      const bestTOC = await extractTOCBest(pages, { lang, targetDepth: 4 })
      if (bestTOC?.chapters?.length >= 2) {
        tocChapters = bestTOC.chapters
        const tagM = (ns) => { for (const n of ns || []) { n._tocMethod = bestTOC.method; tagM(n.children) } }
        tagM(tocChapters)
        console.log(`[Controller] TOC via "${bestTOC.method}": ${tocChapters.length} chapters`)
        dumpTOC(tocChapters, `TOC parsed via "${bestTOC.method}"`)
        send({ type: 'status', message: `↓ Structure: ${tocChapters.length} chapters (${bestTOC.method})` })
      }

      send({ type: 'status', message: '↓ Chunking...' })
      const rawChunks = hybridChunk(pages, tocChapters)
      console.log(`[Controller] ${rawChunks.length} chunks`)

      send({ type: 'status', message: `↓ Embedding ${rawChunks.length} chunks...` })
      const embeddings = await embedBatchSafe(rawChunks.map(c => (c.text||'').slice(0,2000)), 64)

      await PDFChunk.deleteMany({ mindmapId })
      const saved = await PDFChunk.insertMany(
        rawChunks.map((c, i) => ({
          mindmapId, text: c.text, pageNum: c.pageNum, chunkIndex: i,
          sectionTitle: c.sectionTitle || null, embedding: embeddings[i] || [],
        }))
      )
      savedChunks = saved.map(s => ({
        text: s.text, pageNum: s.pageNum, chunkIndex: s.chunkIndex,
        sectionTitle: s.sectionTitle, embedding: s.embedding,
      }))
      send({ type: 'status', message: `↓ ${savedChunks.length} chunks indexed` })

    } else {
      const existing = await PDFChunk.find({ mindmapId })
        .select('text pageNum chunkIndex sectionTitle embedding').lean()
      if (existing.length > 0) {
        savedChunks = existing
        send({ type: 'status', message: `↓ Using ${savedChunks.length} existing chunks` })
      }
    }

    const stream = streamMindmapGeneration({
      title, pagesData, savedChunks, mindmapId, userPrompt, mode, tocChapters,
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

export async function expandNodeController(req, res) {
  try {
    const { nodeText, parentChain, mindmapId, lang } = req.body
    if (!nodeText?.trim()) return res.status(400).json({ error: 'Missing nodeText' })
    res.json(await expandNode(nodeText.trim(), Array.isArray(parentChain)?parentChain:[], mindmapId||null, lang||null))
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function suggestController(req, res) {
  try {
    const { context } = req.body
    if (!context) return res.status(400).json({ error: 'Missing context' })
    res.json({ ok: true, suggestions: await suggestNodes(context) })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function deleteChunksController(req, res) {
  try {
    const count = await deleteChunks(req.params.mindmapId)
    pdfBufferCache.delete(req.params.mindmapId)
    res.json({ ok: true, deleted: count })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function generateMindmapController(req, res) {
  req.body.prompt = req.body.text || req.body.prompt
  return generateFromPromptController(req, res)
}