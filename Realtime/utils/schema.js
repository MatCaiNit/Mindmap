// Realtime/utils/schema.js

const SNAPSHOT_SCHEMA_VERSION = 1

function createSnapshotSchema(encodedState, meta = {}) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,

    // Yjs encoded state (base64)
    encodedState,

    // Metadata
    meta: {
      clientCount: meta.clientCount || 0,
      createdBy: meta.createdBy || 'realtime',
      reason: meta.reason || 'autosave'
    },

    createdAt: new Date().toISOString()
  }
}

function validateSnapshotSchema(snapshot) {
  if (!snapshot) return false
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return false
  if (typeof snapshot.encodedState !== 'string') return false
  return true
}

module.exports = {
  SNAPSHOT_SCHEMA_VERSION,
  createSnapshotSchema,
  validateSnapshotSchema
}
