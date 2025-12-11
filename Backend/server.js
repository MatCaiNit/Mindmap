// Backend/server.js
import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 5000;



if (!process.env.REALTIME_SERVICE_TOKEN) {
  console.error('❌ CRITICAL: REALTIME_SERVICE_TOKEN is not set!');
  console.error('   This token is required for secure communication with Realtime Server.');
  console.error('   Generate one with: openssl rand -hex 32');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_secret') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET. Change this in production!');
}

try {
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/mindmap');
  app.listen(PORT, () => {
    console.log(`✅ Backend Server running on http://localhost:${PORT}`);
    console.log(`📡 Realtime Server URL: ${process.env.REALTIME_NOTIFY_URL || 'Not configured'}`);
    console.log("Realtime JWT_SECRET =", process.env.JWT_SECRET)
    console.log("REALTIME_SERVICE_TOKEN is set =", process.env.REALTIME_SERVICE_TOKEN);
  });
} catch (err) {
  console.error('Startup error', err);
  process.exit(1);
}
