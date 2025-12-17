// Backend/utils/snapshotSchema.js
export const SNAPSHOT_SCHEMA_VERSION = 1;

export function createSnapshotSchema(encodedState, meta = {}) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,

    // Base64 Yjs update
    encodedState,

    meta: {
      createdBy: meta.createdBy || 'system',
      reason: meta.reason || 'autosave',
      clientCount: meta.clientCount || 0
    },

    createdAt: new Date().toISOString()
  };
}

export function validateSnapshotSchema(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid snapshot format');
  }

  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('Unsupported snapshot schema version');
  }

  if (typeof snapshot.encodedState !== 'string') {
    throw new Error('Snapshot encodedState missing');
  }

  return true;
}
