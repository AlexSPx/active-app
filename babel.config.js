module.exports = (api) => {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui', '@tamagui/lucide-icons'],
          config: './tamagui.config.ts',
          logTimings: true,
          disableExtraction: true,
        },
      ],
      // NOTE: this is only necessary if you are using reanimated for animations
      'react-native-reanimated/plugin',
    ],
  }
}
