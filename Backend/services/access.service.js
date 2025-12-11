// Backend/services/access.service.js
import Mindmap from '../models/Mindmap.js';

export async function checkMindmapAccess(userId, mindmapId, action = 'read') {
  const mm = await Mindmap.findById(mindmapId).lean();
  if (!mm) return null;
  if (mm.ownerId?.toString() === userId) return 'owner';
  const collab = (mm.collaborators || []).find(c => c.userId.toString() === userId);
  if (!collab) return null;
  if (collab.role === 'editor') return 'editor';
  if (collab.role === 'viewer' && action === 'read') return 'viewer';
  return null;
}
