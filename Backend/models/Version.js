// Backend/models/Version.js
import mongoose from 'mongoose';

const VersionSchema = new mongoose.Schema({
  mindmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mindmap' },
  snapshot: Buffer,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Version', VersionSchema);
