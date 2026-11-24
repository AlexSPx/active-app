const React = require('react')
const { act, create } = require('react-test-renderer')
let mockState
const mockSave = jest.fn(async (_scope, changes) => {
  Object.assign(mockState, changes)
})
const mockUpdate = jest.fn(async (updates) => {
  mockState.bodyWeight = updates.measurements.weightKg
  return { id: 'local:device', ...updates }
})
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ updateUser: mockUpdate }) }))
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}))
jest.mock('../../lib/hooks/useProfileQueryKeys', () => ({
  useProfileQueryKeys: () => ({ user: { me: [] }, records: { all: [] } }),
}))
jest.mock('../../lib/profileScope', () => ({
  getProfileScope: () => ({ ownerId: 'local', generation: 1 }),
  isCurrentProfile: () => true,
}))
jest.mock('../../features/settings/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => mockState },
  saveSettingsProfile: (...args) => mockSave(...args),
}))
const { useUpdateUser } = require('../../features/settings/hooks/useUpdateUser')

test('preserves an existing weight and appends repeated weigh-ins without overwriting history', async () => {
  mockState = { bodyWeight: 75, weightHistory: [] }
  mockSave.mockClear()
  let hook, view
  function Probe() {
    hook = useUpdateUser()
    return null
  }
  act(() => {
    view = create(React.createElement(Probe))
  })
  await act(async () => {
    await hook.updateUserProfile(
      { measurements: { weightKg: 76, heightCm: null } },
      { recordWeight: true }
    )
  })
  await act(async () => {
    await hook.updateUserProfile(
      { measurements: { weightKg: 76, heightCm: null } },
      { recordWeight: true }
    )
  })
  expect(mockState.weightHistory.map((entry) => entry.weightKg)).toEqual([75, 76, 76])
  expect(mockState.weightHistory[0].initial).toBe(true)
  expect(mockState.weightHistory[1].recordedAt).toBeTruthy()
  expect(mockSave).toHaveBeenCalledTimes(2)
  act(() => view.unmount())
})

test('first onboarding measurement is recorded once', async () => {
  mockState = { bodyWeight: null, weightHistory: [] }
  mockSave.mockClear()
  let hook, view
  function Probe() {
    hook = useUpdateUser()
    return null
  }
  act(() => {
    view = create(React.createElement(Probe))
  })
  await act(async () => {
    await hook.updateUserProfile(
      { measurements: { weightKg: 70, heightCm: null } },
      { bodyWeightUnit: 'kg' }
    )
  })
  expect(mockState.weightHistory.map((entry) => entry.weightKg)).toEqual([70])
  act(() => view.unmount())
})
