const mockReact = require('react')
const { act, create } = require('react-test-renderer')

const mockAlert = jest.fn()
const mockDispatch = jest.fn()
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() }
let mockOnPreventRemove
let mockPreventRemoveEnabled

jest.mock('react-native', () => ({
  Alert: { alert: mockAlert },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'ios' },
  ScrollView: 'ScrollView',
  View: 'View',
}))
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (enabled, listener) => {
    mockPreventRemoveEnabled = enabled
    mockOnPreventRemove = listener
  },
}))
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }))
jest.mock('expo-router', () => ({
  Stack: { Screen: 'Screen' },
  useRouter: () => mockRouter,
}))
jest.mock('../../components/ui/Controls', () => ({
  Button: 'Button',
  Surface: 'Surface',
  TextField: 'TextField',
  UiText: 'UiText',
}))
jest.mock('../../features/exercises', () => ({ ExerciseEditor: 'ExerciseEditor' }))
jest.mock('../../navigation/BackHeaderButton', () => ({ BackHeaderButton: 'BackHeaderButton' }))

const { WorkoutDraftEditor } = require('../../features/workouts/components/WorkoutDraftEditor')

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  jest.clearAllMocks()
})

test('explicit discard clears the draft and continues the blocked navigation action', async () => {
  const exercise = {
    id: 'squat',
    name: 'Squat',
    category: 'STRENGTH',
    primaryMuscles: [],
    sets: [{ weight: 60, reps: 8 }],
  }
  const clearExercises = jest.fn()
  let renderer
  await act(async () => {
    renderer = create(
      mockReact.createElement(WorkoutDraftEditor, {
        initialName: 'Old name',
        initialSignature: JSON.stringify([exercise]),
        exercises: [exercise],
        setExercises: jest.fn(),
        updateExerciseSets: jest.fn(),
        addSetToExercise: jest.fn(),
        removeSetFromExercise: jest.fn(),
        clearExercises,
        saving: false,
        error: null,
        onSave: jest.fn(),
      })
    )
  })

  expect(mockPreventRemoveEnabled).toBe(false)
  await act(async () => {
    renderer.update(
      mockReact.createElement(WorkoutDraftEditor, {
        initialName: 'Old name',
        initialSignature: JSON.stringify([exercise]),
        exercises: [exercise],
        setExercises: jest.fn(),
        updateExerciseSets: jest.fn(),
        addSetToExercise: jest.fn(),
        removeSetFromExercise: jest.fn(),
        clearExercises,
        saving: false,
        error: null,
        onSave: jest.fn(),
      })
    )
  })
  const nameField = renderer.root.findAllByType('TextField')[0]
  await act(async () => nameField.props.onChangeText('Changed name'))
  expect(mockPreventRemoveEnabled).toBe(true)

  const action = { type: 'GO_BACK' }
  await act(async () => mockOnPreventRemove({ data: { action } }))
  const buttons = mockAlert.mock.calls[0][2]
  expect(buttons[0].text).toBe('Keep editing')
  expect(buttons[1].text).toBe('Discard workout')
  await act(async () => buttons[1].onPress())

  expect(clearExercises).toHaveBeenCalledTimes(1)
  expect(mockDispatch).toHaveBeenCalledWith(action)
  await act(async () => renderer.unmount())
})
