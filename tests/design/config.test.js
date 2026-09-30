const { config } = require('../../tamagui.config')

test('preview tokens and both themes resolve through Tamagui', () => {
  expect(config.tokens.radius.card.val).toBe(20)
  expect(config.tokens.size.touch.val).toBeGreaterThanOrEqual(44)
  expect(config.tokens.size.action.val).toBeGreaterThanOrEqual(48)
  expect(config.fonts.body.size.screenTitle).toBe(24)
  expect(config.themes.light.primary.val).toBe('#2F6FED')
  expect(config.themes.dark.surface.val).toBe('#171E27')
  expect(config.themes.dark.onPrimary.val).toBe('#0F141B')
})
