const React = require('react')
const { act, create } = require('react-test-renderer')
const { ActivityIndicator } = require('react-native')
const { Button, IconButton, TextField } = require('../../components/ui/Controls')

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
  expect(button.children[0].children[0].type).toBe('ActivityIndicator')
  expect(button.children[0].children[0].props.colorClassName).toBe('accent-on-accent')
  expect(button.children[0].children[1].children).toContain('Saving measurements')

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
  expect(readyButton.children[0].type).toBe('Text')
  expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(0)
})

test('invalid and disabled fields expose their visual and editable state', () => {
  let renderer

  act(() => {
    renderer = create(
      <TextField
        accessibilityLabel="Body weight"
        invalid
        disabled
        value=""
        onChangeText={() => {}}
      />
    )
  })

  const invalidField = renderer.toJSON()
  expect(invalidField.props.accessibilityLabel).toBe('Body weight')
  expect(invalidField.props.className).toContain('border-destructive')
  expect(invalidField.props.className).toContain('opacity-50')
  expect(invalidField.props.editable).toBe(false)

  act(() => {
    renderer.update(
      <TextField
        accessibilityLabel="Body weight"
        invalid={false}
        value="140"
        onChangeText={() => {}}
      />
    )
  })

  const validField = renderer.toJSON()
  expect(validField.props.className).not.toContain('border-destructive')
  expect(validField.props.className).not.toContain('opacity-50')
  expect(validField.props.editable).toBeUndefined()
})

test('icon buttons preserve a 44 point minimum touch width', () => {
  let renderer

  act(() => {
    renderer = create(<IconButton accessibilityLabel="Add exercise">+</IconButton>)
  })

  expect(renderer.toJSON().props.className).toContain('min-w-touch')
})
