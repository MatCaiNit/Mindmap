// Realtime/utils/persist.js - FIXED SAVE LOGIC

const axios = require('axios');
const Y = require('yjs');
const { CONFIG } = require('../config');
const { validateSnapshotSchema } = require('./schema');
const { createSnapshotFromDoc } = require('./snapshot');

const AUTOSAVE_INTERVAL = 3000;
const MIN_SAVE_INTERVAL = 2000; // Tránh spam save liên tiếp
const saveTimers = new Map();
const lastSaveTime = new Map(); //  Track lần save cuối

module.exports.persistence = {
  async bindState(docName, ydoc) {
    console.log('\n========================================');
    console.log(' BIND STATE (Load from Backend)');
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
      
      console.log(' Snapshot received:');
      console.log('   Schema version:', snapshot.schemaVersion);
      console.log('   Encoded state length:', snapshot.encodedState?.length || 0);
      console.log('   Meta:', snapshot.meta);
      
      if (validateSnapshotSchema(snapshot)) {
        const update = Buffer.from(snapshot.encodedState, 'base64');
        
        // Preview content before applying
        const previewDoc = new Y.Doc();
        Y.applyUpdate(previewDoc, update);
        
        console.log('    SNAPSHOT CONTENT:');
        console.log('      Nodes:', previewDoc.getMap('nodes').size);
        previewDoc.getMap('nodes').forEach((value, key) => {
          console.log(`         ${key}: ${value.label}`);
        });
        console.log('      Edges:', previewDoc.getArray('edges').length);
        
        // Apply to actual doc
        Y.applyUpdate(ydoc, update);
        
        console.log(' Applied to Y.Doc');
        console.log('   Final Nodes:', ydoc.getMap('nodes').size);
        console.log('   Final Edges:', ydoc.getArray('edges').length);
      }
      
      //  Setup auto-save on document changes
      this.setupAutoSave(docName, ydoc);
      
      console.log('========================================\n');
      
    } catch (err) {
      if (err.response?.status === 404) {
        console.log(' No snapshot found - starting with empty doc');
      } else {
        console.error(' Failed to load snapshot:', err.message);
      }
      
      //  Still setup auto-save even if load fails
      this.setupAutoSave(docName, ydoc);
      
      console.log('========================================\n');
    }
  },

  setupAutoSave(docName, ydoc) {
    // Clear existing timer
    if (saveTimers.has(docName)) {
      clearTimeout(saveTimers.get(docName));
    }

    // Debounced save function
    const debouncedSave = () => {
      if (saveTimers.has(docName)) {
        clearTimeout(saveTimers.get(docName));
      }
      
      const timer = setTimeout(() => {
        this.writeState(docName, ydoc).catch(err => {
          console.error(' Auto-save failed:', err.message);
        });
        saveTimers.delete(docName);
      }, AUTOSAVE_INTERVAL);
      
      saveTimers.set(docName, timer);
    };

    // Listen to document updates
    const updateHandler = () => {
      debouncedSave();
    };

    ydoc.on('update', updateHandler);

    console.log(' Auto-save enabled (every 3s after changes)');
  },

  async writeState(docName, ydoc) {
    console.log('\n========================================');
    console.log(' WRITE STATE (Save to Backend)');
    console.log('========================================');
    console.log('Document:', docName);
    
    const now = Date.now();
    const lastSave = lastSaveTime.get(docName) || 0;
    
    if (now - lastSave < MIN_SAVE_INTERVAL) {
      console.log(' Skipping save (too soon - only ' + (now - lastSave) + 'ms since last save)');
      console.log('========================================\n');
      return;
    }
    
    const nodes = ydoc.getMap('nodes');
    const edges = ydoc.getArray('edges');
    
    if (nodes.size === 0) {
      console.log(' Skipping save - empty document');
      console.log('========================================\n');
      return;
    }

    const snapshot = createSnapshotFromDoc(ydoc, {
      createdBy: 'realtime',
      reason: 'autosave'
    });

    console.log('Snapshot created:');
    console.log('   Encoded state length:', snapshot.encodedState.length);
    console.log('   Nodes:', nodes.size);
    console.log('   Edges:', edges.length);
    
    console.log('    NODE DATA:');
    nodes.forEach((value, key) => {
      console.log(`      ${key}: ${value.label || '(empty)'}`);
    });

    try {
      const response = await axios.post(
        `${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/snapshot`,
        { snapshot },
        { 
          headers: { 'x-service-token': CONFIG.SERVICE_TOKEN },
          timeout: 5000
        }
      );
      
      // Cập nhật thời gian save
      lastSaveTime.set(docName, now);
      
      console.log(' Saved to backend');
      console.log('   Response:', response.data);
      console.log('   Time since last save:', now - lastSave + 'ms');
      console.log('========================================\n');
    } catch (err) {
      console.error(' Failed to save:', err.message);
      if (err.response) {
        console.error('   Status:', err.response.status);
        console.error('   Data:', err.response.data);
      }
      console.log('========================================\n');
      throw err;
    }
  },

  cleanup(docName) {
    if (saveTimers.has(docName)) {
      clearTimeout(saveTimers.get(docName));
      saveTimers.delete(docName);
      console.log(` Cleared auto-save timer for ${docName}`);
    }
    
    // Xóa tracking time
    lastSaveTime.delete(docName);
  }
};