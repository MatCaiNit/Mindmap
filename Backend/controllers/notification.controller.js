// Backend/controllers/notification.controller.js
import Notification from '../models/Notification.js';
import Mindmap from '../models/Mindmap.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

export async function listNotifications(req, res) {
  try {
    const notifications = await Notification.find({ toUser: req.user.id })
      .populate('fromUser', 'name email avatarUrl')
      .populate('mindmap', 'title')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    res.json({ ok: true, notifications });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOne({
      _id: id,
      toUser: req.user.id
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    notification.read = true;
    await notification.save();
    
    res.json({ ok: true, notification });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function markAllAsRead(req, res) {
  try {
    await Notification.updateMany(
      { toUser: req.user.id, read: false },
      { read: true }
    );
    
    res.json({ ok: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function acceptCollaboration(req, res) {
  try {
    const { id } = req.params;
    const { mindmapId } = req.body;
    
    const notification = await Notification.findOne({
      _id: id,
      toUser: req.user.id,
      type: 'collaboration_invite'
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    if (notification.status !== 'pending') {
      return res.status(400).json({ message: 'Invitation already processed' });
    }
    
    // Add user as collaborator
    const mindmap = await Mindmap.findById(mindmapId);
    if (!mindmap) {
      return res.status(404).json({ message: 'Mindmap not found' });
    }
    
    // Check if already collaborator
    const isAlreadyCollaborator = mindmap.collaborators.some(
      c => c.userId.toString() === req.user.id
    );
    
    if (!isAlreadyCollaborator) {
      mindmap.collaborators.push({
        userId: req.user.id,
        role: notification.role || 'viewer'
      });
      await mindmap.save();
    }
    
    // Update notification
    notification.status = 'accepted';
    notification.read = true;
    await notification.save();
    
    // Log
    await AuditLog.create({
      mindmapId: mindmap._id,
      userId: req.user.id,
      action: 'accept-collaboration',
      detail: { notificationId: notification._id }
    });
    
    res.json({ ok: true, message: 'Collaboration accepted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function rejectCollaboration(req, res) {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOne({
      _id: id,
      toUser: req.user.id,
      type: 'collaboration_invite'
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    if (notification.status !== 'pending') {
      return res.status(400).json({ message: 'Invitation already processed' });
    }
    
    notification.status = 'rejected';
    notification.read = true;
    await notification.save();
    
    res.json({ ok: true, message: 'Collaboration rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function getUnreadCount(req, res) {
  try {
    const count = await Notification.countDocuments({
      toUser: req.user.id,
      read: false
    });
    
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}