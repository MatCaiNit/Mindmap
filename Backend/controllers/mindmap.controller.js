// Backend/controllers/mindmap.controller.js
import Mindmap from '../models/Mindmap.js';
import Version from '../models/Version.js';
import AuditLog from '../models/AuditLog.js';
import { nanoid } from 'nanoid';
import { checkMindmapAccess } from '../services/access.service.js';
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

export async function saveUserSnapshot(req, res) {
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
    await Version.create({
      mindmapId: mm._id,
      snapshot: buf,
      userId: req.user.id,
      type: 'manual',
      label: 'User saved snapshot',
      size: buf.length
    });
    await AuditLog.create({ mindmapId: mm._id, userId: req.user.id, action: 'save-snapshot', detail: { size: buf.length } });
    res.json({ ok: true, message: 'Snapshot saved' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function saveRealtimeSnapshot(req, res) {
  try {
    const { id } = req.params; // LƯU Ý: Đây là ydocId do route truyền vào
    const { snapshot } = req.body; // Base64 String

    if (!snapshot) return res.status(400).json({ message: "Missing snapshot" });

    const buf = Buffer.from(snapshot, 'base64');

    // Tìm bằng ydocId vì Realtime Server không biết _id
    const mindmap = await Mindmap.findOne({ ydocId: id });
    if (!mindmap) return res.status(404).json({ message: "Mindmap not found" });

    if (!mindmap.snapshot || !mindmap.snapshot.equals(buf)) {
      mindmap.snapshot = buf;
      await mindmap.save();
    }
    // Tuỳ chọn: Có thể không lưu Version ở đây để tránh spam DB (vì auto save chạy liên tục)
    // Hoặc lưu Version nhưng có debounce logic
    
    return res.json({ ok: true });
  } catch (err) {
    console.error("saveRealtimeSnapshot error:", err);
    return res.status(500).json({ message: err.message });
  }
}

// Đổi tên hàm này thành getRealtimeSnapshot để rõ nghĩa hơn
export async function getRealtimeSnapshot(req, res) {
  try {
    const { id } = req.params; // Đây là ydocId

    // Tìm bằng ydocId
    const mm = await Mindmap.findOne({ ydocId: id }).select('snapshot');

    if (!mm) return res.status(404).json({ message: 'Mindmap not found' });
    if (!mm.snapshot) {
      return res.json({ snapshot: null, empty: true });
    }

    return res.json({
      snapshot: mm.snapshot.toString('base64'),
      empty: false
    });
  } catch (err) {
    console.error("getRealtimeSnapshot error:", err);
    return res.status(500).json({ message: err.message });
  }
}

export async function restoreSnapshot(req, res) {
  try {
    const { id } = req.params; // Mindmap ID (_id)
    const { versionId } = req.body;

    if (!versionId) return res.status(400).json({ message: "Missing versionId" });

    // --- QUAN TRỌNG: Thêm check quyền ---
    const role = await checkMindmapAccess(req.user.id, id, 'write');
    if (!role) return res.status(403).json({ message: 'Permission denied' });
    // ------------------------------------
    const version = await Version.findById(versionId);
    if (!version) return res.status(404).json({ message: "Version not found" });
    if (version.mindmapId.toString() !== id) {
      return res.status(400).json({ message: 'Version does not belong to this mindmap' });
    }


    const mindmap = await Mindmap.findById(id);
    if (!mindmap) return res.status(404).json({ message: "Mindmap not found" });

    if (
      mindmap.snapshot &&
      Buffer.compare(mindmap.snapshot, version.snapshot) === 0
    ) {
      return res.status(400).json({
        message: 'Snapshot is already the current version'
      });
    }
    const ydocId = mindmap.ydocId;
    const realtimeUrl = process.env.REALTIME_URL;
    if (!realtimeUrl) {
      return res.status(500).json({ message: "REALTIME_URL not configured" });
    }


    // Gọi sang Realtime Server để force update
    // Realtime server cần có route POST /apply-snapshot
    await axios.post(
      `${realtimeUrl}/apply-snapshot`,
      { 
        ydocId, 
        snapshot: version.snapshot.toString('base64') 
      },
      {
        headers: {
            // Header này phải khớp với cấu hình bên Realtime Server
           'x-service-token': process.env.REALTIME_SERVICE_TOKEN 
        },
        timeout: 5000
      }
    );
    
    // Update snapshot hiện tại
    mindmap.snapshot = version.snapshot;
    await mindmap.save();

    // Create new version record (restore)
    const restoredVersion = await Version.create({
      mindmapId: mindmap._id,
      snapshot: version.snapshot,
      userId: req.user.id,
      type: 'restore',
      label: `Restored from version ${version._id}`,
      size: version.snapshot.length
    });

    // Lưu log
    await AuditLog.create({
      mindmapId: mindmap._id,
      userId: req.user.id,
      action: 'restore-version',
      detail: {
        fromVersionId: version._id,
        newVersionId: restoredVersion._id
      }
    });

    return res.json({
      ok: true,
      message: 'Snapshot restored successfully',
      restoredVersionId: restoredVersion._id
    });
  } catch (err) {
    console.error("restoreSnapshot error:", err);
    return res.status(500).json({ message: err.message });
  }
}

// NEW: Verify user access to mindmap (cho Realtime Server)
export async function verifyMindmapAccess(req, res) {
  try {
    const ydocId = req.params.id;
    const userId = req.headers['x-user-id'];
    
    if (!userId) return res.json({ hasAccess: false });
    
    const mindmap = await Mindmap.findOne({ ydocId }).lean();
    if (!mindmap) return res.json({ hasAccess: false });

    const role = await checkMindmapAccess(userId, mindmap._id.toString(), 'read');
    res.json({ 
      hasAccess: !!role, 
      role,
      mindmapId: mindmap._id,
      ownerId: mindmap.ownerId
    });
  } catch (err) {
    console.error('verifyMindmapAccess error:', err);
    res.status(500).json({ hasAccess: false });
  }
}

export async function getVersion(req, res) {
  try {
    const { id, versionId } = req.params;

    const role = await checkMindmapAccess(req.user.id, id, 'read');
    if (!role) return res.status(403).json({ message: 'Permission denied' });

    const version = await Version.findOne({
      _id: versionId,
      mindmapId: id
    });

    if (!version) return res.status(404).json({ message: 'Version not found' });

    res.json({
      ok: true,
      version: {
        _id: version._id,
        createdAt: version.createdAt,
        type: version.type,
        label: version.label,
        snapshot: version.snapshot.toString('base64')
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}
