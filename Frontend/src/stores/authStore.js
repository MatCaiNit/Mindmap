// ==========================================
// FILE: Frontend/src/stores/authStore.js
// ==========================================
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      
      setAuth: (user, accessToken, refreshToken) => 
        set({ user, accessToken, refreshToken }),
      
      logout: () => 
        set({ user: null, accessToken: null, refreshToken: null }),
      
      isAuthenticated: () => {
        const state = useAuthStore.getState()
        return !!state.accessToken
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)
