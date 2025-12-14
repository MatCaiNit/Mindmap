// ==========================================
// FILE: Frontend/src/components/auth/ProtectedRoute.jsx
// ==========================================
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => !!state.accessToken)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}