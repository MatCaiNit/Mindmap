import Mindmap from '../models/Mindmap.js';
import Version from '../models/Version.js';
import AuditLog from '../models/AuditLog.js';
import { nanoid } from 'nanoid';
import { checkMindmapAccess } from '../services/access.service.js';

export async function createMindmap(req, res) {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ message: 'Missing title' });
    const ownerId = req.user.id;
    const ydocId = nanoid(12);
    const mm = await Mindmap.create({ title, description: description || '', ownerId, ydocId, collaborators: [] });
    await AuditLog.create({ mindmapId: mm._id, userId: ownerId, action: 'create-mindmap', detail: { title: mm.title } });
    res.status(201).json({ ok: true, mindmap: mm });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function listMyMindmaps(req, res) {
  try {
    const userId = req.user.id;
    const list = await Mindmap.find({ $or: [{ ownerId: userId }, { 'collaborators.userId': userId }] }).sort({ updatedAt: -1 }).lean();
    res.json({ ok: true, list });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function getMindmap(req, res) {
  try {
    const { id } = req.params;
    const role = await checkMindmapAccess(req.user.id, id, 'read');
    if (!role) return res.status(403).json({ message: 'Permission denied' });
    const mm = await Mindmap.findById(id).populate('ownerId', 'email name avatarUrl').populate('collaborators.userId', 'email name avatarUrl').lean();
    if (!mm) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true, mindmap: mm, access: role });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function updateMindmap(req, res) {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    const mm = await Mindmap.findById(id);
    if (!mm) return res.status(404).json({ message: 'Not found' });
    if (mm.ownerId.toString() !== req.user.id) return res.status(403).json({ message: 'Only owner can update metadata' });
    mm.title = title ?? mm.title;
    mm.description = description ?? mm.description;
    await mm.save();
    await AuditLog.create({ mindmapId: mm._id, userId: req.user.id, action: 'update-mindmap', detail: { title: mm.title } });
    res.json({ ok: true, mindmap: mm });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function deleteMindmap(req, res) {
  try {
    const { id } = req.params;
    const mm = await Mindmap.findById(id);
    if (!mm) return res.status(404).json({ message: 'Not found' });
    if (mm.ownerId.toString() !== req.user.id) return res.status(403).json({ message: 'Only owner can delete mindmap' });
    if (mm.snapshot) await Version.create({ mindmapId: mm._1d, snapshot: mm.snapshot });
    await AuditLog.create({ mindmapId: mm._id, userId: req.user.id, action: 'delete-mindmap', detail: { title: mm.title } });
    await mm.deleteOne();
    res.json({ ok: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function saveSnapshot(req, res) {
  try {
    const { id } = req.params;
    const { snapshot } = req.body;
    if (!snapshot) return res.status(400).json({ message: 'Missing snapshot' });
    const role = await checkMindmapAccess(req.user.id, id, 'write');
    if (!role) return res.status(403).json({ message: 'Permission denied' });
    const mm = await Mindmap.findById(id);
    if (!mm) return res.status(404).json({ message: 'Not found' });
    const buf = Buffer.from(snapshot, 'base64');
    mm.snapshot = buf;
    await mm.save();
    await Version.create({ mindmapId: mm._id, snapshot: buf });
    await AuditLog.create({ mindmapId: mm._id, userId: req.user.id, action: 'save-snapshot', detail: { size: buf.length } });
    res.json({ ok: true, message: 'Snapshot saved' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}
