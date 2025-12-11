// Backend/models/User.js
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, index: true },
  password: { type: String },
  name: { type: String, default: '' },
  googleId: { type: String, index: true, sparse: true },
  provider: { type: String, default: 'local' },
  avatarUrl: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
