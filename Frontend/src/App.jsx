// Frontend/src/App.jsx - UPDATED
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Pages
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import EditorPage from './pages/editor/EditorPage'
import ProfilePage from './pages/profile/ProfilePage'

// Layout
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/mindmap/:id" element={<EditorPage />} />
          </Route>
        </Route>

        {/* Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App