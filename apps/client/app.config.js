const maestroTestBuild = process.env.MAESTRO_TEST_BUILD === '1'

export default {
  expo: {
    name: 'Active Next',
    slug: 'active-next',
    version: '2.1.0',
    orientation: 'portrait',
    scheme: 'activenext',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/icons/splash-icon-light.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      bundleIdentifier: 'com.alexspx.activenext',
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
      // googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/icons/adaptive-icon.png',
        monochromeImage: './assets/icons/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      package: 'com.alexspx.activenext',
      permissions: ['POST_NOTIFICATIONS', 'VIBRATE', 'android.permission.SCHEDULE_EXACT_ALARM'],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/icons/adaptive-icon.png',
      name: 'Active Next',
      shortName: 'Active',
      description: 'Active Next - Your personal activity companion',
      themeColor: '#FAF7FC',
      backgroundColor: '#FAF7FC',
    },
    plugins: [
      'expo-sqlite',
      // Dangerous mods run in reverse order; customize the generated widget provider last.
      './plugins/with-today-plan-widget',
      [
        'expo-widgets',
        {
          enableAndroid: true,
          widgets: [
            {
              name: 'TodayPlan',
              displayName: "Today's Plan",
              description: 'See your training plan for today.',
              ios: {
                supportedFamilies: ['systemSmall', 'systemMedium'],
                contentMarginsDisabled: true,
                initialLayout: './features/training/widgets/TodayPlanWidget.tsx',
              },
              android: {
                minWidth: 250,
                minHeight: 110,
                targetCellWidth: 4,
                targetCellHeight: 2,
                initialLayout: './features/training/widgets/TodayPlanWidget.android.tsx',
              },
            },
          ],
        },
      ],
      [
        'expo-secure-store',
        {
          configureAndroidBackup: false,
        },
      ],
      './plugins/with-backup-exclusions',
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
      'expo-web-browser',
      'expo-localization',
      '@react-native-community/datetimepicker',
      'expo-image',
      'expo-status-bar',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '8dee9569-7b46-47df-b72f-21833f59e85c',
      },
    },
    updates: {
      ...(maestroTestBuild ? { enabled: false } : {}),
      url: 'https://u.expo.dev/8dee9569-7b46-47df-b72f-21833f59e85c',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
  },
}
