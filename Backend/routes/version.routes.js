// Backend/routes/version.routes.js
import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { listVersions } from '../controllers/version.controller.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/:id/versions', listVersions);

export default router;
