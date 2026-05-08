// Backend/routes/mindmap.routes.js
import express from 'express'
import multer  from 'multer'
import { authMiddleware }         from '../middlewares/auth.middleware.js'
import { requireMindmapAccess }   from '../middlewares/rbac.middleware.js'
import {
  createMindmap,
  listMyMindmaps,
  getMindmap,
  updateMindmap,
  deleteMindmap,
  saveUserSnapshot,
  restoreSnapshot,
  verifyMindmapAccess,
  generateFromPdf,
  generateFromPrompt,
  aiSuggest,
  servePdfFile,
} from '../controllers/mindmap.controller.js'
import {
  getVersion,
  listVersions,
  restoreVersion,
  saveManualVersion,
} from '../controllers/version.controller.js'
import { generateStreamProxy, pdfStreamUpload } from '../controllers/mindmap.stream.controller.js'

const router = express.Router()

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(new Error('Only PDF files allowed'), false)
  },
})

// All routes require auth
router.use(authMiddleware)

// ── Version routes (before /:id to avoid param conflicts) ──────────────────
router.post('/:id/versions/save',             requireMindmapAccess('write'), saveManualVersion)
router.get( '/:id/versions',                  listVersions)
router.get( '/:id/versions/:versionId',       getVersion)
router.post('/:id/versions/:versionId/restore', requireMindmapAccess('write'), restoreVersion)

// ── Snapshot routes ────────────────────────────────────────────────────────
router.post('/:id/snapshot', requireMindmapAccess('write'), saveUserSnapshot)
router.post('/:id/restore',  requireMindmapAccess('write'), restoreSnapshot)

// ── AI routes ──────────────────────────────────────────────────────────────
// Legacy non-streaming
router.post('/:id/generate-from-pdf',    pdfUpload.single('pdf'), generateFromPdf)
router.post('/:id/generate-from-prompt', generateFromPrompt)
router.post('/:id/ai-suggest',           aiSuggest)

// Progressive SSE streaming (PDF optional)
router.post('/:id/generate-stream', pdfStreamUpload, generateStreamProxy)

// PDF file serve
router.get('/:id/pdf-file', servePdfFile)

// ── CRUD ───────────────────────────────────────────────────────────────────
router.post('/',    createMindmap)
router.get('/',     listMyMindmaps)
router.get('/:id',  getMindmap)
router.put('/:id',  updateMindmap)
router.delete('/:id', deleteMindmap)

export default router