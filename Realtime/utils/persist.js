// Realtime/utils/persist.js
import axios from 'axios';
import * as Y from 'yjs';
import { CONFIG } from '../config.js';

// Tạo axios instance với headers chung
const apiClient = axios.create({
  baseURL: CONFIG.BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-service-token': CONFIG.SERVICE_TOKEN
  },
  timeout: 5000
});

/**
 * Load Snapshot từ Backend (GET)
 * @param {string} docName - ydocId
 * @returns {Uint8Array|null} - Yjs binary snapshot
 */
export async function loadSnapshot(docName) {
  try {
    const url = `/api/internal/mindmaps/${docName}/snapshot`;
    const response = await apiClient.get(url);
    const { snapshot } = response.data;

    if (snapshot) {
      // Chuyển Base64 -> Buffer -> Uint8Array (Yjs format)
      const buffer = Buffer.from(snapshot, 'base64');
      console.log(`[Persist] ✅ Loaded snapshot: ${docName} (${buffer.length} bytes)`);
      return Uint8Array.from(buffer);
    }
    
    console.log(`[Persist] ℹ️  No snapshot found for: ${docName}`);
    return null;
  } catch (err) {
    // 404 là bình thường với mindmap mới
    if (err.response?.status === 404) {
      console.log(`[Persist] ℹ️  New document (404): ${docName}`);
    } else {
      console.error(`[Persist] Load Error (${docName}):`, err.message);
    }
    return null;
  }
}

/**
 * Save Snapshot xuống Backend (POST)
 * @param {string} docName - ydocId
 * @param {Y.Doc} ydoc - Yjs document
 */
export async function saveSnapshot(docName, ydoc) {
  try {
    // Encode toàn bộ state của document
    const stateUpdate = Y.encodeStateAsUpdate(ydoc);
    const base64Snapshot = Buffer.from(stateUpdate).toString('base64');

    const url = `/api/internal/mindmaps/${docName}/snapshot`;
    await apiClient.post(url, { snapshot: base64Snapshot });
    
    console.log(`[Persist] ✅ Saved snapshot: ${docName} (${stateUpdate.length} bytes)`);
  } catch (err) {
    console.error(`[Persist] Save Error (${docName}):`, err.message);
    
    // Retry logic cho network errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.log(`[Persist] Will retry on next update...`);
    }
  }
}