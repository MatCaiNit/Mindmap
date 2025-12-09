import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  mindmapId: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  action: String,
  detail: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('AuditLog', AuditLogSchema);
