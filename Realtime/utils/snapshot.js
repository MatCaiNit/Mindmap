// Realtime/utils/snapshot.js
const Y = require('yjs');
const { createSnapshotSchema } = require('./schema');

function createSnapshotFromDoc(ydoc, meta = {}) {
  const update = Y.encodeStateAsUpdate(ydoc);
  const encodedState = Buffer.from(update).toString('base64');

  return createSnapshotSchema(encodedState, meta);
}

module.exports = {
  createSnapshotFromDoc
};
