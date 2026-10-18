const mockUser = { id: 'local:device', registrationCompleted: false }
const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockCanGoBack = jest.fn(() => true)
const mockUpdateUserProfile = jest.fn()

jest.mock('../../config/launchPolicy', () => ({
  ...jest.requireActual('../../config/launchPolicy'),
  isNativeOfflineLaunch: () => true,
}))

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
    Link: ({ children }) => React.createElement(React.Fragment, null, children),
  }
})

jest.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}))

jest.mock('../../features/settings', () => ({
  useUpdateUser: () => ({
    updateUserProfile: mockUpdateUserProfile,
    isUpdating: false,
    error: null,
  }),
}))

jest.mock('../../components/NotificationPermissions', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    Button: ({ children, ...props }) => React.createElement('Button', props, children),
    UiText: ({ children, ...props }) => React.createElement('UiText', props, children),
    Surface: ({ children, ...props }) => React.createElement('Surface', props, children),
    TextField: ({ id, ...props }) => React.createElement('TextField', { nativeID: id, ...props }),
    SegmentedSelection: (props) => React.createElement('SegmentedSelection', props),
  }
})

jest.mock('../../components/ui/icons', () => {
  const React = require('react')
  const icon = (name) => (props) => React.createElement(name, props)
  return {
    BarChart2: icon('BarChart2'),
    Calendar: icon('Calendar'),
    ChevronLeft: icon('ChevronLeft'),
    Clock: icon('Clock'),
    Clock3: icon('Clock3'),
    Dumbbell: icon('Dumbbell'),
    Ruler: icon('Ruler'),
    Weight: icon('Weight'),
  }
})

jest.mock('../../components/ui/useCadenceColors', () => ({
  useCadenceColors: () => ({ accent: '#6b4f7b', foreground: '#241e27', muted: '#77717b' }),
}))

jest.mock('../../components/WorkOSSignInButton', () => ({
  WorkOSSignInButton: () => null,
}))

jest.mock('../../components/feedback/FeedbackProvider', () => ({
  useFeedback: () => ({ show: jest.fn() }),
}))

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}))

jest.mock('tamagui', () => {
  const React = require('react')
  const component = (name) => (props) => React.createElement(name, props, props.children)
  return {
    YStack: component('YStack'),
    XStack: component('XStack'),
    Text: component('Text'),
    Button: component('Button'),
    H2: component('H2'),
    ScrollView: component('ScrollView'),
    Label: component('Label'),
    AnimatePresence: ({ children }) => children,
  }
})

const React = require('react')
const { act, create } = require('react-test-renderer')
const RegisterPage = require('../../app/welcome/register').default

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  mockReplace.mockReset()
  mockBack.mockReset()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockUpdateUserProfile.mockReset()
})

async function renderRegistration() {
  let root
  await act(async () => {
    root = create(React.createElement(RegisterPage))
  })
  return root
}

function findButton(root, label) {
  return root.root.findAllByType('Button').find((button) => button.props.children === label)
}

function findField(root, label) {
  return root.root
    .findAllByType('TextField')
    .find((field) => field.props.accessibilityLabel === label)
}

function findText(root, text) {
  return root.root.findAllByType('UiText').find((node) => node.props.children === text)
}

test('the local profile agreement is required before personal details', async () => {
  const root = await renderRegistration()

  expect(findText(root, 'Your local profile')).toBeTruthy()
  const continueButton = findButton(root, 'Continue')
  expect(continueButton.props.disabled).toBe(true)

  await act(async () => continueButton.props.onPress())
  expect(findText(root, 'Your local profile')).toBeTruthy()
  expect(mockUpdateUserProfile).not.toHaveBeenCalled()

  const agreement = root.root.findByProps({
    accessibilityLabel: 'Agree to the Terms of Service and acknowledge the Privacy Policy',
  })
  await act(async () => agreement.props.onValueChange(true))
  expect(findButton(root, 'Continue').props.disabled).toBe(false)

  await act(async () => findButton(root, 'Continue').props.onPress())
  expect(findText(root, 'Personal details')).toBeTruthy()
  await act(async () => root.unmount())
})

