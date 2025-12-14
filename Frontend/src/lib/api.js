// ==========================================
// FILE: Frontend/src/lib/api.js
// ==========================================
import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - Handle 401 (refresh token logic)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const { refreshToken } = useAuthStore.getState()
        const response = await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken,
        })

        const { accessToken, refreshToken: newRefreshToken } = response.data
        useAuthStore.getState().setAuth(
          useAuthStore.getState().user,
          accessToken,
          newRefreshToken
        )

        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return api(originalRequest)
      } catch (err) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(err)
      }
    }

    return Promise.reject(error)
  }
)