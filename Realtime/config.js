require('dotenv').config()

module.exports.CONFIG = {
  PORT: process.env.PORT || 1234,
  BACKEND_URL: process.env.BACKEND_URL,
  SERVICE_TOKEN: process.env.REALTIME_SERVICE_TOKEN
}
