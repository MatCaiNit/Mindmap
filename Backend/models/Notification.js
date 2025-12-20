// Backend/models/Notification.js
import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['collaboration_invite', 'system', 'mention'], 
    required: true 
  },
  toUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  fromUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  mindmap: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Mindmap' 
  },
  role: { 
    type: String, 
    enum: ['editor', 'viewer'], 
    default: 'viewer' 
  },
  message: { 
    type: String 
  },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected'], 
    default: 'pending' 
  },
  read: { 
    type: Boolean, 
    default: false 
  }
}, { timestamps: true });

// Index for efficient queries
NotificationSchema.index({ toUser: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', NotificationSchema);