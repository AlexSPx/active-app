// Environment configuration
export const config = {
  // Base API URL - configurable via environment variable
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000',

  // API endpoints
  API_ENDPOINTS: {
    AUTH: {
      LOGIN: '/api/auth/login',
      SIGNUP: '/api/auth/signup',
    },
    USER: {
      ME: '/api/user/me',
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
  },

  // Request configuration
  REQUEST_TIMEOUT: 10000, // 10 seconds

  // Storage keys
  STORAGE_KEYS: {
    TOKEN: 'user_token',
    USER: 'user_data',
  },
}

// Helper to get full API URL
export const getApiUrl = (endpoint: string): string => {
  return `${config.API_BASE_URL}${endpoint}`
}
