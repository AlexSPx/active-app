let mockNativeOfflineLaunch = true
const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockUpdateUserProfile = jest.fn()
const mockToastShow = jest.fn()

jest.mock('../../config/launchPolicy', () => ({
  ...jest.requireActual('../../config/launchPolicy'),
  isNativeOfflineLaunch: () => mockNativeOfflineLaunch,
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  Link: ({ children }) => children,
}))

jest.mock('@tamagui/toast', () => ({
  useToastController: () => ({ show: mockToastShow }),
}))

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}))

jest.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'local:device', registrationCompleted: false },
    logout: jest.fn(),
  }),
}))

jest.mock('../../features/settings', () => ({
  useUpdateUser: () => ({
    updateUserProfile: mockUpdateUserProfile,
    isUpdating: false,
    error: null,
  }),
}))

jest.mock('../../components/ui/WheelSelector', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('../../components/TimeZoneSelector', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('../../components/NotificationPermissions', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('../../components/WorkOSSignInButton', () => {
  const React = require('react')
  return {
    WorkOSSignInButton: () => React.createElement('mock-workos-button'),
  }
})

jest.mock('../../components/ui/InputField', () => {
  const React = require('react')
  return {
    InputField: (props) => React.createElement('mock-input', props),
  }
})

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

jest.mock('@tamagui/lucide-icons', () => ({
  Clock: () => null,
  Ruler: () => null,
  Weight: () => null,
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const RegisterPage = require('../../app/welcome/register').default

describe('RegisterPage with native offline launch', () => {
  beforeEach(() => {
    mockNativeOfflineLaunch = true
    mockReplace.mockReset()
    mockBack.mockReset()
    mockUpdateUserProfile.mockReset()
    mockToastShow.mockReset()
  })

  it('renders Step 0 with local profile setup and Get Started button replacing WorkOS', async () => {
    let root
    await act(async () => {
      root = create(React.createElement(RegisterPage))
    })

    const title = root.root.findByType('H2')
    expect(title.props.children).toBe('Set Up Profile')

    // WorkOS button should not be rendered
    expect(root.root.findAllByType('mock-workos-button')).toHaveLength(0)

    // Should find the "Get Started" button in Step 0
    const buttons = root.root.findAllByType('Button')
    const getStartedBtn = buttons.find((b) => {
      const text = b.findAllByType('Text')
      return text.some((t) => t.props.children === 'Get Started')
    })
    expect(getStartedBtn).toBeDefined()

    // Next button in footer should be enabled for step 0 in offline launch
    const nextBtn = buttons.find((b) => {
      const text = b.findAllByType('Text')
      return text.some((t) => t.props.children === 'Next')
    })
    expect(nextBtn.props.disabled).toBe(false)

    await act(async () => root.unmount())
  })

  it('advances from Step 0 to Step 1 upon tapping Get Started', async () => {
    let root
    await act(async () => {
      root = create(React.createElement(RegisterPage))
    })

    const buttons = root.root.findAllByType('Button')
    const getStartedBtn = buttons.find((b) => {
      const text = b.findAllByType('Text')
      return text.some((t) => t.props.children === 'Get Started')
    })

    await act(async () => {
      getStartedBtn.props.onPress()
    })

    // Now on Step 1: Personal
    const stepLabel = root.root.findAllByType('Text').find((t) => t.props.children === 'Personal')
    expect(stepLabel).toBeDefined()

    // Should have 3 input fields for Personal: Username, First Name, Last Name
    const inputs = root.root.findAllByType('mock-input')
    expect(inputs.length).toBe(3)

    await act(async () => root.unmount())
  })

  it('completes the full flow and calls updateUserProfile with localPreferences', async () => {
    mockUpdateUserProfile.mockResolvedValue({ id: 'local:device', registrationCompleted: true })

    let root
    await act(async () => {
      root = create(React.createElement(RegisterPage))
    })

    // Step 0 -> Step 1
    const getNextBtn = () => {
      const buttons = root.root.findAllByType('Button')
      return buttons.find((b) => {
        const text = b.findAllByType('Text')
        return text.some((t) => t.props.children === 'Next' || t.props.children === 'Finish')
      })
    }

    // Step 0: click Next
    await act(async () => {
      getNextBtn().props.onPress()
    })

    // Step 1 (Personal): click Next
    await act(async () => {
      getNextBtn().props.onPress()
    })

    // Step 2 (Body): click Next
    await act(async () => {
      getNextBtn().props.onPress()
    })

    // Step 3 (Time Zone): click Next
    await act(async () => {
      getNextBtn().props.onPress()
    })

    // Step 4 (Notifications): click Finish
    await act(async () => {
      getNextBtn().props.onPress()
    })

    expect(mockUpdateUserProfile).toHaveBeenCalledTimes(1)
    const [updatePayload, localPrefs] = mockUpdateUserProfile.mock.calls[0]
    expect(updatePayload.registrationCompleted).toBe(true)
    expect(localPrefs).toEqual({
      bodyWeightUnit: 'kg',
      heightUnit: 'cm',
    })
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')

    await act(async () => root.unmount())
  })
})
