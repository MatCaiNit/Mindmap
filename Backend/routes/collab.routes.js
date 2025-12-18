// Backend/routes/collab.routes.js - UPDATED
import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { 
  addCollaborator, 
  listCollaborators,
  removeCollaborator,
  updateCollaboratorRole
} from '../controllers/collab.controller.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/:mindmapId/add', addCollaborator);
router.get('/:mindmapId/list', listCollaborators);
router.delete('/:mindmapId/remove/:userId', removeCollaborator);
router.patch('/:mindmapId/role/:userId', updateCollaboratorRole);

export default router;