const axios = require('axios')
const { encodeStateAsUpdate, applyUpdate } = require('yjs')
const Y = require('yjs')
const { CONFIG } = require('../config')

const docs = new Map()

module.exports.persistence = {
  async bindState(docName, ydoc) {
    docs.set(docName, ydoc)

    // Load snapshot từ BE
    try {
      const res = await axios.get(
        `${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/snapshot`,
        {
          headers: {
            'x-service-token': CONFIG.SERVICE_TOKEN
          }
        }
      )

      if (res.data?.snapshot) {
        const update = Buffer.from(res.data.snapshot, 'base64')
        applyUpdate(ydoc, update)
      }
    } catch (err) {
      console.warn('⚠️ No snapshot found:', docName)
    }
  },

  async writeState(docName, ydoc) {
    const update = encodeStateAsUpdate(ydoc)
    const snapshot = Buffer.from(update).toString('base64')

    await axios.post(
      `${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/snapshot`,
      { snapshot },
      {
        headers: {
          'x-service-token': CONFIG.SERVICE_TOKEN
        }
      }
    )
  }
}
