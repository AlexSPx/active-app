const React = require('react')
const { act, create } = require('react-test-renderer')
const mockUpdateUser = jest.fn()
const mockInvalidateQueries = jest.fn()

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ updateUser: mockUpdateUser }),
}))
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))
jest.mock('../../lib/hooks/useProfileQueryKeys', () => ({
  useProfileQueryKeys: () => ({ user: { me: ['user'] }, records: { all: ['records'] } }),
}))
jest.mock('../../features/settings/stores/settingsStore', () => ({
  saveSettingsProfile: jest.fn(),
}))

const { useUpdateUser } = require('../../features/settings/hooks/useUpdateUser')

let hook, view
beforeEach(() => {
  jest.clearAllMocks()
  mockUpdateUser.mockImplementation(async (updates) => ({ id: 'local:device', ...updates }))
  function Probe() {
    hook = useUpdateUser()
    return null
  }
  act(() => {
    view = create(React.createElement(Probe))
  })
})
afterEach(() => act(() => view.unmount()))

test.each(['UTC', 'Etc/UTC', 'Etc/GMT', 'Europe/Sofia'])(
  'saves onboarding with device timezone %s',
  async (timezone) => {
    const updates = { timezone, registrationCompleted: true }
    let saved
    await act(async () => {
      saved = await hook.updateUserProfile(updates)
    })
    expect(saved).toEqual({ id: 'local:device', ...updates })
    expect(mockUpdateUser).toHaveBeenCalledWith(updates)
    expect(hook.error).toBeNull()
  }
)

test('rejects an invalid timezone before saving', async () => {
  let saved
  await act(async () => {
    saved = await hook.updateUserProfile({ timezone: 'Invalid/Timezone' })
  })
  expect(saved).toBeNull()
  expect(mockUpdateUser).not.toHaveBeenCalled()
  expect(hook.error).toBe('Invalid timezone.')
})
