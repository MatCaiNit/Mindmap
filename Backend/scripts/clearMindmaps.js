import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function clearMindmaps() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mindmap');
    
    console.log('Clearing mindmaps...');
    
    const Mindmap = mongoose.model('Mindmap', new mongoose.Schema({}, { strict: false }));
    const Version = mongoose.model('Version', new mongoose.Schema({}, { strict: false }));
    
    const deletedMindmaps = await Mindmap.deleteMany({});
    const deletedVersions = await Version.deleteMany({});
    
    console.log(`Deleted ${deletedMindmaps.deletedCount} mindmaps`);
    console.log(`Deleted ${deletedVersions.deletedCount} versions`);
    
    await mongoose.connection.close();
    console.log('Done!');
    
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

clearMindmaps();