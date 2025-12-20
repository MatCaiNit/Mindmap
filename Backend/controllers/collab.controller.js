// Backend/controllers/collab.controller.js - UPDATED WITH NOTIFICATION
import Mindmap from '../models/Mindmap.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';

export async function addCollaborator(req, res) {
  try {
    const { mindmapId } = req.params;
    const { email, role } = req.body;
    
    const mm = await Mindmap.findById(mindmapId);
    if (!mm) return res.status(404).json({ message: 'Mindmap not found' });
    if (mm.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only owner can add collaborators' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if ((mm.collaborators || []).some(c => c.userId.toString() === user._id.toString())) {
      return res.status(400).json({ message: 'Already a collaborator' });
    }
    
    // 🔥 CREATE NOTIFICATION instead of direct add
    const existingNotif = await Notification.findOne({
      type: 'collaboration_invite',
      toUser: user._id,
      mindmap: mm._id,
      status: 'pending'
    });
    
    if (existingNotif) {
      return res.status(400).json({ message: 'Invitation already sent' });
    }
    
    await Notification.create({
      type: 'collaboration_invite',
      toUser: user._id,
      fromUser: req.user.id,
      mindmap: mm._id,
      role: role || 'viewer',
      message: `${mm.title} - Collaboration invite`
    });
    
    await AuditLog.create({
      mindmapId: mm._id,
      userId: req.user.id,
      action: 'invite-collaborator',
      detail: { email, role, userId: user._id }
    });
    
    res.json({ ok: true, message: 'Invitation sent successfully' });
  } catch (err) { 
    res.status(500).json({ message: err.message }); 
  }
}

export async function listCollaborators(req, res) {
  try {
    const { mindmapId } = req.params;
    const mm = await Mindmap.findById(mindmapId)
      .populate('ownerId', 'email name avatarUrl')
      .populate('collaborators.userId', 'email name avatarUrl');
    
    if (!mm) return res.status(404).json({ message: 'Not found' });
    
    const result = {
      owner: {
        userId: mm.ownerId,
        role: 'owner'
      },
      collaborators: mm.collaborators || []
    };
    
    res.json({ ok: true, ...result });
  } catch (err) { 
    res.status(500).json({ message: err.message }); 
  }
}

export async function removeCollaborator(req, res) {
  try {
    const { mindmapId, userId } = req.params;
    
    const mm = await Mindmap.findById(mindmapId);
    if (!mm) return res.status(404).json({ message: 'Mindmap not found' });
    
    if (mm.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only owner can remove collaborators' });
    }
    
    if (userId === mm.ownerId.toString()) {
      return res.status(400).json({ message: 'Cannot remove owner' });
    }
    
    const initialLength = mm.collaborators.length;
    mm.collaborators = mm.collaborators.filter(
      c => c.userId.toString() !== userId
    );
    
    if (mm.collaborators.length === initialLength) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }
    
    await mm.save();
    
    await AuditLog.create({
      mindmapId: mm._id,
      userId: req.user.id,
      action: 'remove-collaborator',
      detail: { removedUserId: userId }
    });
    
    res.json({ ok: true, message: 'Collaborator removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function updateCollaboratorRole(req, res) {
  try {
    const { mindmapId, userId } = req.params;
    const { role } = req.body;
    
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    const mm = await Mindmap.findById(mindmapId);
    if (!mm) return res.status(404).json({ message: 'Mindmap not found' });
    
    if (mm.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only owner can update roles' });
    }
    
    const collab = mm.collaborators.find(c => c.userId.toString() === userId);
    if (!collab) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }
    
    collab.role = role;
    await mm.save();
    
    await AuditLog.create({
      mindmapId: mm._id,
      userId: req.user.id,
      action: 'update-collaborator-role',
      detail: { userId, newRole: role }
    });
    
    res.json({ ok: true, message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}