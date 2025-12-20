// Backend/routes/auth.routes.js - UPDATED WITH PROFILE ENDPOINTS
import express from 'express';
import multer from 'multer';
import { 
  register, 
  login, 
  refresh,
  getProfile,
  updateProfile,
  updatePassword
} from '../controllers/auth.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Multer config for avatar upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Public routes
router.post('/register', upload.single('avatar'), register);
router.post('/login', login);
router.post('/refresh', refresh);

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, upload.single('avatar'), updateProfile);
router.put('/password', authMiddleware, updatePassword);

export default router;