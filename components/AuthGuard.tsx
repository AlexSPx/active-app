import { useAuth } from '../contexts/AuthContext'
import LoginPage from '../app/welcome/login'
import { RootLayoutNav } from '../components/RootLayoutNav'

export function AuthGuard() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return <RootLayoutNav />
}
