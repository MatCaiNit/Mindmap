// Backend/routes/internal.routes.js
// Service routes cho Realtime Server - KHÔNG cần JWT token
import express from 'express';
import { requireServiceToken } from '../middlewares/realtime.middleware.js';
import { 
  getRealtimeSnapshot, 
  saveRealtimeSnapshot, 
  verifyMindmapAccess 
} from '../controllers/mindmap.controller.js';

const router = express.Router();


// --- SERVICE ROUTES (Realtime Server gọi) ---
// Chú ý: Param ở đây là :id nhưng trong controller ta hiểu nó là ydocId

// Tất cả routes ở đây chỉ cần x-service-token, KHÔNG cần Authorization Bearer
router.get('/mindmaps/:id/snapshot', requireServiceToken, getRealtimeSnapshot);
router.post('/mindmaps/:id/snapshot', requireServiceToken, saveRealtimeSnapshot);
router.post('/mindmaps/:id/verify-access', requireServiceToken, verifyMindmapAccess);

export default router;