const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    TextField: (props) => React.createElement('TextField', props),
    UiText: (props) => React.createElement('UiText', props, props.children),
  }
})

const { DurationTargetInput, StrengthTargetInput } = require('../../components/ui/WorkoutSetFields')

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

test('strength target input preserves a partially typed decimal and reports the numeric value', async () => {
  let renderer
  let target
  function Editor() {
    const [weight, setWeight] = React.useState(60)
    target = weight
    return React.createElement(StrengthTargetInput, {
      mode: 'editor',
      field: 'weight',
      index: 0,
      value: weight,
      onChange: setWeight,
    })
  }

  await act(async () => {
    renderer = create(React.createElement(Editor))
  })
  await act(async () => renderer.root.findByType('TextField').props.onChangeText('60.'))
  expect(renderer.root.findByType('TextField').props.value).toBe('60.')
  await act(async () => renderer.root.findByType('TextField').props.onChangeText('60.5'))
  expect(target).toBe(60.5)
  await act(async () => renderer.unmount())
})

test('editor duration input keeps invalid text until corrected', async () => {
  let renderer
  let target
  function Editor() {
    const [seconds, setSeconds] = React.useState(900)
    target = seconds
    return React.createElement(DurationTargetInput, {
      mode: 'editor',
      index: 0,
      seconds,
      onChange: setSeconds,
    })
  }

  await act(async () => {
    renderer = create(React.createElement(Editor))
  })
  await act(async () => renderer.root.findByType('TextField').props.onChangeText('15:0'))
  expect(target).toBeNull()
  expect(renderer.root.findByType('TextField').props.value).toBe('15:0')
  await act(async () => renderer.root.findByType('TextField').props.onChangeText('15:05'))
  expect(target).toBe(905)
  await act(async () => renderer.unmount())
})

test('session duration keeps digit entry and commits on blur', async () => {
  const onChange = jest.fn()
  let renderer
  await act(async () => {
    renderer = create(
      React.createElement(DurationTargetInput, {
        mode: 'session',
        index: 0,
        seconds: 900,
        completed: false,
        onChange,
      })
    )
  })
  const field = renderer.root.findByType('TextField')
  expect(field.props.keyboardType).toBe('number-pad')
  await act(async () => field.props.onChangeText('700'))
  expect(field.props.value).toBe('7:00')
  expect(onChange).not.toHaveBeenCalled()
  await act(async () => field.props.onBlur())
  expect(onChange).toHaveBeenCalledWith(420)
  await act(async () => renderer.unmount())
})
