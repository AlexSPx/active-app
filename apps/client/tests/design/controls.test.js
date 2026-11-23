const React = require('react')
const { act, create } = require('react-test-renderer')
const { ActivityIndicator } = require('react-native')
const { Button, TextField } = require('../../components/ui/Controls')

test('loading buttons expose a busy disabled state and an accessible label with a spinner', () => {
  let renderer
  const onPress = jest.fn()

  act(() => {
    renderer = create(
      <Button loading onPress={onPress} accessibilityLabel="Saving measurements">
        Saving measurements
      </Button>
    )
  })

  const button = renderer.toJSON()
  expect(button.props.accessibilityLabel).toBe('Saving measurements')
  expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
  expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1)

  act(() => {
    renderer.update(
      <Button loading={false} onPress={onPress} accessibilityLabel="Save measurements">
        Save measurements
      </Button>
    )
  })

  const readyButton = renderer.toJSON()
  expect(readyButton.props.accessibilityLabel).toBe('Save measurements')
  expect(readyButton.props.accessibilityState).toMatchObject({ busy: false, disabled: false })
  expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(0)
  act(() => renderer.unmount())
})

test('a disabled field stays labeled and becomes editable when enabled', () => {
  let renderer

  act(() => {
    renderer = create(
      <TextField accessibilityLabel="Body weight" disabled value="" onChangeText={() => {}} />
    )
  })

  const disabledField = renderer.toJSON()
  expect(disabledField.props.accessibilityLabel).toBe('Body weight')
  expect(disabledField.props.editable).toBe(false)

  act(() => {
    renderer.update(
      <TextField accessibilityLabel="Body weight" value="140" onChangeText={() => {}} />
    )
  })

  expect(renderer.toJSON().props.editable).not.toBe(false)
  act(() => renderer.unmount())
})