test('values and unit conversion survive back and forward, including a failed save', async () => {
  mockUpdateUserProfile
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'local:device', registrationCompleted: true })
  const root = await renderRegistration()

  const agreement = root.root.findByProps({
    accessibilityLabel: 'Agree to the Terms of Service and acknowledge the Privacy Policy',
  })
  await act(async () => agreement.props.onValueChange(true))
  await act(async () => findButton(root, 'Continue').props.onPress())

  await act(async () => findField(root, 'Username').props.onChangeText('cadence'))
  await act(async () => findField(root, 'First name').props.onChangeText('Ava'))
  await act(async () => findField(root, 'Last name').props.onChangeText('Stone'))
  await act(async () => findButton(root, 'Continue').props.onPress())

  expect(findText(root, 'Body measurements')).toBeTruthy()
  expect(findField(root, 'Weight').props.value).toBe('70')
  expect(findField(root, 'Height').props.value).toBe('170')

  const weightUnits = root.root.findAllByType('SegmentedSelection')[0]
  await act(async () => weightUnits.props.onValueChange('lb'))
  expect(findField(root, 'Weight').props.value).toBe('154.3')
  await act(async () => findField(root, 'Weight').props.onChangeText(''))
  await act(async () => findField(root, 'Height').props.onChangeText(''))
  await act(async () => findButton(root, 'Continue').props.onPress())
  expect(findText(root, 'Notifications')).toBeTruthy()
  await act(async () => findButton(root, 'Back').props.onPress())
  expect(findField(root, 'Weight').props.value).toBe('')
  expect(findField(root, 'Height').props.value).toBe('')
  await act(async () => findField(root, 'Weight').props.onChangeText('176'))
  await act(async () => findField(root, 'Height').props.onChangeText('180'))

  await act(async () => findButton(root, 'Continue').props.onPress())
  expect(findText(root, 'Notifications')).toBeTruthy()

  await act(async () => findButton(root, 'Back').props.onPress())
  expect(findField(root, 'Weight').props.value).toBe('176')
  expect(findField(root, 'Height').props.value).toBe('180')
  await act(async () => findButton(root, 'Back').props.onPress())
  expect(findField(root, 'Username').props.value).toBe('cadence')
  expect(findField(root, 'First name').props.value).toBe('Ava')
  await act(async () => findButton(root, 'Continue').props.onPress())
  await act(async () => findButton(root, 'Continue').props.onPress())

  await act(async () => findButton(root, 'Finish setup').props.onPress())
  expect(mockUpdateUserProfile).toHaveBeenCalledTimes(1)
  const [update, preferences] = mockUpdateUserProfile.mock.calls[0]
  expect(update).toMatchObject({
    username: 'cadence',
    firstName: 'Ava',
    lastName: 'Stone',
    measurements: { weightKg: 176 / 2.2046226218, heightCm: 180 },
    registrationCompleted: true,
  })
  expect(preferences).toEqual({ bodyWeightUnit: 'lb', heightUnit: 'cm' })
  expect(mockReplace).not.toHaveBeenCalled()
  expect(
    root.root
      .findAllByType('UiText')
      .some((node) => String(node.props.children).includes('Your profile could not be saved'))
  ).toBe(true)

  await act(async () => findButton(root, 'Back').props.onPress())
  expect(findField(root, 'Weight').props.value).toBe('176')
  expect(findField(root, 'Height').props.value).toBe('180')

  await act(async () => findField(root, 'Weight').props.onChangeText(''))
  await act(async () => findField(root, 'Height').props.onChangeText(''))
  await act(async () => findButton(root, 'Continue').props.onPress())
  expect(findText(root, 'Notifications')).toBeTruthy()
  await act(async () => findButton(root, 'Finish setup').props.onPress())

  expect(mockUpdateUserProfile).toHaveBeenCalledTimes(2)
  const [optionalUpdate, optionalPreferences] = mockUpdateUserProfile.mock.calls[1]
  expect(optionalUpdate).toMatchObject({
    measurements: { weightKg: null, heightCm: null },
    registrationCompleted: true,
  })
  expect(optionalPreferences).toEqual({ bodyWeightUnit: 'lb', heightUnit: 'cm' })
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  await act(async () => root.unmount())
})
