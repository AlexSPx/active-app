const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')
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

const generatedAndroidBuildArtifacts = /[/\\]node_modules[/\\].*[/\\]android[/\\]build[/\\].*/
const existingBlockList = config.resolver.blockList
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  generatedAndroidBuildArtifacts,
]

// START: Fix for zustand v5 import.meta issue on web
// This overrides resolution for 'zustand' to force the CommonJS entry point
const { resolveRequest } = config.resolver
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === 'zustand') {
      return context.resolveRequest(context, require.resolve('zustand'), platform)
    }
    if (moduleName === 'zustand/middleware') {
      return context.resolveRequest(context, require.resolve('zustand/middleware'), platform)
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

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm')
}

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
})
