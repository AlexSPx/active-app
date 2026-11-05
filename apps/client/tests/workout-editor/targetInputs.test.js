const React = require('react')
const { create, act } = require('react-test-renderer')

jest.mock('../../components/ui/Controls', () => ({ TextField: 'TextField' }))
const { DurationTargetInput, StrengthTargetInput } = require('../../components/ui/WorkoutSetFields')

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

test('strength editor inputs preserve partial decimal text and update numeric targets', async () => {
  let renderer
  let weight
  function Editor() {
    const [target, setTarget] = React.useState(60)
    weight = target
    return React.createElement(StrengthTargetInput, {
      mode: 'editor',
      index: 0,
      field: 'weight',
      value: target,
      onChange: setTarget,
    })
  }
  await act(async () => {
    renderer = create(React.createElement(Editor))
  })
  await act(async () => {
    renderer.root.findByType('TextField').props.onChangeText('60.')
  })
  expect(weight).toBe(60)
  expect(renderer.root.findByType('TextField').props.value).toBe('60.')
  await act(async () => {
    renderer.root.findByType('TextField').props.onChangeText('60.5')
  })
  expect(weight).toBe(60.5)
  await act(async () => {
    renderer.unmount()
  })
})

test('cardio editor maps numeric keypad input to a formatted duration target', async () => {
  let renderer
  let durationSeconds
  function Editor() {
    const [target, setTarget] = React.useState(900)
    durationSeconds = target
    return React.createElement(DurationTargetInput, {
      mode: 'editor',
      index: 0,
      seconds: target,
      onChange: setTarget,
    })
  }
  await act(async () => {
    renderer = create(React.createElement(Editor))
  })
  const field = renderer.root.findByType('TextField')
  expect(field.props.keyboardType).toBe('number-pad')
  await act(async () => {
    field.props.onChangeText('150')
  })
  expect(durationSeconds).toBe(110)
  expect(field.props.value).toBe('1:50')
  await act(async () => {
    field.props.onChangeText('1505')
  })
  expect(durationSeconds).toBe(905)
  expect(field.props.value).toBe('15:05')
  await act(async () => {
    renderer.unmount()
  })
})
