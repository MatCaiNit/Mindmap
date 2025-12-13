// Backend/routes/mindmap.routes.js
import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireMindmapAccess } from '../middlewares/rbac.middleware.js';
import { createMindmap, listMyMindmaps, getMindmap, updateMindmap, deleteMindmap, saveUserSnapshot, restoreSnapshot, getRealtimeSnapshot, saveRealtimeSnapshot, verifyMindmapAccess, getVersion } from '../controllers/mindmap.controller.js';


const router = express.Router();


router.use(authMiddleware);

router.post('/', createMindmap);
router.get('/', listMyMindmaps);
router.get('/:id', getMindmap);
router.put('/:id', updateMindmap);
router.delete('/:id', deleteMindmap);

router.post('/:id/snapshot', requireMindmapAccess('write'), saveUserSnapshot);
router.post('/:id/restore', requireMindmapAccess('write'), restoreSnapshot);
router.get('/:id/versions/:versionId', getVersion);




export default router;
