import { api } from '../lib/api'

export const googleAuthService = {
  async loginWithGoogle(credential) {
    console.log('Logging in with Google...')
    try {
      const response = await api.post('/auth/google', { credential: credential })
      console.log('Google login successful:', response.data.user)
      return response.data
    } catch (error) {
      console.error('Google login failed:', error)
      throw error
    }
  }
}