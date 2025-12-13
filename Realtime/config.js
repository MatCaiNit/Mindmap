// Realtime/config.js
import dotenv from 'dotenv';
dotenv.config();

// ✅ Validate required environment variables
if (!process.env.REALTIME_SERVICE_TOKEN) {
  console.error('❌ CRITICAL: REALTIME_SERVICE_TOKEN is not set!');
  console.error('   This token must match the one in Backend/.env');
  console.error('   Generate one with: openssl rand -hex 32');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_secret') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET. This must match Backend JWT_SECRET!');
}

export const CONFIG = {
  PORT: process.env.PORT || 1234,
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',
  SERVICE_TOKEN: process.env.REALTIME_SERVICE_TOKEN || "super_secure_internal_token_xyz123",
  DEBOUNCE_MS: parseInt(process.env.DEBOUNCE_MS || '2000', 10), // 2 giây
};