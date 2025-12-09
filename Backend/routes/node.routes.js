import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { createNode, getNodesByMindmap, getNode, updateNode, deleteNode } from '../controllers/node.controller.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/', createNode);
router.get('/mindmap/:mindmapId', getNodesByMindmap);
router.get('/:nodeId', getNode);
router.put('/:nodeId', updateNode);
router.delete('/:nodeId', deleteNode);

export default router;
