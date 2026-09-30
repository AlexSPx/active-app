const React = require('react')
const { create, act } = require('react-test-renderer')

jest.mock('tamagui', () => ({ Input: 'Input', Text: 'Text', XStack: 'XStack' }))
jest.mock('../../features/exercises/components/SwipeDeleteSetRow', () => ({
  SwipeDeleteSetRow: 'SwipeDeleteSetRow',
}))
const { ExerciseSetRow } = require('../../features/exercises/components/ExerciseSetRow')
const { CardioEditorSetRow } = require('../../features/exercises/components/CardioEditorSetRow')

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

test('decimal weight editing preserves partial text while updating the numeric target', async () => {
  let renderer
  let target
  function Editor() {
    const [weight, setWeight] = React.useState(60)
    target = weight
    return React.createElement(ExerciseSetRow, {
      index: 0,
      weight,
      reps: 8,
      onChange: (_field, value) => setWeight(value),
      onDelete: () => {},
    })
  }
  await act(async () => {
    renderer = create(React.createElement(Editor))
  })
  await act(async () => {
    renderer.root.findAllByType('Input')[0].props.onChangeText('60.')
  })
  expect(renderer.root.findAllByType('Input')[0].props.value).toBe('60.')
  await act(async () => {
    renderer.root.findAllByType('Input')[0].props.onChangeText('60.5')
  })
  expect(target).toBe(60.5)
  await act(async () => {
    renderer.unmount()
  })
})

test('cardio editing clears an invalid target immediately and preserves unfinished input', async () => {
  let renderer
  let target
  function Editor() {
    const [durationSeconds, setDuration] = React.useState(900)
    target = durationSeconds
    return React.createElement(CardioEditorSetRow, {
      index: 0,
      durationSeconds,
      onChange: setDuration,
      onDelete: () => {},
    })
  }
  await act(async () => {
    renderer = create(React.createElement(Editor))
  })
  await act(async () => {
    renderer.root.findByType('Input').props.onChangeText('15:0')
  })
  expect(target).toBeNull()
  expect(renderer.root.findByType('Input').props.value).toBe('15:0')
  await act(async () => {
    renderer.root.findByType('Input').props.onChangeText('15:05')
  })
  expect(target).toBe(905)
  await act(async () => {
    renderer.unmount()
  })
})
