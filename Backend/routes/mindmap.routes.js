// Backend/routes/mindmap.routes.js
import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireMindmapAccess } from '../middlewares/rbac.middleware.js';
import { createMindmap, listMyMindmaps, getMindmap, updateMindmap, deleteMindmap, saveUserSnapshot, restoreSnapshot, getRealtimeSnapshot, saveRealtimeSnapshot, verifyMindmapAccess } from '../controllers/mindmap.controller.js';
import { requireServiceToken } from '../middlewares/realtime.middleware.js';

const router = express.Router();


// --- SERVICE ROUTES (Realtime Server gọi) ---
// Chú ý: Param ở đây là :id nhưng trong controller ta hiểu nó là ydocId
router.get('/internal/:id/snapshot', requireServiceToken, getRealtimeSnapshot);
router.post('/internal/:id/snapshot', requireServiceToken, saveRealtimeSnapshot);
router.post('/internal/:id/verify-access', requireServiceToken, verifyMindmapAccess);

router.use(authMiddleware);

router.post('/', createMindmap);
router.get('/', listMyMindmaps);
router.get('/:id', getMindmap);
router.put('/:id', updateMindmap);
router.delete('/:id', deleteMindmap);

router.post('/:id/snapshot', requireMindmapAccess('write'), saveUserSnapshot);
router.post('/:id/restore', requireMindmapAccess('read'), restoreSnapshot);



export default router;
