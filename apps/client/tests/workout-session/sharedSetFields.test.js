const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('../../components/ui/Controls', () => ({ TextField: 'TextField' }))

const { DurationTargetInput } = require('../../components/ui/WorkoutSetFields')

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

test('session duration keeps digit entry and commits before blur', async () => {
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
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(onChange).toHaveBeenCalledWith(420)
  await act(async () => field.props.onBlur())
  expect(onChange).toHaveBeenCalledTimes(1)
  await act(async () => renderer.unmount())
})
