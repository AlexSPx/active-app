# React Native Screens Android header fix

`react-native-screens+4.23.0.patch` backports [upstream PR #4498](https://github.com/software-mansion/react-native-screens/pull/4498), which prevents header updates after a screen detaches from its stack.

Screens stays pinned to 4.23.0 for Expo 55 / React Native 0.83 compatibility. The first fixed release, 4.29.0, requires React Native 0.84 or newer. Remove this patch when a compatible fixed release can be adopted.

Dependency installation applies the patch through `postinstall`. Rebuild the native Android app to include the fix; a JavaScript reload or OTA update cannot apply it.
