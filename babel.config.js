module.exports = (api) => {
  const isDevelopment = api.env('development')
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
      ...(!isDevelopment
        ? [
            [
              '@tamagui/babel-plugin',
              {
                components: ['tamagui'],
                config: './tamagui.config.ts',
                logTimings: false,
                disableExtraction: true,
              },
            ],
          ]
        : []),
      // NOTE: this is only necessary if you are using reanimated for animations
      'react-native-reanimated/plugin',
    ],
  }
}
