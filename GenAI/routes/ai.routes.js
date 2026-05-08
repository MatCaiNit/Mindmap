// GenAI/routes/ai.routes.js

import express from 'express'
import multer  from 'multer'
import {
  generateFromPdfController,
  generateFromPromptController,
  generateMindmapController,
  expandNodeController,
  suggestController,
  deleteChunksController,
  generateStreamController,
} from '../controllers/ai.controller.js'

const router = express.Router()

// Shared multer for PDF uploads (memory storage, 20MB max)
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.fieldname !== 'pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files allowed'))
    }
  },
})

// ── Core generation ─────────────────────────────────────────────────────────

// POST /ai/generate-from-pdf
router.post('/generate-from-pdf', pdfUpload.single('pdf'), generateFromPdfController)

// POST /ai/generate-from-prompt
router.post('/generate-from-prompt', generateFromPromptController)

// Legacy alias
router.post('/generate-mindmap', generateMindmapController)

// ── Progressive SSE stream ──────────────────────────────────────────────────
// POST /ai/generate-stream
// Body: FormData { pdf?: File, mindmapId: string, prompt?: string, mode?: string }
// Response: text/event-stream
router.post('/generate-stream', pdfUpload.single('pdf'), generateStreamController)

// ── Utility ─────────────────────────────────────────────────────────────────

// POST /ai/expand-node
router.post('/expand-node', expandNodeController)

// POST /ai/suggest
router.post('/suggest', suggestController)

// DELETE /ai/chunks/:mindmapId
router.delete('/chunks/:mindmapId', deleteChunksController)

export default router