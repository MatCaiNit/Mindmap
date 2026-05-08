// Backend/controllers/mindmap.stream.controller.js
// Proxy: Frontend → Backend → GenAI (SSE passthrough)
// Keeps auth/RBAC on Backend, lets GenAI stay internal

import Mindmap from '../models/Mindmap.js'
import { checkMindmapAccess } from '../services/access.service.js'
import AuditLog from '../models/AuditLog.js'
import multer from 'multer'
import fetch from 'node:http'  // use built-in - no extra dep

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDF files allowed'), false)
  },
})

export const pdfStreamUpload = pdfUpload.single('pdf')

/**
 * POST /api/mindmaps/:id/generate-stream
 * Validates access → proxies multipart to GenAI SSE endpoint → pipes response to client
 */
export async function generateStreamProxy(req, res) {
  try {
    const { id } = req.params

    // 1. Auth check
    const mm = await Mindmap.findById(id)
    if (!mm) return res.status(404).json({ message: 'Mindmap not found' })

    const role = await checkMindmapAccess(req.user.id, id, 'write')
    if (!role) return res.status(403).json({ message: 'Permission denied' })

    // 2. Forward request to GenAI as multipart
    const AI_URL = process.env.AI_GATEWAY_URL || 'http://localhost:4000'
    const targetUrl = `${AI_URL}/ai/generate-stream`

    // Rebuild FormData for the GenAI service
    const { default: FormData } = await import('form-data')
    const form = new FormData()

    form.append('mindmapId', id)
    if (req.body.prompt)     form.append('prompt', req.body.prompt)
    if (req.body.userPrompt) form.append('userPrompt', req.body.userPrompt)
    if (req.body.mode)       form.append('mode', req.body.mode)
    if (req.body.filename)   form.append('filename', req.body.filename)

    if (req.file) {
      form.append('pdf', req.file.buffer, {
        filename: req.file.originalname || 'document.pdf',
        contentType: 'application/pdf',
      })
    }

    // 3. SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const send = (obj) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`)
    }

    // 4. Call GenAI and pipe SSE
    const { default: axios } = await import('axios')
    const genRes = await axios.post(targetUrl, form, {
      headers: form.getHeaders(),
      responseType: 'stream',
      timeout: 600_000,
    })

    // Pipe GenAI SSE → client
    genRes.data.on('data', chunk => {
      if (!res.writableEnded) res.write(chunk)
    })

    genRes.data.on('end', async () => {
      // Audit log
      try {
        await AuditLog.create({
          mindmapId: mm._id,
          userId: req.user.id,
          action: 'generate-stream',
          detail: { mode: req.body.mode || 'prompt', hasFile: !!req.file },
        })
      } catch (_) {}
      if (!res.writableEnded) res.end()
    })

    genRes.data.on('error', (err) => {
      send({ type: 'error', message: err.message })
      if (!res.writableEnded) res.end()
    })

    req.on('close', () => genRes.data.destroy())

  } catch (err) {
    console.error('[StreamProxy] error:', err.message)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
      res.end()
    }
  }
}