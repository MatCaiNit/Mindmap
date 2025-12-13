// Backend/controllers/version.controller.js
import Version from '../models/Version.js';
import { checkMindmapAccess } from '../services/access.service.js';

export async function listVersions(req, res) {
  try {
    const { id } = req.params; // mindmapId (_id)

    const role = await checkMindmapAccess(req.user.id, id, 'read');
    if (!role) return res.status(403).json({ message: 'Permission denied' });

    const versions = await Version.find({ mindmapId: id })
      .sort({ createdAt: -1 })
      .select('-snapshot') // ❗ không gửi snapshot nặng
      .populate('userId', 'email name')
      .lean();

    res.json({ ok: true, versions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}
