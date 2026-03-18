import express from 'express';
import { generateFromPdf} from '../controllers/ai.controller.js';
import multer from 'multer'

const router = express.Router();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'), false)
    }
  }
})

// POST /ai/generate-mindmap
//router.post('/generate-mindmap', generateMindmap);

// POST /ai/suggest
//router.post('/suggest', suggestNode);

router.post('/generate-from-pdf',         upload.single('pdf'), generateFromPdf)
// router.delete('/chunks/:mindmapId',        deleteChunks)
// router.get('/chunks/:mindmapId/node-source', getNodeSource)
export default router;
