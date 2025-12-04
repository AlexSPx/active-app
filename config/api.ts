// Environment configuration
export const config = {
  // Base API URL - configurable via environment variable
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000',

  // API endpoints
  API_ENDPOINTS: {
    AUTH: {
      BASE: '/api/auth',
      LOGIN: '/api/auth/login',
      SIGNUP: '/api/auth/signup',
      REFRESH: '/api/auth/refresh',
    },
    USER: {
      ME: '/api/user/me',
      PUSH_TOKEN: '/api/user/me/push-token',
    },
    EXERCISES: {
      SEARCH: '/api/exercises/search',
      LOGS: '/api/exercises',
    },
    WORKOUTS: {
      CREATE: '/api/workouts',
      LIST: '/api/workouts',
      UPDATE: '/api/workouts',
      DELETE: '/api/workouts',
      RECORD: '/api/workouts/record',
    },
    ROUTINES: {
      CREATE: '/api/routines',
      LIST: '/api/routines',
      UPDATE: '/api/routines',
      DELETE: '/api/routines',
      ACTIVE: '/api/routines/active',
    },
    LEGAL: {
      TERMS: '/api/legal/terms-of-service',
      PRIVACY: '/api/legal/privacy-policy',
    },
  },

  // Request configuration
  REQUEST_TIMEOUT: 10000, // 10 seconds

  // Storage keys
  STORAGE_KEYS: {
    TOKEN: 'user_token',
    REFRESH_TOKEN: 'user_refresh_token',
    USER: 'user_data',
  },
}

// Helper to get full API URL
export const getApiUrl = (endpoint: string): string => {
  return `${config.API_BASE_URL}${endpoint}`
}
