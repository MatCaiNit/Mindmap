// Backend/controllers/version.controller.js
import Version from '../models/Version.js';
import Mindmap from '../models/Mindmap.js';
import AuditLog from '../models/AuditLog.js';
import { checkMindmapAccess } from '../services/access.service.js';
import axios from 'axios';
import * as Y from 'yjs'; 

const REALTIME_URL = process.env.REALTIME_URL || 'http://localhost:1234';

// GET /api/mindmaps/:id/versions
export async function listVersions(req, res) {
  try {
    const { id } = req.params;

    const role = await checkMindmapAccess(req.user.id, id, 'read');
    if (!role) return res.status(403).json({ message: 'Permission denied' });

    const versions = await Version.find({ mindmapId: id })
      .sort({ createdAt: -1 })
      .select('-snapshot')
      .populate('userId', 'email name')
      .lean();

    res.json({ ok: true, versions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/mindmaps/:id/versions/:versionId
export async function getVersion(req, res) {
  try {
    const { id, versionId } = req.params;

    const role = await checkMindmapAccess(req.user.id, id, 'read');
    if (!role) return res.status(403).json({ message: 'Permission denied' });

    const version = await Version.findById(versionId)
      .populate('userId', 'name email')
      .lean();

    if (!version) return res.status(404).json({ message: 'Version not found' });

    if (version.mindmapId.toString() !== id) {
      return res.status(403).json({ message: 'Version does not belong to this mindmap' });
    }

    res.json({
      ok: true,
      version: {
        id: version._id,
        snapshot: version.snapshot,
        type: version.type,
        label: version.label,
        createdAt: version.createdAt,
        size: version.size,
        user: version.userId
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/mindmaps/:id/versions/:versionId/restore
export async function restoreVersion(req, res) {
  try {
    const { id, versionId } = req.params;

    // 1️⃣ Check access
    const role = await checkMindmapAccess(req.user.id, id, 'write');
    if (!role) return res.status(403).json({ message: 'Permission denied' });

    // 2️⃣ Find mindmap and version
    const mindmap = await Mindmap.findById(id);
    if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });

    const version = await Version.findById(versionId);
    if (!version || version.mindmapId.toString() !== id) {
      return res.status(404).json({ message: 'Version not found or mismatch' });
    }

    // 3️⃣ Backup current state
    try {
      const currentSnapshotRes = await axios.get(
        `${REALTIME_URL}/api/internal/mindmaps/${mindmap.ydocId}/snapshot`,
        { headers: { 'x-service-token': process.env.REALTIME_SERVICE_TOKEN }, timeout: 5000 }
      );
      const currentSnapshot = currentSnapshotRes.data.snapshot;
      if (currentSnapshot) {
        await Version.create({
          mindmapId: id,
          snapshot: currentSnapshot,
          userId: req.user.id,
          type: 'auto',
          label: 'Auto-backup before restore',
          size: Buffer.byteLength(currentSnapshot.encodedState, 'base64')
        });
      }
    } catch (backupErr) {
      console.warn('⚠️ Failed to backup:', backupErr.message);
    }

    // 4️⃣ Create restore record
    const restoreRecord = await Version.create({
      mindmapId: id,
      snapshot: version.snapshot,
      userId: req.user.id,
      type: 'restore',
      label: `Restored from ${new Date(version.createdAt).toLocaleString()}`,
      size: version.size || 0
    });

    // 5️⃣ Update Mindmap.snapshot for persistence
    mindmap.snapshot = Buffer.from(version.snapshot.encodedState, 'base64');
    await mindmap.save();

    // 6️⃣ Audit log
    await AuditLog.create({
      mindmapId: id,
      userId: req.user.id,
      action: 'restore-version',
      detail: { versionId, restoredFrom: version.createdAt, label: version.label }
    });

    // 7️⃣ Apply snapshot to Realtime server
    await axios.post(
      `${REALTIME_URL}/apply-snapshot`,
      { ydocId: mindmap.ydocId, snapshot: version.snapshot },
      { headers: { 'x-service-token': process.env.REALTIME_SERVICE_TOKEN }, timeout: 10000 }
    );

    res.json({
      ok: true,
      message: 'Version restored successfully',
      version: { id: restoreRecord._id, createdAt: restoreRecord.createdAt }
    });

  } catch (err) {
    console.error('❌ Restore version error:', err);
    res.status(500).json({ message: err.message });
  }
}


// POST /api/mindmaps/:id/versions/save
export async function saveManualVersion(req, res) {
  try {
    const { id } = req.params;
    const { label } = req.body;

    console.log('\n========================================');
    console.log('📦 SAVE MANUAL VERSION - START');
    console.log('========================================');
    console.log('Mindmap ID:', id);
    console.log('Label:', label);
    console.log('User:', req.user.id);

    const role = await checkMindmapAccess(req.user.id, id, 'write');
    if (!role) {
      console.log('❌ Permission denied');
      return res.status(403).json({ message: 'Permission denied' });
    }

    const mindmap = await Mindmap.findById(id);
    if (!mindmap) {
      console.log('❌ Mindmap not found');
      return res.status(404).json({ message: 'Mindmap not found' });
    }

    console.log('✅ Mindmap found:', mindmap.ydocId);

    // Get current state from Realtime Server
    let snapshot;
    try {
      const realtimeUrl = `${REALTIME_URL}/api/internal/mindmaps/${mindmap.ydocId}/snapshot`;
      console.log('📡 Fetching from:', realtimeUrl);
      
      const realtimeRes = await axios.get(realtimeUrl, {
        headers: {
          'x-service-token': process.env.REALTIME_SERVICE_TOKEN
        },
        timeout: 5000
      });

      snapshot = realtimeRes.data.snapshot;
      
      console.log('✅ Snapshot received:');
      console.log('   Schema version:', snapshot.schemaVersion);
      console.log('   Encoded state length:', snapshot.encodedState?.length || 0);
      console.log('   Meta:', snapshot.meta);
      
      // 🔥 DECODE AND LOG ACTUAL CONTENT
      const buffer = Buffer.from(snapshot.encodedState, 'base64');
      const tempDoc = new Y.Doc();
      Y.applyUpdate(tempDoc, buffer);
      
      const nodes = tempDoc.getMap('nodes');
      const edges = tempDoc.getArray('edges');
      
      console.log('   📊 CONTENT:');
      console.log('      Nodes:', nodes.size);
      nodes.forEach((value, key) => {
        console.log(`         ${key}: ${value.label}`);
      });
      console.log('      Edges:', edges.length);

      if (!snapshot || !snapshot.encodedState) {
        throw new Error('Invalid snapshot');
      }

    } catch (realtimeErr) {
      console.error('❌ Failed to get snapshot:', realtimeErr.message);
      return res.status(500).json({ 
        message: 'Failed to get current state',
        detail: realtimeErr.message 
      });
    }

    // Save to Version collection
    const version = await Version.create({
      mindmapId: id,
      snapshot,
      userId: req.user.id,
      type: 'manual',
      label: label || `Manual save ${new Date().toLocaleString()}`,
      size: snapshot.encodedState ? Buffer.byteLength(snapshot.encodedState, 'base64') : 0
    });

    console.log('✅ Version saved to DB:', version._id);

    // 🔥 CRITICAL: Save to Mindmap.snapshot for persistence
    mindmap.snapshot = Buffer.from(snapshot.encodedState, 'base64');
    await mindmap.save();
    
    console.log('✅ Mindmap.snapshot updated');
    console.log('   Buffer length:', mindmap.snapshot.length);

    await AuditLog.create({
      mindmapId: id,
      userId: req.user.id,
      action: 'save-version',
      detail: { versionId: version._id, label: version.label }
    });

    console.log('========================================');
    console.log('✅ SAVE MANUAL VERSION - COMPLETE');
    console.log('========================================\n');

    res.json({
      ok: true,
      version: {
        id: version._id,
        label: version.label,
        createdAt: version.createdAt,
        size: version.size
      }
    });

  } catch (err) {
    console.error('❌ Save manual version error:', err);
    res.status(500).json({ message: err.message });
  }
}