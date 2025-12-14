import express from 'express';
import { generateMindmap, suggestNode } from '../controllers/ai.controller.js';

const router = express.Router();

// POST /ai/generate-mindmap
router.post('/generate-mindmap', generateMindmap);

// POST /ai/suggest
router.post('/suggest', suggestNode);

export default router;
