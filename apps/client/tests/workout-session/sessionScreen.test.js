jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 80 }))
jest.mock('expo-router', () => ({
  Stack: { Screen: (props) => require('react').createElement('Screen', props) },
}))
jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#faf7fc', '#2d2235', '#76627e', '#dcd0e4', '#624572', '#faf5fc'],
}))
jest.mock('../../components/feedback/FeedbackProvider', () => ({
  useFeedback: () => ({ show: (...args) => mockToastShow(...args) }),
}))
jest.mock('@shopify/flash-list', () => {
  const React = require('react')
  return {
    FlashList: ({ ListHeaderComponent, ListFooterComponent }) =>
      React.createElement(
        'FlashList',
        null,
        React.createElement(ListHeaderComponent),
        ListFooterComponent ? React.createElement(ListFooterComponent) : null
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
    useRunningWorkoutStore: mockUseRunningWorkoutStore,
    RestTimerOverlay: () => null,
  }
})
jest.mock('../../navigation/useAppNavigation', () => ({
  useAppNavigation: () => ({ goBack: mockGoBack }),
}))
jest.mock('../../stores/authStore', () => ({
  useAuthStore: { getState: () => mockAuthState.current },
}))
jest.mock('../../features/workout-session/stores/runningWorkoutStore', () => ({
  useRunningWorkoutStore: mockUseRunningWorkoutStore,
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { useUiStore } = require('../../stores/uiStore')
const { LOCAL_PROFILE_OWNER, setActiveProfileOwner } = require('../../lib/profileScope')

const mockToastShow = jest.fn()
const mockGoBack = jest.fn()
const mockFinishWorkout = jest.fn()
const mockRunningWorkoutState = { current: null }
const mockUseRunningWorkoutStore = Object.assign(
  (selector) => selector({ runningWorkout: mockRunningWorkoutState.current }),
  { getState: () => ({ runningWorkout: mockRunningWorkoutState.current }) }
)
const mockSession = {
  exercises: [],
  workoutName: 'Workout',
  workoutTag: 'In Progress',
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
const WorkoutSessionScreen = require('../../app/workouts/session').default

describe('workout session completion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setActiveProfileOwner(LOCAL_PROFILE_OWNER)
    useUiStore.getState().reset()
    mockRunningWorkoutState.current = null
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
      resolveFinish({ kind: 'local', workoutRecord: { id: 'old_record' } })
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
    const response = { kind: 'local', workoutRecord: { id: 'current_record' } }
    let result
    await act(async () => {
      resolveFinish(response)
      result = await finishPromise
    })

    expect(result).toBe(true)
    expect(useUiStore.getState().finishedCongrats).toEqual({
      visible: true,
      payload: response,
    })
    expect(mockToastShow).not.toHaveBeenCalled()
    act(() => renderer.unmount())
  })

  it('allows the saved session to clear before its completion result is shown', async () => {
    mockRunningWorkoutState.current = {
      id: 'workout_a',
      startTime: '2026-10-18T10:00:00.000Z',
    }
    const { finishPromise, renderer, resolveFinish } = await beginDeferredFinish()
    const response = { kind: 'local', workoutRecord: { id: 'current_record' } }
    mockRunningWorkoutState.current = null

    let result
    await act(async () => {
      resolveFinish(response)
      result = await finishPromise
    })

    expect(result).toBe(true)
    expect(useUiStore.getState().finishedCongrats.payload).toEqual(response)
    act(() => renderer.unmount())
  })

  it('does not show a saved completion after a different session replaces it', async () => {
    mockRunningWorkoutState.current = {
      id: 'workout_a',
      startTime: '2026-10-18T10:00:00.000Z',
    }
    const { finishPromise, renderer, resolveFinish } = await beginDeferredFinish()
    mockRunningWorkoutState.current = {
      id: 'workout_b',
      startTime: '2026-10-18T10:05:00.000Z',
    }

    let result
    await act(async () => {
      resolveFinish({ kind: 'local', workoutRecord: { id: 'old_record' } })
      result = await finishPromise
    })

    expect(result).toBe(false)
    expect(useUiStore.getState().finishedCongrats.visible).toBe(false)
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
      resolveFinish({ kind: 'local', workoutRecord: { id: 'old_record' } })
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
