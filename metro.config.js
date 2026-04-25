const { getDefaultConfig } = require('expo/metro-config')
const { withTamagui } = require('@tamagui/metro-plugin')
const path = require('path')

const config = getDefaultConfig(__dirname, {
  isCSSEnabled: true,
})

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  app: path.resolve(__dirname, 'app'),
  components: path.resolve(__dirname, 'components'),
  config: path.resolve(__dirname, 'config'),
  constants: path.resolve(__dirname, 'constants'),
  contexts: path.resolve(__dirname, 'contexts'),
  features: path.resolve(__dirname, 'features'),
  lib: path.resolve(__dirname, 'lib'),
  navigation: path.resolve(__dirname, 'navigation'),
  services: path.resolve(__dirname, 'services'),
  stores: path.resolve(__dirname, 'stores'),
  types: path.resolve(__dirname, 'types'),
  utils: path.resolve(__dirname, 'utils'),
}

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
