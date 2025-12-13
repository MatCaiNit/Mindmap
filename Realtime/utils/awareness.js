// Realtime/utils/awareness.js
import * as awarenessProtocol from 'y-protocols/awareness.js';

/**
 * Tạo awareness cho 1 Y.Doc
 * @param {Y.Doc} ydoc 
 * @returns {awarenessProtocol.Awareness}
 */
export function createAwareness(ydoc) {
  const awareness = new awarenessProtocol.Awareness(ydoc);

  // Cleanup state rác (phòng crash client)
  awareness.on('change', ({ removed }) => {
    if (removed.length > 0) {
      // Note: Không cần removeStates ở đây vì 'removed' đã được cleanup
      console.log(`[Awareness] Cleaned up ${removed.length} clients`);
    }
  });

  return awareness;
}

/**
 * Helper: Encode awareness update để broadcast
 * @param {awarenessProtocol.Awareness} awareness 
 * @param {number[]} clients - Array of client IDs
 * @returns {Uint8Array}
 */
export function encodeAwarenessUpdate(awareness, clients) {
  return awarenessProtocol.encodeAwarenessUpdate(awareness, clients);
}

/**
 * Helper: Apply awareness update nhận từ remote
 * @param {awarenessProtocol.Awareness} awareness 
 * @param {Uint8Array} update 
 * @param {any} origin 
 */
export function applyAwarenessUpdate(awareness, update, origin) {
  awarenessProtocol.applyAwarenessUpdate(awareness, update, origin);
}