import React, { createContext, useContext, useEffect, ReactNode } from 'react'
import { useAuthStore, initializeAuth } from '../stores/authStore'
import { AuthRepository } from '../lib/repositories'
import type { User, LoginRequest, RegisterRequest, UpdateUserRequest } from '../types/api'

const authRepository = new AuthRepository()

interface AuthContextType {
  isAuthenticated: boolean
  login: (credentials: LoginRequest) => Promise<void>
  register: (payload: RegisterRequest) => Promise<void>
  logout: () => Promise<void>
  updateUser: (payload: UpdateUserRequest) => Promise<User | null>
  user: User | null
  isLoading: boolean
  error: string | null
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { isAuthenticated, user, isLoading, error, login, register, logout, clearError } =
    useAuthStore()
  const updateUser = useAuthStore((s) => s.updateUser)

  // Initialize auth state on mount
  useEffect(() => {
    // A server 401 invalidates remote access, but cached local profile access remains.
    authRepository.setUnauthorizedHandler(() => {
      useAuthStore.getState().markServerSessionInvalid()
    })

    initializeAuth().catch((error) => {
      console.error('Failed to initialize auth:', error)
    })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        login,
        register,
        logout,
        updateUser,
        user,
        isLoading,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
