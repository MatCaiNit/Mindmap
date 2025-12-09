import { checkMindmapAccess } from '../services/access.service.js';

export function requireMindmapAccess(action = 'read') {
  return async (req, res, next) => {
    const mindmapId = req.params.id || req.params.mindmapId || req.body.mindmapId;
    if (!mindmapId) return res.status(400).json({ message: 'Missing mindmap id' });
    const role = await checkMindmapAccess(req.user.id, mindmapId, action);
    if (!role) return res.status(403).json({ message: 'Permission denied' });
    req.accessRole = role;
    next();
  };
}
