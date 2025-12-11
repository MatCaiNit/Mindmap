// Backend/config/db.js
import mongoose from 'mongoose';

export async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI not set');
  await mongoose.connect(uri, { maxPoolSize: 10 });
  console.log('MongoDB connected');
}
