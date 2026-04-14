const axios = require('axios')
const jwt = require('jsonwebtoken')
const { CONFIG } = require('../config')

module.exports.authenticate = async function authenticate(req) {
  console.log(' ===== WebSocket Authentication =====')
  console.log(' Request URL:', req.url)
  console.log(' Host:', req.headers.host)
  
  const url = new URL(req.url, `http://${req.headers.host}`)
  const docName = url.pathname.slice(1) // Remove leading "/"

  console.log(' Doc name:', docName)

  const token = url.searchParams.get('token')
  if (!token) {
    console.error(' Missing access token in query params')
    throw new Error('Missing access token')
  }

  console.log(' Token received (first 40 chars):', token.substring(0, 40) + '...')

  // Step 1: Verify JWT locally (quick validation)
  let userId
  try {
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret'
    console.log(' Verifying JWT with secret:', jwtSecret === 'dev_secret' ? 'dev_secret (default)' : 'custom')
    
    const decoded = jwt.verify(token, jwtSecret)
    userId = decoded.id
    
    console.log(' JWT valid!')
    console.log('   User ID:', userId)
    console.log('   Email:', decoded.email)
    console.log('   Expires:', new Date(decoded.exp * 1000).toISOString())
  } catch (err) {
    console.error(' JWT verification failed:', err.message)
    console.error('   JWT error name:', err.name)
    throw new Error('Invalid token: ' + err.message)
  }

  // Step 2: Verify access with Backend
  try {
    const verifyUrl = `${CONFIG.BACKEND_URL}/api/internal/mindmaps/${docName}/verify-access`
    console.log(' Verifying access at:', verifyUrl)
    console.log('   Service token:', CONFIG.SERVICE_TOKEN ? 'SET' : 'NOT SET')

    const res = await axios.post(
      verifyUrl,
      {},
      {
        headers: {
          'x-service-token': CONFIG.SERVICE_TOKEN,
          'Authorization': `Bearer ${token}`
        },
        timeout: 5000
      }
    )

    console.log(' Backend verification success!')
    console.log('   Has access:', res.data.hasAccess)
    console.log('   Role:', res.data.role)
    console.log('   Mindmap ID:', res.data.mindmapId)

    if (!res.data.hasAccess) {
      console.error(' User denied access to mindmap')
      throw new Error('Access denied')
    }

    console.log(' Authentication successful!')
    console.log('=====================================\n')

    return {
      docName,
      user: { id: userId },
      role: res.data.role,
      hasAccess: true
    }
  } catch (err) {
    console.error(' Backend verification failed:', err.message)
    
    if (err.response) {
      console.error('   Backend status:', err.response.status)
      console.error('   Backend data:', err.response.data)
    } else if (err.code) {
      console.error('   Error code:', err.code)
      if (err.code === 'ECONNREFUSED') {
        console.error('     Cannot connect to Backend! Is it running?')
      }
    }
    
    throw err
  }
}