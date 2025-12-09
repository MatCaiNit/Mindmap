import mongoose from 'mongoose';

const CollaboratorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: { type: String, enum: ['editor','viewer'], default: 'editor' }
}, { _id: false });

const MindmapSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  collaborators: [CollaboratorSchema],
  ydocId: { type: String, required: true, index: true },
  snapshot: { type: Buffer, default: null }
}, { timestamps: true });

export default mongoose.model('Mindmap', MindmapSchema);
