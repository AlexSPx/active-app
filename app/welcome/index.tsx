import { ArrowRight } from '@tamagui/lucide-icons'
import { useRouter } from 'expo-router'
import { Platform, ScrollView } from 'react-native'
import { Button, H1, Image, Text, XStack, YStack } from 'tamagui'
import { WorkOSSignInButton } from '../../components/WorkOSSignInButton'

const trainingSteps = [
  { number: '01', title: 'Plan', detail: 'Your own routines' },
  { number: '02', title: 'Train', detail: 'Every set recorded' },
  { number: '03', title: 'Grow', detail: 'Progress you can see' },
]

export default function WelcomeHome() {
  const router = useRouter()

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      alwaysBounceVertical={false}
    >
      <YStack
        flex={1}
        bg="$background"
        width="100%"
        maxW={560}
        self="center"
        px="$page"
        pt="$page"
        pb="$page"
        gap="$section"
      >
        <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600" color="$color">
          ActiveNext
        </Text>

        <YStack flex={1} justify="center" gap="$5" py="$3">
          <YStack items="center" py="$2">
            <Image
              source={require('../../assets/icons/splash-icon-light.png')}
              width={184}
              height={184}
              resizeMode="contain"
              accessible
              accessibilityLabel="ActiveNext fitness mascot"
            />
          </YStack>

          <YStack gap="$3">
            <H1 fontSize={36} lineHeight={42} fontWeight="700" letterSpacing={-0.8} color="$color">
              Good things{'\n'}take reps.
            </H1>
            <Text fontSize="$body" lineHeight="$body" color="$colorSubtle" maxW={350}>
              A place for your workouts, your routine, and every bit of progress along the way.
            </Text>
          </YStack>
        </YStack>

        <XStack
          bg="$surface"
          borderWidth={1}
          borderColor="$borderColor"
          rounded="$card"
          p="$card"
          gap="$field"
        >
          {trainingSteps.map((step) => (
            <YStack key={step.number} flex={1} gap="$1">
              <Text fontSize="$caption" lineHeight="$caption" color="$primary">
                {step.number}
              </Text>
              <Text fontSize="$body" lineHeight="$body" fontWeight="600" color="$color">
                {step.title}
              </Text>
              <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                {step.detail}
              </Text>
            </YStack>
          ))}
        </XStack>

        <YStack gap="$2">
          <Button
            minH="$action"
            bg="$primary"
            rounded="$button"
            borderWidth={0}
            px="$5"
            onPress={() => router.push('/welcome/register')}
            hoverStyle={{ bg: '$primaryHover' }}
            pressStyle={{ bg: '$primaryPress' }}
            focusVisibleStyle={{ outlineColor: '$color', outlineWidth: 2, outlineOffset: 4 }}
            accessibilityLabel="Get started"
            iconAfter={<ArrowRight size="$icon" color="$onPrimary" />}
          >
            <Text fontSize="$body" fontWeight="600" color="$onPrimary">
              Get started
            </Text>
          </Button>
          {Platform.OS === 'web' ? <WorkOSSignInButton label="I already have an account" /> : null}
        </YStack>
      </YStack>
    </ScrollView>
  )
}
