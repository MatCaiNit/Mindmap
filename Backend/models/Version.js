// Backend/models/Version.js
import mongoose from 'mongoose';

const VersionSchema = new mongoose.Schema({
  mindmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mindmap', index: true },
  snapshot: { type: Buffer, required: true },

  // NEW
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: { 
    type: String, 
    enum: ['manual', 'auto', 'restore', 'delete-backup'], 
    default: 'manual' 
  },
  label: { type: String, default: '' },
  size: { type: Number }, // bytes

  createdAt: { type: Date, default: Date.now }
});

VersionSchema.index({ mindmapId: 1, createdAt: -1 });

export default mongoose.model('Version', VersionSchema);
