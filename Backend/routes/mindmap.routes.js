import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireMindmapAccess } from '../middlewares/rbac.middleware.js';
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
  servePdfFile
} from '../controllers/mindmap.controller.js';
import { 
  getVersion,
  listVersions, 
  restoreVersion, 
  saveManualVersion 
} from '../controllers/version.controller.js';
import multer from 'multer'

const router = express.Router();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(new Error('Only PDF files allowed'), false)
  }
})

// Tất cả routes cần auth
router.use(authMiddleware);

// CRITICAL: Đặt routes cụ thể TRƯỚC routes có params
// Version routes (đặt trước /:id)
router.post('/:id/versions/save', requireMindmapAccess('write'), saveManualVersion);  // POST /api/mindmaps/:id/versions/save
router.get('/:id/versions', listVersions);                                    // GET  /api/mindmaps/:id/versions

router.get('/:id/versions/:versionId', getVersion);                           // GET  /api/mindmaps/:id/versions/:versionId
router.post('/:id/versions/:versionId/restore', requireMindmapAccess('write'), restoreVersion); // POST /api/mindmaps/:id/versions/:versionId/restore

// Snapshot routes
router.post('/:id/snapshot', requireMindmapAccess('write'), saveUserSnapshot);
router.post('/:id/restore', requireMindmapAccess('write'), restoreSnapshot);

// Basic CRUD
router.post('/:id/generate-from-pdf', pdfUpload.single('pdf'), generateFromPdf);
router.post('/:id/generate-from-prompt', generateFromPrompt)
router.post('/:id/ai-suggest',           aiSuggest) 
router.get('/:id/pdf-file', servePdfFile);

router.post('/', createMindmap);                // POST /api/mindmaps
router.get('/', listMyMindmaps);                // GET  /api/mindmaps
router.get('/:id', getMindmap);                 // GET  /api/mindmaps/:id
router.put('/:id', updateMindmap);              // PUT  /api/mindmaps/:id
router.delete('/:id', deleteMindmap);           // DELETE /api/mindmaps/:id



export default router;