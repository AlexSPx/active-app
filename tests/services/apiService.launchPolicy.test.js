let mockPreferenceValues = new Map()
let mockSecureItems = new Map()

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key) => mockPreferenceValues.get(key) ?? null),
    setItem: jest.fn(async (key, value) => mockPreferenceValues.set(key, value)),
    removeItem: jest.fn(async (key) => mockPreferenceValues.delete(key)),
    multiRemove: jest.fn(async (keys) => keys.forEach((key) => mockPreferenceValues.delete(key))),
  },
}))
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: jest.fn(() => ({})) }), {
  virtual: true,
})
jest.mock(
  'expo-secure-store',
  () => ({
    getItemAsync: jest.fn(async (key) => mockSecureItems.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => mockSecureItems.set(key, value)),
    deleteItemAsync: jest.fn(async (key) => mockSecureItems.delete(key)),
  }),
  { virtual: true }
)

function boot() {
  jest.resetModules()
  const network = require('../../stores/networkStore')
  const { apiService } = require('../../services/apiService')
  return { ...network, apiService }
}

beforeEach(() => {
  mockPreferenceValues = new Map()
  mockSecureItems = new Map()
  global.fetch = jest.fn()
})

test('blocks native API and refresh dispatch after manual offline is cleared', async () => {
  mockSecureItems.set('auth_token', 'retained-access-token')
  mockSecureItems.set('refresh_token', 'retained-refresh-token')
  const { apiService, networkPolicy, useNetworkStore } = boot()
  await networkPolicy.ready()
  await useNetworkStore.getState().setManualOffline(false)

  const requests = [
    apiService.getWorkouts(),
    apiService.refreshToken(),
    apiService.getPrivacyPolicy(),
    apiService.probeAvailability(),
  ]

  for (const request of requests) {
    await expect(request).rejects.toMatchObject({ code: 'BACKEND_DISABLED' })
  }
  expect(global.fetch).not.toHaveBeenCalled()
  expect(require('expo-secure-store').getItemAsync).not.toHaveBeenCalled()
  expect(useNetworkStore.getState().manualOffline).toBe(false)
})
