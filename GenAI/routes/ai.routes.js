// GenAI/routes/ai.routes.js
// Changes: + POST /ai/generate-from-prompt route

import express from 'express'
import multer  from 'multer'
import {
  generateFromPdfController,
  generateFromPromptController,
  generateMindmapController,
  suggestController,
  deleteChunksController,
} from '../controllers/ai.controller.js'

const router = express.Router()

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(new Error('Only PDF files allowed'))
  },
})

// Generate mindmap from PDF (RAG pipeline)
router.post('/generate-from-pdf', pdfUpload.single('pdf'), generateFromPdfController)

// NEW — Generate mindmap from text prompt (Gemini + optional search grounding)
router.post('/generate-from-prompt', generateFromPromptController)

// Legacy alias — kept for backward compat
router.post('/generate-mindmap', generateMindmapController)

// AI node suggestions
router.post('/suggest', suggestController)

// Cleanup PDF chunks for a mindmap
router.delete('/chunks/:mindmapId', deleteChunksController)

export default router