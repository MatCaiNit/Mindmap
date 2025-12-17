// Backend/controllers/version.controller.js - FIXED

import Version from '../models/Version.js';
import Mindmap from '../models/Mindmap.js';
import AuditLog from '../models/AuditLog.js';
import { checkMindmapAccess } from '../services/access.service.js';
import axios from 'axios';

const REALTIME_URL = process.env.REALTIME_URL || 'http://localhost:1234';

// POST /api/mindmaps/:id/versions/:versionId/restore
export async function restoreVersion(req, res) {
  try {
    const { id, versionId } = req.params;

    console.log('\n========================================');
    console.log('🔄 RESTORE VERSION - START');
    console.log('========================================');
    console.log('Mindmap ID:', id);
    console.log('Version ID:', versionId);

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

    console.log('✅ Mindmap found:', mindmap.ydocId);
    console.log('✅ Version found:', version.label || version.type);
    console.log('📦 Version snapshot type:', typeof version.snapshot);
    console.log('📦 Has encodedState:', !!version.snapshot?.encodedState);

    // 3️⃣ 🔥 Prepare snapshot for Realtime
    let snapshotToSend;
    
    if (version.snapshot?.encodedState) {
      // New format: already has encodedState
      console.log('✅ Using new format (snapshot.encodedState)');
      snapshotToSend = {
        schemaVersion: version.snapshot.schemaVersion || 1,
        encodedState: version.snapshot.encodedState,
        meta: version.snapshot.meta || {},
        createdAt: version.snapshot.createdAt || version.createdAt
      };
    } else if (Buffer.isBuffer(version.snapshot)) {
      // Old format: convert Buffer to base64
      console.log('⚠️ Converting old format (Buffer) to base64');
      snapshotToSend = {
        schemaVersion: 1,
        encodedState: version.snapshot.toString('base64'),
        meta: { convertedFrom: 'buffer' },
        createdAt: version.createdAt
      };
    } else {
      throw new Error('Invalid snapshot format');
    }

    console.log('📊 Prepared snapshot:');
    console.log('   Schema:', snapshotToSend.schemaVersion);
    console.log('   EncodedState length:', snapshotToSend.encodedState?.length || 0);

    // 4️⃣ Update Mindmap.snapshot (for persistence)
    const restoreBuffer = Buffer.from(snapshotToSend.encodedState, 'base64');
    mindmap.snapshot = restoreBuffer;
    await mindmap.save();
    console.log('✅ Mindmap.snapshot updated (length:', restoreBuffer.length, 'bytes)');

    // 5️⃣ Backup current state
    try {
      const currentSnapshotRes = await axios.get(
        `${REALTIME_URL}/api/internal/mindmaps/${mindmap.ydocId}/snapshot`,
        { 
          headers: { 'x-service-token': process.env.REALTIME_SERVICE_TOKEN }, 
          timeout: 5000 
        }
      );
      const currentSnapshot = currentSnapshotRes.data.snapshot;
      
      if (currentSnapshot && currentSnapshot.encodedState !== snapshotToSend.encodedState) {
        await Version.create({
          mindmapId: id,
          snapshot: currentSnapshot,
          userId: req.user.id,
          type: 'auto',
          label: 'Auto-backup before restore',
          size: Buffer.byteLength(currentSnapshot.encodedState, 'base64')
        });
        console.log('✅ Current state backed up');
      }
    } catch (backupErr) {
      console.warn('⚠️ Failed to backup:', backupErr.message);
    }

    // 6️⃣ Create restore record
    const restoreRecord = await Version.create({
      mindmapId: id,
      snapshot: snapshotToSend,
      userId: req.user.id,
      type: 'restore',
      label: `Restored from ${new Date(version.createdAt).toLocaleString()}`,
      size: Buffer.byteLength(snapshotToSend.encodedState, 'base64')
    });
    console.log('✅ Restore record created:', restoreRecord._id);

    // 7️⃣ Audit log
    await AuditLog.create({
      mindmapId: id,
      userId: req.user.id,
      action: 'restore-version',
      detail: { versionId, restoredFrom: version.createdAt, label: version.label }
    });

    // 8️⃣ 🔥 BROADCAST TO REALTIME (This updates all clients via Yjs!)
    console.log('📡 Broadcasting restore to Realtime...');
    console.log('   URL:', `${REALTIME_URL}/broadcast-restore`);
    console.log('   ydocId:', mindmap.ydocId);
    console.log('   Token:', process.env.REALTIME_SERVICE_TOKEN ? 'Present' : 'MISSING!');
    
    try {
      const broadcastPayload = {
        ydocId: mindmap.ydocId,
        snapshot: snapshotToSend
      };
      
      console.log('📤 Payload:');
      console.log('   ydocId:', broadcastPayload.ydocId);
      console.log('   snapshot.encodedState length:', broadcastPayload.snapshot.encodedState.length);
      
      const broadcastRes = await axios.post(
        `${REALTIME_URL}/broadcast-restore`,
        broadcastPayload,
        { 
          headers: { 
            'x-service-token': process.env.REALTIME_SERVICE_TOKEN,
            'Content-Type': 'application/json'
          },
          timeout: 10000 
        }
      );
      
      console.log('✅ Broadcast successful:', broadcastRes.data);
      console.log('   Clients notified:', broadcastRes.data.clientsNotified);
      console.log('   Restored nodes:', broadcastRes.data.restored?.nodes);
      
    } catch (realtimeErr) {
      console.error('❌ Broadcast failed!');
      console.error('   Status:', realtimeErr.response?.status);
      console.error('   Message:', realtimeErr.response?.data?.message || realtimeErr.message);
      console.error('   Full error:', realtimeErr.response?.data);
      
      // Don't fail the whole restore, just warn
      console.warn('⚠️ Restore saved but broadcast failed - clients need manual refresh');
    }

    console.log('========================================');
    console.log('✅ RESTORE VERSION - COMPLETE');
    console.log('========================================\n');

    res.json({
      ok: true,
      message: 'Version restored successfully',
      version: { 
        id: restoreRecord._id, 
        createdAt: restoreRecord.createdAt 
      }
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

    const role = await checkMindmapAccess(req.user.id, id, 'write');
    if (!role) return res.status(403).json({ message: 'Permission denied' });

    const mindmap = await Mindmap.findById(id);
    if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });

    // Get current state from Realtime
    const realtimeRes = await axios.get(
      `${REALTIME_URL}/api/internal/mindmaps/${mindmap.ydocId}/snapshot`,
      {
        headers: { 'x-service-token': process.env.REALTIME_SERVICE_TOKEN },
        timeout: 5000
      }
    );

    const snapshot = realtimeRes.data.snapshot;

    // Save version
    const version = await Version.create({
      mindmapId: id,
      snapshot,
      userId: req.user.id,
      type: 'manual',
      label: label || `Manual save ${new Date().toLocaleString()}`,
      size: Buffer.byteLength(snapshot.encodedState, 'base64')
    });

    // Update Mindmap.snapshot
    mindmap.snapshot = Buffer.from(snapshot.encodedState, 'base64');
    await mindmap.save();

    await AuditLog.create({
      mindmapId: id,
      userId: req.user.id,
      action: 'save-version',
      detail: { versionId: version._id, label: version.label }
    });

    console.log('✅ Version saved:', version._id);
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
    console.error('❌ Save version error:', err);
    res.status(500).json({ message: err.message });
  }
}

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