jest.mock('tamagui', () => {
  const React = require('react')
  return {
    useTheme: () => ({}),
    View: ({ children }) => React.createElement('View', null, children),
    YStack: ({ children }) => React.createElement('YStack', null, children),
  }
})
jest.mock('@tamagui/toast', () => ({
  useToastController: () => ({ show: (...args) => mockToastShow(...args) }),
}))
jest.mock('@shopify/flash-list', () => {
  const React = require('react')
  return {
    FlashList: ({ ListHeaderComponent, ListFooterComponent }) =>
      React.createElement(
        'FlashList',
        null,
        React.createElement(ListHeaderComponent),
        React.createElement(ListFooterComponent)
      ),
  }
})
jest.mock('../../features/workout-session', () => {
  const React = require('react')
  return {
    WorkoutSessionExercise: () => null,
    WorkoutSessionHeader: () => null,
    WorkoutActions: ({ onFinishWorkout }) => {
      mockFinishHandler = onFinishWorkout
      return React.createElement('WorkoutActions')
    },
    useWorkoutSession: () => mockSession,
    RestTimerOverlay: () => null,
  }
})
jest.mock('../../navigation/useAppNavigation', () => ({
  useAppNavigation: () => ({ goBack: mockGoBack }),
}))
jest.mock('../../stores/authStore', () => ({
  useAuthStore: { getState: () => mockAuthState.current },
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { useUiStore } = require('../../stores/uiStore')
const { LOCAL_PROFILE_OWNER, setActiveProfileOwner } = require('../../lib/profileScope')
const WorkoutSessionScreen = require('../../app/workouts/session').default

const mockToastShow = jest.fn()
const mockGoBack = jest.fn()
const mockFinishWorkout = jest.fn()
const mockSession = {
  exercises: [],
  workoutName: 'Workout',
  workoutTag: 'In Progress',
  workoutDuration: '0:00',
  updateSet: jest.fn(),
  toggleSetComplete: jest.fn(),
  addSet: jest.fn(),
  removeSet: jest.fn(),
  startRestTimer: jest.fn(),
  extendRestTimer: jest.fn(),
  skipRestTimer: jest.fn(),
  finishWorkout: (...args) => mockFinishWorkout(...args),
  cancelWorkout: jest.fn(),
  activeTimer: null,
  restTime: 0,
  remainingRest: 0,
}
const mockAuthState = { current: null }
let mockFinishHandler

describe('workout session completion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    useUiStore.getState().reset()
    mockAuthState.current = {
      isAuthenticated: false,
      isProfileTransitioning: false,
      profileOwnerId: LOCAL_PROFILE_OWNER,
      user: null,
    }
    mockFinishHandler = null
  })

  async function beginDeferredFinish() {
    let resolveFinish
    let rejectFinish
    mockFinishWorkout.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          resolveFinish = resolve
          rejectFinish = reject
        })
    )
    let renderer
    act(() => {
      renderer = create(React.createElement(WorkoutSessionScreen))
    })
    let finishPromise
    await act(async () => {
      finishPromise = mockFinishHandler()
      await Promise.resolve()
    })
    return { finishPromise, renderer, resolveFinish, rejectFinish }
  }

  it('does not show an old completion when a save resolves during logout', async () => {
    const ownerId = 'account:user_a'
    setActiveProfileOwner(ownerId)
    mockAuthState.current = {
      isAuthenticated: true,
      isProfileTransitioning: false,
      profileOwnerId: ownerId,
      user: { id: 'user_a' },
    }
    const { finishPromise, renderer, resolveFinish } = await beginDeferredFinish()

    // Logout clears the overlay and an in-flight DB-ready callback clears its transition gate.
    useUiStore.getState().hideFinishedCongrats()
    mockAuthState.current = {
      ...mockAuthState.current,
      isAuthenticated: false,
      isProfileTransitioning: false,
      user: null,
    }
    let result
    await act(async () => {
      resolveFinish({ workoutRecord: { id: 'old_record' }, streakUpdate: { currentStreak: 0 } })
      result = await finishPromise
    })

    expect(result).toBe(false)
    expect(useUiStore.getState().finishedCongrats.visible).toBe(false)
    expect(mockToastShow).not.toHaveBeenCalled()
    act(() => renderer.unmount())
  })

  it('shows congrats when a save completes in the current profile', async () => {
    const ownerId = 'account:user_a'
    setActiveProfileOwner(ownerId)
    mockAuthState.current = {
      isAuthenticated: true,
      isProfileTransitioning: false,
      profileOwnerId: ownerId,
      user: { id: 'user_a' },
    }
    const { finishPromise, renderer, resolveFinish } = await beginDeferredFinish()
    const response = {
      workoutRecord: { id: 'current_record' },
      streakUpdate: { currentStreak: 2 },
    }
    let result
    await act(async () => {
      resolveFinish(response)
      result = await finishPromise
    })

    expect(result).toBe(true)
    expect(useUiStore.getState().finishedCongrats).toEqual({
      visible: true,
      payload: {
        record: response.workoutRecord,
        streak: response.streakUpdate,
      },
    })
    expect(mockToastShow).not.toHaveBeenCalled()
    act(() => renderer.unmount())
  })

  it('does not show a completion after its profile scope changes', async () => {
    const ownerId = 'account:user_a'
    setActiveProfileOwner(ownerId)
    mockAuthState.current = {
      isAuthenticated: true,
      isProfileTransitioning: false,
      profileOwnerId: ownerId,
      user: { id: 'user_a' },
    }
    const { finishPromise, renderer, resolveFinish } = await beginDeferredFinish()

    setActiveProfileOwner('account:user_b')
    mockAuthState.current = {
      isAuthenticated: true,
      isProfileTransitioning: false,
      profileOwnerId: 'account:user_b',
      user: { id: 'user_b' },
    }
    let result
    await act(async () => {
      resolveFinish({ workoutRecord: { id: 'old_record' }, streakUpdate: { currentStreak: 0 } })
      result = await finishPromise
    })

    expect(result).toBe(false)
    expect(useUiStore.getState().finishedCongrats.visible).toBe(false)
    expect(mockToastShow).not.toHaveBeenCalled()
    act(() => renderer.unmount())
  })

  it('does not show the retry toast for a missing result after logout', async () => {
    const ownerId = 'account:user_a'
    setActiveProfileOwner(ownerId)
    mockAuthState.current = {
      isAuthenticated: true,
      isProfileTransitioning: false,
      profileOwnerId: ownerId,
      user: { id: 'user_a' },
    }
    const { finishPromise, renderer, resolveFinish } = await beginDeferredFinish()

    useUiStore.getState().hideFinishedCongrats()
    mockAuthState.current = {
      ...mockAuthState.current,
      isAuthenticated: false,
      isProfileTransitioning: false,
      user: null,
    }
    let result
    await act(async () => {
      resolveFinish(undefined)
      result = await finishPromise
    })

    expect(result).toBe(false)
    expect(mockToastShow).not.toHaveBeenCalled()
    expect(useUiStore.getState().finishedCongrats.visible).toBe(false)
    act(() => renderer.unmount())
  })

  it('ignores a failed save that rejects after logout', async () => {
    const ownerId = 'account:user_a'
    setActiveProfileOwner(ownerId)
    mockAuthState.current = {
      isAuthenticated: true,
      isProfileTransitioning: false,
      profileOwnerId: ownerId,
      user: { id: 'user_a' },
    }
    const { finishPromise, renderer, rejectFinish } = await beginDeferredFinish()

    useUiStore.getState().hideFinishedCongrats()
    mockAuthState.current = {
      ...mockAuthState.current,
      isAuthenticated: false,
      isProfileTransitioning: false,
      user: null,
    }
    let result
    await act(async () => {
      rejectFinish(new Error('save failed'))
      result = await finishPromise
    })

    expect(result).toBe(false)
    expect(mockToastShow).not.toHaveBeenCalled()
    expect(useUiStore.getState().finishedCongrats.visible).toBe(false)
    act(() => renderer.unmount())
  })
})
