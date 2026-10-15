jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))

const { Platform } = require('react-native')
const { nativeLaunchPolicy } = require('../../config/launchPolicy')
const { launchFacade } = require('../../features/launch/launchFacade')

const localUser = { id: 'local:device', registrationCompleted: false }
const accountUser = { id: 'account:alex', username: 'alex', registrationCompleted: false }

beforeEach(() => {
  Platform.OS = 'android'
  Object.assign(nativeLaunchPolicy, {
    accountsEnabled: false,
    backendEnabled: false,
    syncEnabled: false,
  })
})

it('resolves local and connected auth destinations while preserving legal routes', () => {
  const localRoute = {
    isAuthenticated: true,
    user: localUser,
    profileOwnerId: 'local:device',
    firstSegment: '(tabs)',
    secondSegment: undefined,
  }
  expect(launchFacade.auth.resolveDestination(localRoute)).toBe('/welcome')
  expect(launchFacade.auth.resolveDestination({ ...localRoute, firstSegment: 'legal' })).toBeNull()
  expect(
    launchFacade.auth.resolveDestination({ ...localRoute, firstSegment: 'welcome' })
  ).toBeNull()
  expect(
    launchFacade.auth.resolveDestination({
      ...localRoute,
      firstSegment: 'welcome',
      secondSegment: 'register',
    })
  ).toBeNull()
  expect(
    launchFacade.auth.resolveDestination({
      ...localRoute,
      user: { ...localUser, registrationCompleted: true },
      firstSegment: 'welcome',
    })
  ).toBe('/(tabs)')

  Platform.OS = 'web'
  expect(launchFacade.auth.resolveDestination({ ...localRoute, isAuthenticated: false })).toBe(
    '/welcome'
  )
  expect(
    launchFacade.auth.resolveDestination({
      ...localRoute,
      user: accountUser,
      profileOwnerId: 'account:alex',
      firstSegment: '(tabs)',
    })
  ).toBe('/welcome/register')
})

it('returns onboarding data and keeps late local hydration from requesting a step reset', () => {
  expect(launchFacade.onboarding.initialization(localUser)).toMatchObject({
    startAt: null,
    notice: null,
    values: {},
  })
  expect(launchFacade.onboarding.accountStep().action).toEqual({
    kind: 'continue',
    label: 'I Agree',
  })
  expect(
    launchFacade.onboarding.isStepValid(1, {
      firstName: '',
      lastName: '',
      username: '',
      weight: 70,
      height: 170,
    })
  ).toBe(true)

  Platform.OS = 'web'
  expect(launchFacade.onboarding.initialization(accountUser)).toMatchObject({
    startAt: 1,
    notice: 'Please complete your profile details to continue.',
    values: { isWorkOSAuth: true },
  })
  expect(launchFacade.onboarding.accountStep().action).toEqual({
    kind: 'workos',
    label: 'Sign Up with WorkOS',
  })
  expect(
    launchFacade.onboarding.isStepValid(1, {
      firstName: '',
      lastName: '',
      username: '',
      weight: 70,
      height: 170,
    })
  ).toBe(false)
})

it('builds account and sync settings presentation from the selected launch behavior', () => {
  expect(launchFacade.settings.accountPage(localUser)).toMatchObject({
    description: 'Your training profile is stored on this device.',
    email: null,
    accountActions: [],
  })
  expect(launchFacade.settings.syncPage()).toMatchObject({
    kind: 'local-storage',
    title: 'Local storage',
  })

  Platform.OS = 'web'
  expect(launchFacade.settings.accountPage(accountUser)).toMatchObject({
    description: 'Your signed-in account.',
    email: { label: 'Email', value: 'Not set' },
    accountActions: [{ kind: 'sign-out' }, { kind: 'delete-account' }],
  })
  expect(launchFacade.settings.syncPage()).toMatchObject({
    kind: 'synchronization',
    title: 'Synchronization',
  })
})

it('keeps backend, sync, and account policies independently enforced', () => {
  expect(() => launchFacade.api.assertBackendRequestsAllowed()).toThrow(
    'Backend requests are disabled by the native launch policy'
  )
  expect(launchFacade.sync.queueMode()).toBe('local-only')
  expect(launchFacade.auth.accountActionDecision().kind).toBe('unavailable')
  nativeLaunchPolicy.backendEnabled = true
  expect(launchFacade.api.backendMode()).toBe('remote')
  expect(launchFacade.sync.queueMode()).toBe('local-only')
  expect(launchFacade.auth.getStartupPlan().kind).toBe('local-profile')

  nativeLaunchPolicy.accountsEnabled = true
  nativeLaunchPolicy.syncEnabled = true
  expect(launchFacade.auth.accountActionDecision().kind).toBe('available')
  expect(launchFacade.sync.queueMode()).toBe('active')
  nativeLaunchPolicy.backendEnabled = false
  expect(launchFacade.sync.queueMode()).toBe('local-only')
  expect(nativeLaunchPolicy.otaUpdatesEnabled).toBe(true)

  Platform.OS = 'web'
  expect(launchFacade.api.backendMode()).toBe('remote')
  expect(launchFacade.sync.queueMode()).toBe('active')
})
