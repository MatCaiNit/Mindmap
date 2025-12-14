// ==========================================
// FILE: Frontend/src/services/authService.js
// ==========================================
import { api } from '../lib/api'

export const authService = {
  async register(email, password, name) {
    const response = await api.post('/auth/register', { email, password, name })
    return response.data
  },

  async login(email, password) {
    const response = await api.post('/auth/login', { email, password })
    return response.data
  },

  async refresh(refreshToken) {
    const response = await api.post('/auth/refresh', { refreshToken })
    return response.data
  },
}