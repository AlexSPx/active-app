import { Asset } from 'expo-asset'
import { useEffect, useState } from 'react'
import { Image, type AssetRegistry } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { WebView } from 'react-native-webview'
import { exerciseDemoAsset } from '../../../assets/exercise-animations'
import { UiText } from '../../../components/ui/Controls'
import type { ApiExercise } from '../../../types/api'

export function ExerciseDemo({ exercise }: { exercise: ApiExercise }) {
  const [localUri, setLocalUri] = useState<string | null>()
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    let mounted = true

    async function loadDemo() {
      // Use Metro's registry entry point because Expo's registry import fails in release builds.
      const registry: Pick<AssetRegistry, 'getAssetByID'> = require('react-native/asset-registry')
      const metadata = registry.getAssetByID(exerciseDemoAsset)
      const source = Image.resolveAssetSource(exerciseDemoAsset)
      if (!metadata || !source?.uri) return null

      const asset = new Asset({
        name: metadata.name,
        hash: metadata.hash,
        type: 'html',
        uri: source.uri,
      })
      return (await asset.downloadAsync()).localUri
    }

    void loadDemo().then(
      (uri) => {
        if (mounted) setLocalUri(uri)
      },
      () => {
        if (mounted) setLocalUri(null)
      }
    )
    return () => {
      mounted = false
    }
  }, [])

  if (localUri === null) return <UiText accessibilityRole="alert">The demo could not load.</UiText>
  if (!localUri) return <UiText accessibilityLiveRegion="polite">Loading demo…</UiText>

  const demoHash = `mode=app&exercise=${encodeURIComponent(exercise.id)}&still=${Number(reduceMotion)}`
  return (
    <WebView
      accessibilityLabel={`${exercise.name} movement demonstration`}
      source={{ uri: `${localUri}#${demoHash}` }}
      containerStyle={{ flex: 0, height: 248 }}
      style={{ backgroundColor: '#e6edf3' }}
      allowFileAccess
      allowingReadAccessToURL={localUri}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={({ url }) => url.split('#')[0] === localUri}
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      onError={() => setLocalUri(null)}
      onRenderProcessGone={() => setLocalUri(null)}
      onContentProcessDidTerminate={() => setLocalUri(null)}
    />
  )
}
