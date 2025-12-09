import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireMindmapAccess } from '../middlewares/rbac.middleware.js';
import { createMindmap, listMyMindmaps, getMindmap, updateMindmap, deleteMindmap, saveSnapshot } from '../controllers/mindmap.controller.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/', createMindmap);
router.get('/', listMyMindmaps);
router.get('/:id', getMindmap);
router.put('/:id', updateMindmap);
router.delete('/:id', deleteMindmap);
router.post('/:id/snapshot', requireMindmapAccess('write'), saveSnapshot);

export default router;
