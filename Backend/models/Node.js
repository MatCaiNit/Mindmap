import mongoose from 'mongoose';

const NodeSchema = new mongoose.Schema({
  mindmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mindmap', index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Node', default: null },
  text: { type: String, required: true },
  position: { x: Number, y: Number },
  color: { type: String, default: '#333' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

NodeSchema.index({ mindmapId: 1 });
NodeSchema.index({ parentId: 1 });

export default mongoose.model('Node', NodeSchema);
