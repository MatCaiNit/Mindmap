// Backend/controllers/collab.controller.js
import Mindmap from '../models/Mindmap.js';
import User from '../models/User.js';

export async function addCollaborator(req, res) {
  try {
    const { mindmapId } = req.params;
    const { email, role } = req.body;
    const mm = await Mindmap.findById(mindmapId);
    if (!mm) return res.status(404).json({ message: 'Mindmap not found' });
    if (mm.ownerId.toString() !== req.user.id) return res.status(403).json({ message: 'Only owner' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if ((mm.collaborators || []).some(c=> c.userId.toString() === user._id.toString())) return res.status(400).json({ message: 'Already collaborator' });
    mm.collaborators.push({ userId: user._id, role: role || 'viewer' });
    await mm.save();
    res.json({ ok: true, mm });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function listCollaborators(req, res) {
  try {
    const { mindmapId } = req.params;
    const mm = await Mindmap.findById(mindmapId).populate('collaborators.userId', 'email name');
    if (!mm) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true, collaborators: mm.collaborators || [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
}
