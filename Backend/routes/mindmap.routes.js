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
  verifyMindmapAccess
} from '../controllers/mindmap.controller.js';
import { 
  getVersion,
  listVersions, 
  restoreVersion, 
  saveManualVersion 
} from '../controllers/version.controller.js';

const router = express.Router();

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
router.post('/', createMindmap);                // POST /api/mindmaps
router.get('/', listMyMindmaps);                // GET  /api/mindmaps
router.get('/:id', getMindmap);                 // GET  /api/mindmaps/:id
router.put('/:id', updateMindmap);              // PUT  /api/mindmaps/:id
router.delete('/:id', deleteMindmap);           // DELETE /api/mindmaps/:id

export default router;