const { getDefaultConfig } = require('expo/metro-config')
const { withTamagui } = require('@tamagui/metro-plugin')

const config = getDefaultConfig(__dirname, {
  isCSSEnabled: true,
})

// START: Fix for zustand v5 import.meta issue on web
// This overrides resolution for 'zustand' to force the CommonJS entry point
const { resolveRequest } = config.resolver
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === 'zustand') {
      return context.resolveRequest(context, 'zustand/index.js', platform)
    }
    if (moduleName === 'zustand/middleware') {
      return context.resolveRequest(context, 'zustand/middleware.js', platform)
    }
  }
  // Chain to previous resolveRequest if it exists
  if (resolveRequest) {
    return resolveRequest(context, moduleName, platform)
  }
  // Default behavior
  return context.resolveRequest(context, moduleName, platform)
}
// END: Fix for zustand v5 import.meta issue

module.exports = withTamagui(config, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui.css',
})
