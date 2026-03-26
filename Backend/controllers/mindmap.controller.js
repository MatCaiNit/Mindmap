// Backend/controllers/mindmap.controller.js
import Mindmap from '../models/Mindmap.js';
import Version from '../models/Version.js';
import AuditLog from '../models/AuditLog.js';
import { nanoid } from 'nanoid';
import { checkMindmapAccess } from '../services/access.service.js';
import { createSnapshotSchema, validateSnapshotSchema } from '../utils/snapshotSchema.js';
import { applyTemplateToYDoc } from '../utils/templateToYjs.js';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import FormData from 'form-data'

export async function createMindmap(req, res) {
  try {
    const { title, description, template } = req.body;

    console.log('\n========================================');
    console.log('📋 CREATE MINDMAP REQUEST');
    console.log('========================================');
    console.log('Title:', title);
    console.log('Has template:', !!template);
    if (template) {
      console.log('Template ID:', template.id);
      console.log('Template name:', template.name);
      console.log('Has structure:', !!template.structure);
    }

    if (!title) return res.status(400).json({ message: 'Missing title' });

    const ownerId = req.user.id;
    const ydocId = nanoid(12);

    // Create mindmap document
    const mm = await Mindmap.create({
      title,
      description: description || '',
      ownerId,
      ydocId,
      collaborators: []
    });

    console.log('✅ Mindmap created:', mm._id);

    // Apply template if provided
    if (template && template.structure) {
      console.log('🎨 Applying template...');

      try {
        const templateSnapshot = applyTemplateToYDoc(template);

        if (templateSnapshot) {
          // Save snapshot to Mindmap
          mm.snapshot = templateSnapshot;
          await mm.save();

          console.log('✅ Snapshot saved to Mindmap');

          // Save as initial version
          await Version.create({
            mindmapId: mm._id,
            snapshot: {
              schemaVersion: 1,
              encodedState: templateSnapshot.toString('base64'),
              meta: {
                createdBy: ownerId,
                reason: 'template',
                templateId: template.id,
                templateName: template.name
              },
              createdAt: new Date().toISOString()
            },
            userId: ownerId,
            type: 'manual',
            label: `Template: ${template.name}`,
            size: templateSnapshot.length
          });

          console.log('✅ Initial version created');
        }
      } catch (templateErr) {
        console.error('❌ Template application failed:', templateErr);
        // Continue even if template fails - user gets blank mindmap
      }
    }

    await AuditLog.create({
      mindmapId: mm._id,
      userId: ownerId,
      action: 'create-mindmap',
      detail: {
        title: mm.title,
        template: template ? template.name : 'blank'
      }
    });

    console.log('========================================\n');

    res.status(201).json({ ok: true, mindmap: mm });
  } catch (err) {
    console.error('❌ Create mindmap error:', err);
    res.status(500).json({ message: err.message });
  }
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
    try {
      const AI_URL = process.env.AI_GATEWAY_URL || 'http://localhost:4000'
      await axios.delete(`${AI_URL}/ai/chunks/${mm._id}`)
    } catch (e) {
      console.warn('Could not delete PDF chunks:', e.message)
    }
    await mm.deleteOne();
    res.json({ ok: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// ... rest of the controller methods remain the same ...
// (saveUserSnapshot, saveRealtimeSnapshot, getRealtimeSnapshot, restoreSnapshot, verifyMindmapAccess)

// POST /api/mindmaps/:id/snapshot
export const saveUserSnapshot = async (req, res) => {
  const { id } = req.params;
  const { encodedState } = req.body;

  const mindmap = await Mindmap.findById(id);
  if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });

  const snapshot = createSnapshotSchema(encodedState, {
    createdBy: req.user.id,
    reason: 'manual'
  });
  mindmap.snapshot = Buffer.from(snapshot.encodedState, 'base64');
  await mindmap.save();

  await Version.create({
    mindmapId: mindmap._id,
    snapshot,
    userId: req.user.id,
    type: 'manual',
    size: Buffer.byteLength(encodedState, 'base64')
  });

  res.json({ ok: true });
};

export const saveRealtimeSnapshot = async (req, res) => {
  const ydocId = req.params.ydocId || req.params.id;
  const { snapshot } = req.body;

  try {
    const mindmap = await Mindmap.findOne({ ydocId });
    if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });

    validateSnapshotSchema(snapshot);
    const size = Buffer.byteLength(snapshot.encodedState, 'base64');

    await Version.create({
      mindmapId: mindmap._id,
      snapshot,
      type: 'auto',
      size
    });

    mindmap.snapshot = Buffer.from(snapshot.encodedState, 'base64');
    await mindmap.save();

    console.log(`✅ Auto-snapshot saved for ${ydocId} (${size} bytes)`);

    res.json({ ok: true });
  } catch (err) {
    console.error('❌ saveRealtimeSnapshot error:', err);
    res.status(500).json({ message: err.message });
  }
};

