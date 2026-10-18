import { useRouter } from 'expo-router'
import { Image, Platform, ScrollView, View } from 'react-native'
import { BarChart2, Calendar, Dumbbell } from '../../components/ui/icons'
import { Button, UiText } from '../../components/ui/Controls'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import { WorkOSSignInButton } from '../../components/WorkOSSignInButton'

const benefits = [
  {
    title: 'Plan your training',
    detail: 'Build a routine around your week.',
    Icon: Calendar,
  },
  {
    title: 'Make every set count',
    detail: 'Record your weights, reps, and sessions.',
    Icon: Dumbbell,
  },
  {
    title: 'See your progress',
    detail: 'Follow the lifts that matter to you.',
    Icon: BarChart2,
  },
]

export default function WelcomeHome() {
  const router = useRouter()
  const colors = useCadenceColors()

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
      >
        <View className="mx-auto w-full max-w-[560px] flex-1 gap-section px-page pb-section pt-section">
          <View className="flex-row items-center gap-field py-field">
            <View className="flex-1 gap-field">
              <UiText accessibilityRole="header" textRole="screenTitle" className="max-w-[240px]">
                Good things{'\n'}take reps.
              </UiText>
              <UiText textRole="bodyMuted" className="max-w-[250px]">
                Your workouts, your routine, and your progress along the way.
              </UiText>
            </View>
            <Image
              source={require('../../assets/icons/splash-icon-light.png')}
              resizeMode="contain"
              style={{ width: 72, height: 72 }}
              accessible
              accessibilityLabel="Active fitness mascot"
            />
          </View>

          <View className="overflow-hidden rounded-settings bg-surface px-field">
            {benefits.map(({ title, detail, Icon }, index) => (
              <View key={title}>
                {index > 0 && <View className="ml-touch border-t border-divider" />}
                <View className="min-h-[80px] flex-row items-center gap-field py-field">
                  <View className="h-touch w-touch items-center justify-center" accessible={false}>
                    <Icon size={20} color={colors.foreground} aria-hidden />
                  </View>
                  <View className="flex-1 gap-compact">
                    <UiText textRole="bodyEmphasis">{title}</UiText>
                    <UiText textRole="caption">{detail}</UiText>
                  </View>
                </View>
              </View>
            ))}
          </View>

          <UiText textRole="caption" className="px-compact">
            Start with a local profile. You can add your first workout next.
          </UiText>
        </View>
      </ScrollView>

      <View className="border-t border-divider px-page pb-page pt-compact">
        <View className="mx-auto w-full max-w-[560px] gap-field">
          <Button
            className="w-full"
            onPress={() => router.push('/welcome/register')}
            accessibilityLabel="Get started"
          >
            <UiText textRole="buttonOnAccent">Get started</UiText>
          </Button>
          {Platform.OS === 'web' ? <WorkOSSignInButton label="I already have an account" /> : null}
        </View>
      </View>
    </View>
  )
}
