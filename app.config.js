export default {
  expo: {
    name: 'Active Next Dev',
    slug: 'active-next',
    version: '1.0.1',
    orientation: 'portrait',
    scheme: 'dev.activenext',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/icons/splash-icon-light.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      icon: {
        dark: './assets/icons/ios-dark.png',
        light: './assets/icons/ios-light.png',
        tinted: './assets/icons/ios-tinted.png',
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? 'google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/icons/adaptive-icon.png',
        monochromeImage: './assets/icons/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      package: 'com.alexspx.dev.activenext',
      permissions: ['POST_NOTIFICATIONS', 'VIBRATE', 'android.permission.SCHEDULE_EXACT_ALARM'],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/icons/adaptive-icon.png',
      name: 'Active Next',
      shortName: 'Active',
      description: 'Active Next - Your personal activity companion',
      themeColor: '#000000',
      backgroundColor: '#000000',
    },
    plugins: [
      'expo-sqlite',
      'expo-router',
      'expo-font',
      [
        'expo-notifications',
        {
          useExactAlarm: true,
        },
      ],
      './plugins/with-exact-alarm-permission',
      [
        'expo-splash-screen',
        {
          image: './assets/icons/splash-icon-light.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            image: './assets/icons/splash-icon-dark.png',
            backgroundColor: '#000000',
          },
        },
      ],
      [
        'expo-build-properties',
        {
          ios: {
            newArchEnabled: true,
          },
          android: {
            newArchEnabled: true,
          },
        },
      ],
      'expo-web-browser',
      'expo-localization',
      '@react-native-community/datetimepicker',
      'expo-image',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '8dee9569-7b46-47df-b72f-21833f59e85c',
      },
    },
    updates: {
      url: 'https://u.expo.dev/8dee9569-7b46-47df-b72f-21833f59e85c',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
  },
}
