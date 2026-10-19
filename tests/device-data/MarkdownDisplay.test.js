const React = require('react')
const { act, create } = require('react-test-renderer')
const Linking = require('expo-linking')
const { MarkdownDisplay } = require('../../components/ui/MarkdownDisplay')
const { PRIVACY_POLICY_CONTENT } = require('../../features/legal/legalContent')

jest.mock('react-native', () => ({ View: 'View' }))
jest.mock('expo-linking', () => ({ openURL: jest.fn() }))
jest.mock('../../components/ui/Controls', () => ({ UiText: 'UiText' }))

test('published policy renders numbered items and a working Expo privacy link', () => {
  let view
  act(() => {
    view = create(React.createElement(MarkdownDisplay, { content: PRIVACY_POLICY_CONTENT }))
  })
  const textNodes = view.root.findAllByType('UiText')
  for (const marker of ['1.', '2.', '3.']) {
    expect(textNodes.some((node) => node.props.children === marker)).toBe(true)
  }
  const expoLink = textNodes.find(
    (node) => node.props.accessibilityRole === 'link' && node.props.onPress
  )
  expect(expoLink).toBeDefined()
  act(() => expoLink.props.onPress())
  expect(Linking.openURL).toHaveBeenCalledWith('https://expo.dev/privacy')
  act(() => view.unmount())
})
