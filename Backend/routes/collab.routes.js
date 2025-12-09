import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { addCollaborator, listCollaborators } from '../controllers/collab.controller.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/:mindmapId/add', addCollaborator);
router.get('/:mindmapId/list', listCollaborators);

export default router;
