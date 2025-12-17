// Realtime/utils/persist.js - WITH FULL DEBUG

const axios = require('axios');
const Y = require('yjs');
const { CONFIG } = require('../config');
const { validateSnapshotSchema } = require('./schema');
const { createSnapshotFromDoc } = require('./snapshot');

module.exports.persistence = {
  async bindState(docName, ydoc) {
    console.log('\n========================================');
    console.log('📥 BIND STATE (Load from Backend)');
    console.log('========================================');
    console.log('Document:', docName);
    
    try {
      const url = `${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/snapshot`;
      console.log('Fetching from:', url);
      
      const res = await axios.get(url, { 
        headers: { 'x-service-token': CONFIG.SERVICE_TOKEN },
        timeout: 5000
      });

      const snapshot = res.data.snapshot;
      
      console.log('✅ Snapshot received:');
      console.log('   Schema version:', snapshot.schemaVersion);
      console.log('   Encoded state length:', snapshot.encodedState?.length || 0);
      console.log('   Meta:', snapshot.meta);
      
      if (validateSnapshotSchema(snapshot)) {
        const update = Buffer.from(snapshot.encodedState, 'base64');
        
        // Preview content before applying
        const previewDoc = new Y.Doc();
        Y.applyUpdate(previewDoc, update);
        
        console.log('   📊 SNAPSHOT CONTENT:');
        console.log('      Nodes:', previewDoc.getMap('nodes').size);
        previewDoc.getMap('nodes').forEach((value, key) => {
          console.log(`         ${key}: ${value.label}`);
        });
        console.log('      Edges:', previewDoc.getArray('edges').length);
        
        // Apply to actual doc
        Y.applyUpdate(ydoc, update);
        
        console.log('✅ Applied to Y.Doc');
        console.log('   Final Nodes:', ydoc.getMap('nodes').size);
        console.log('   Final Edges:', ydoc.getArray('edges').length);
      }
      
      console.log('========================================\n');
      
    } catch (err) {
      if (err.response?.status === 404) {
        console.log('⚠️ No snapshot found - starting with empty doc');
      } else {
        console.error('❌ Failed to load snapshot:', err.message);
      }
      console.log('========================================\n');
    }
  },

  async writeState(docName, ydoc) {
    console.log('\n========================================');
    console.log('💾 WRITE STATE (Save to Backend)');
    console.log('========================================');
    console.log('Document:', docName);
    
    const snapshot = createSnapshotFromDoc(ydoc, {
      createdBy: 'realtime',
      reason: 'autosave'
    });

    console.log('Snapshot created:');
    console.log('   Encoded state length:', snapshot.encodedState.length);
    console.log('   Nodes:', ydoc.getMap('nodes').size);
    console.log('   Edges:', ydoc.getArray('edges').length);

    try {
      await axios.post(
        `${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/snapshot`,
        { snapshot },
        { 
          headers: { 'x-service-token': CONFIG.SERVICE_TOKEN },
          timeout: 5000
        }
      );
      
      console.log('✅ Saved to backend');
      console.log('========================================\n');
    } catch (err) {
      console.error('❌ Failed to save:', err.message);
      console.log('========================================\n');
      throw err;
    }
  }
};