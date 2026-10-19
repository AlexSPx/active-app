import { Link } from 'expo-router'
import { View } from 'react-native'
import { Button, UiText } from '../components/ui/Controls'

export default function NotFoundScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-page">
      <View className="w-full max-w-[480px] items-center gap-field">
        <UiText accessibilityRole="header" textRole="screenTitle" className="text-center">
          This screen doesn’t exist.
        </UiText>
        <Link href="/" asChild>
          <Button className="w-full">Go to home screen!</Button>
        </Link>
      </View>
    </View>
  )
}
