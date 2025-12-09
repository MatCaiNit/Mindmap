import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 5000;

try {
  await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/mindmap');
  app.listen(PORT, () => console.log(`Backend running http://localhost:${PORT}`));
} catch (err) {
  console.error('Startup error', err);
  process.exit(1);
}
