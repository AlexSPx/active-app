import { usePathname, useRouter, Slot } from 'expo-router'
import { Pressable, View } from 'react-native'
import { UiText } from '../../../components/ui/Controls'

const tabs = [
  { label: 'Workouts', pathname: '/(tabs)/(workouts)' },
  { label: 'Routines', pathname: '/(tabs)/(workouts)/routines' },
] as const

export default function WorkoutsLayout() {
  const pathname = usePathname()
  const router = useRouter()
  const current = pathname.endsWith('/routines') ? 'Routines' : 'Workouts'

  return (
    <View className="flex-1 bg-background">
      <View className="w-full max-w-3xl self-center px-page">
        <View className="mb-field mt-card flex-row gap-compact rounded-control bg-surface p-compact">
          {tabs.map((tab) => {
            const selected = current === tab.label
            return (
              <Pressable
                key={tab.label}
                className={`min-h-touch flex-1 items-center justify-center rounded-control px-compact py-compact active:opacity-80 ${selected ? 'bg-accent' : ''}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => router.replace({ pathname: tab.pathname })}
              >
                <UiText textRole={selected ? 'bodyOnAccent' : 'caption'}>{tab.label}</UiText>
              </Pressable>
            )
          })}
        </View>
      </View>
      <View className="flex-1">
        <Slot />
      </View>
    </View>
  )
}
