import Node from '../models/Node.js';
import AuditLog from '../models/AuditLog.js';
import { checkMindmapAccess } from '../services/access.service.js';
import { notifyRealtime } from '../services/realtime.service.js';
import mongoose from 'mongoose';

export async function createNode(req, res) {
  try {
    const { mindmapId, parentId, text, position, meta } = req.body;
    if (!mindmapId || !text) return res.status(400).json({ message: 'Missing fields' });
    const role = await checkMindmapAccess(req.user.id, mindmapId, 'write');
    if (!role) return res.status(403).json({ message: 'No permission' });
    const n = await Node.create({ mindmapId, parentId: parentId || null, text, position: position || { x:0,y:0 }, meta: meta || {} });
    await AuditLog.create({ mindmapId, userId: req.user.id, action: 'create-node', detail: n.toObject() });
    notifyRealtime(mindmapId, { type: 'node:created', node: n });
    res.status(201).json({ ok: true, node: n });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function getNodesByMindmap(req, res) {
  try {
    const mindmapId = req.params.mindmapId;
    const role = await checkMindmapAccess(req.user.id, mindmapId, 'read');
    if (!role) return res.status(403).json({ message: 'No permission' });
    const nodes = await Node.find({ mindmapId }).lean();
    res.json({ ok: true, nodes });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function getNode(req, res) {
  try {
    const nodeId = req.params.nodeId;
    const node = await Node.findById(nodeId).lean();
    if (!node) return res.status(404).json({ message: 'Node not found' });
    const role = await checkMindmapAccess(req.user.id, node.mindmapId.toString(), 'read');
    if (!role) return res.status(403).json({ message: 'No permission' });
    res.json({ ok: true, node });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function updateNode(req, res) {
  try {
    const nodeId = req.params.nodeId;
    const { text, position, meta } = req.body;
    const node = await Node.findById(nodeId);
    if (!node) return res.status(404).json({ message: 'Node not found' });
    const role = await checkMindmapAccess(req.user.id, node.mindmapId.toString(), 'write');
    if (!role) return res.status(403).json({ message: 'No permission' });
    const before = node.toObject();
    if (text !== undefined) node.text = text;
    if (position) node.position = position;
    if (meta) node.meta = meta;
    await node.save();
    await AuditLog.create({ mindmapId: node.mindmapId, userId: req.user.id, action: 'update-node', detail: { before, after: node.toObject() } });
    notifyRealtime(node.mindmapId.toString(), { type: 'node:updated', node });
    res.json({ ok: true, node });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function deleteNode(req, res) {
  try {
    const nodeId = req.params.nodeId;
    const cascade = req.query.cascade === 'true';
    const node = await Node.findById(nodeId);
    if (!node) return res.status(404).json({ message: 'Node not found' });
    const role = await checkMindmapAccess(req.user.id, node.mindmapId.toString(), 'write');
    if (!role) return res.status(403).json({ message: 'No permission' });
    if (cascade) {
      const toDelete = [node._id];
      for (let i=0;i<toDelete.length;i++){
        const children = await Node.find({ parentId: toDelete[i] }).select('_id').lean();
        children.forEach(c=> toDelete.push(c._id));
      }
      await Node.deleteMany({ _id: { $in: toDelete } });
      await AuditLog.create({ mindmapId: node.mindmapId, userId: req.user.id, action: 'delete-node-cascade', detail: { deletedCount: toDelete.length } });
      notifyRealtime(node.mindmapId.toString(), { type: 'node:deleted_bulk', nodeIds: toDelete });
      return res.json({ ok: true, deleted: toDelete.length });
    } else {
      await Node.updateMany(
        { parentId: new mongoose.Types.ObjectId(node._id) },
        { $set: { parentId: null } }
        );
      await node.deleteOne();
      await AuditLog.create({ mindmapId: node.mindmapId, userId: req.user.id, action: 'delete-node', detail: node.toObject() });
      notifyRealtime(node.mindmapId.toString(), { type: 'node:deleted', nodeId: node._id });
      return res.json({ ok: true });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
}
