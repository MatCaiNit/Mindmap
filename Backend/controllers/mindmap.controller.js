// Backend/controllers/mindmap.controller.js
import Mindmap from '../models/Mindmap.js';
import Version from '../models/Version.js';
import AuditLog from '../models/AuditLog.js';
import { nanoid } from 'nanoid';
import { checkMindmapAccess } from '../services/access.service.js';
import { createSnapshotSchema, validateSnapshotSchema } from '../utils/snapshotSchema.js';
import jwt from 'jsonwebtoken'
import axios from 'axios';

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
    if (mm.snapshot) {
      await Version.create({
        mindmapId: mm._id,
        snapshot: mm.snapshot,
        userId: req.user.id,
        type: 'delete-backup',
        label: 'Backup before delete',
        size: mm.snapshot.length
      });
    }
    await AuditLog.create({ mindmapId: mm._id, userId: req.user.id, action: 'delete-mindmap', detail: { title: mm.title } });
    await mm.deleteOne();
    res.json({ ok: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// POST /api/mindmaps/:id/snapshot
export const saveUserSnapshot = async (req, res) => {
  const { id } = req.params; // mindmapId
  const { encodedState } = req.body;

  const mindmap = await Mindmap.findById(id);
  if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });

  const snapshot = createSnapshotSchema(encodedState, {
    createdBy: req.user.id,
    reason: 'manual'
  });

  await Version.create({
    mindmapId: mindmap._id,
    snapshot,
    userId: req.user.id,
    type: 'manual',
    size: Buffer.byteLength(encodedState, 'base64')
  });

  res.json({ ok: true });
};


// POST /api/internal/mindmaps/:ydocId/snapshot
// Called by Realtime Server to save auto-snapshots
export const saveRealtimeSnapshot = async (req, res) => {
  const ydocId = req.params.ydocId || req.params.id;
  const { snapshot } = req.body;

  try {
    const mindmap = await Mindmap.findOne({ ydocId });
    if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });
    
    validateSnapshotSchema(snapshot);
    const size = Buffer.byteLength(snapshot.encodedState, 'base64');

    // 1. Save to Version collection
    await Version.create({
      mindmapId: mindmap._id,
      snapshot,
      type: 'auto',
      size
    });

    // 🔥 CRITICAL FIX: Also update Mindmap.snapshot
    mindmap.snapshot = Buffer.from(snapshot.encodedState, 'base64');
    await mindmap.save();

    console.log(`✅ Auto-snapshot saved for ${ydocId} (${size} bytes)`);

    res.json({ ok: true });
  } catch (err) {
    console.error('❌ saveRealtimeSnapshot error:', err);
    res.status(500).json({ message: err.message });
  }
};


// GET /api/internal/mindmaps/:ydocId/snapshot
// Called by Realtime Server on doc load
export const getRealtimeSnapshot = async (req, res) => {
  const ydocId = req.params.ydocId || req.params.id;

  try {
    const mindmap = await Mindmap.findOne({ ydocId });
    if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });

    // 🔥 CRITICAL FIX: Prioritize Mindmap.snapshot first
    if (mindmap.snapshot) {
      console.log(`📦 Returning snapshot from Mindmap.snapshot (${mindmap.snapshot.length} bytes)`);
      
      const snapshot = {
        schemaVersion: 1,
        encodedState: mindmap.snapshot.toString('base64'),
        meta: {
          createdBy: 'persistence',
          reason: 'restore',
          clientCount: 0
        },
        createdAt: mindmap.updatedAt.toISOString()
      };

      return res.json({ snapshot });
    }

    // Fallback: Load from latest Version
    const version = await Version.findOne({ mindmapId: mindmap._id })
      .sort({ createdAt: -1 });

    if (!version) {
      console.log(`⚠️  No snapshot found for ${ydocId}`);
      return res.status(404).json({ message: 'No snapshot found' });
    }

    console.log(`📦 Returning snapshot from Version collection`);
    res.json({ snapshot: version.snapshot });

  } catch (err) {
    console.error('❌ getRealtimeSnapshot error:', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/mindmaps/:id/versions/:versionId/restore
export const restoreSnapshot = async (req, res) => {
  console.log("mm controller")
  const { id, versionId } = req.params;

  const mindmap = await Mindmap.findById(id);
  if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });

  const version = await Version.findById(versionId);
  if (!version) return res.status(404).json({ message: 'Version not found' });

  await Version.create({
    mindmapId: mindmap._id,
    snapshot: version.snapshot,
    userId: req.user.id,
    type: 'restore',
    label: `Restore from ${versionId}`,
    size: Buffer.byteLength(version.snapshot.encodedState, 'base64')
  });

  res.json({ ok: true });
};


// NEW: Verify user access to mindmap (cho Realtime Server)
export async function verifyMindmapAccess(req, res) {
  try {
    const ydocId = req.params.id;  // This is ydocId, not mindmap _id
    const authHeader = req.headers.authorization;
    
    console.log('🔐 verifyMindmapAccess called');
    console.log('   ydocId:', ydocId);
    console.log('   Authorization:', authHeader ? 'Present' : 'Missing');
    
    // Extract user ID from JWT token
    let userId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
        userId = decoded.id;
        console.log('   ✅ User ID from token:', userId);
      } catch (err) {
        console.error('   ❌ JWT verification failed:', err.message);
        return res.json({ hasAccess: false });
      }
    }
    
    if (!userId) {
      console.log('   ❌ No userId found');
      return res.json({ hasAccess: false });
    }
    
    // CRITICAL FIX: Find by ydocId, not _id
    const mindmap = await Mindmap.findOne({ ydocId }).lean();
    
    if (!mindmap) {
      console.log('   ❌ Mindmap not found for ydocId:', ydocId);
      return res.json({ hasAccess: false });
    }

    console.log('   ✅ Mindmap found:', mindmap._id);

    const role = await checkMindmapAccess(userId, mindmap._id.toString(), 'read');
    
    console.log('   Access check result:', { role, hasAccess: !!role });

    res.json({ 
      hasAccess: !!role, 
      role,
      mindmapId: mindmap._id,
      ownerId: mindmap.ownerId,
      user: { id: userId }
    });
  } catch (err) {
    console.error('❌ verifyMindmapAccess error:', err);
    res.status(500).json({ hasAccess: false });
  }
}

// GET /api/mindmaps/:id/versions/:versionId
export const getVersion = async (req, res) => {
  const { versionId } = req.params;

  const version = await Version.findById(versionId)
    .populate('userId', 'name email');

  if (!version) return res.status(404).json({ message: 'Version not found' });

  res.json({
    id: version._id,
    snapshot: version.snapshot,
    type: version.type,
    label: version.label,
    createdAt: version.createdAt,
    user: version.userId
  });
};

