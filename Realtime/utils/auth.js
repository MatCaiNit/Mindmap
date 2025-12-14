const axios = require('axios')
const { CONFIG } = require('../config')

module.exports.authenticate = async function authenticate(req) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const docName = url.pathname.slice(1) // ydocId

  const token = url.searchParams.get('token')
  if (!token) {
    throw new Error('Missing access token')
  }

  // Gọi BE để verify quyền
  const res = await axios.post(
    `${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/verify-access`,
    {},
    {
      headers: {
        'x-service-token': CONFIG.SERVICE_TOKEN,
        Authorization: `Bearer ${token}`
      }
    }
  )

  return {
    docName,
    user: res.data.user || null,
    role: res.data.role,
    hasAccess: res.data.hasAccess
  }
}
