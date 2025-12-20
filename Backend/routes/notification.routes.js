// Backend/routes/notification.routes.js
import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  acceptCollaboration,
  rejectCollaboration,
  getUnreadCount
} from '../controllers/notification.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/', listNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.post('/:id/accept', acceptCollaboration);
router.post('/:id/reject', rejectCollaboration);

export default router;