export const getRealtimeSnapshot = async (req, res) => {
  const ydocId = req.params.ydocId || req.params.id;

  try {
    const mindmap = await Mindmap.findOne({ ydocId });
    if (!mindmap) return res.status(404).json({ message: 'Mindmap not found' });

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

export const restoreSnapshot = async (req, res) => {
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

export async function verifyMindmapAccess(req, res) {
  try {
    const ydocId = req.params.id;
    const authHeader = req.headers.authorization;

    console.log('🔐 verifyMindmapAccess called');
    console.log('   ydocId:', ydocId);
    console.log('   Authorization:', authHeader ? 'Present' : 'Missing');

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



/**
 * POST /api/mindmaps/:id/generate-from-pdf
 * Validate mindmap access → forward PDF sang GenAI service
 */
export async function generateFromPdf(req, res) {
  try {
    const { id } = req.params

    // 1. Validate mindmap tồn tại và user có quyền
    const mm = await Mindmap.findById(id)
    if (!mm) return res.status(404).json({ message: 'Mindmap not found' })

    const role = await checkMindmapAccess(req.user.id, id, 'write')
    if (!role) return res.status(403).json({ message: 'Permission denied' })

    // 2. Validate file
    if (!req.file) {
      return res.status(400).json({ message: 'Missing PDF file' })
    }

    console.log(` Forwarding PDF to GenAI for mindmap: ${id}`)

    // 3. Forward sang GenAI dùng FormData
    const form = new FormData()
    form.append('mindmapId', id)
    form.append('filename', req.file.originalname || 'document.pdf')
    form.append('pdf', req.file.buffer, {
      filename: req.file.originalname || 'document.pdf',
      contentType: 'application/pdf',
    })

    const AI_URL = process.env.AI_GATEWAY_URL || 'http://localhost:4000'

    const response = await axios.post(
      `${AI_URL}/ai/generate-from-pdf`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 120000, // 2 phút — PDF lớn mất thời gian embed
      }
    )

    // 4. Audit log
    await AuditLog.create({
      mindmapId: mm._id,
      userId: req.user.id,
      action: 'generate-from-pdf',
      detail: {
        filename: req.file.originalname,
        totalChunks: response.data.meta?.totalChunks,
      }
    })

    res.json(response.data)
  } catch (err) {
    console.error(' generateFromPdf error:', err.response?.data || err.message)
    res.status(500).json({
      message: err.response?.data?.error || err.message
    })
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  NEW ① — POST /api/mindmaps/:id/generate-from-prompt
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Validate mindmap access → forward prompt to GenAI service
 * Body: { prompt: string }
 */
export async function generateFromPrompt(req, res) {
  try {
    const { id } = req.params
    const { prompt } = req.body
 
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ message: 'Missing prompt' })
    }
 
    const mm = await Mindmap.findById(id)
    if (!mm) return res.status(404).json({ message: 'Mindmap not found' })
 
    // Require write access (owner or editor)
    const role = await checkMindmapAccess(req.user.id, id, 'write')
    if (!role) return res.status(403).json({ message: 'Permission denied' })
 
    const AI_URL = process.env.AI_GATEWAY_URL || 'http://localhost:4000'
 
    const response = await axios.post(
      `${AI_URL}/ai/generate-from-prompt`,
      { prompt: prompt.trim() },
      { timeout: 60000 }
    )
 
    await AuditLog.create({
      mindmapId: mm._id,
      userId: req.user.id,
      action: 'generate-from-prompt',
      detail: { promptPreview: prompt.trim().slice(0, 100) },
    })
 
    res.json(response.data)
  } catch (err) {
    console.error('generateFromPrompt error:', err.response?.data || err.message)
    res.status(500).json({
      message: err.response?.data?.error || err.message,
    })
  }
}
 
// ══════════════════════════════════════════════════════════════════════════════
//  NEW ② — POST /api/mindmaps/:id/ai-suggest
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Validate mindmap access → forward suggest context to GenAI
 * Body: { nodeId: string, context: { currentNode, parentNodes, siblings } }
 */
export async function aiSuggest(req, res) {
  try {
    const { id } = req.params
    const { context } = req.body
 
    if (!context) return res.status(400).json({ message: 'Missing context' })
 
    const mm = await Mindmap.findById(id)
    if (!mm) return res.status(404).json({ message: 'Mindmap not found' })
 
    // Read access is enough for suggestions
    const role = await checkMindmapAccess(req.user.id, id, 'read')
    if (!role) return res.status(403).json({ message: 'Permission denied' })
 
    const AI_URL = process.env.AI_GATEWAY_URL || 'http://localhost:4000'
 
    const response = await axios.post(
      `${AI_URL}/ai/suggest`,
      { context },
      { timeout: 20000 }
    )
 
    res.json(response.data)
  } catch (err) {
    console.error('aiSuggest error:', err.response?.data || err.message)
    res.status(500).json({
      message: err.response?.data?.error || err.message,
    })
  }
}
 