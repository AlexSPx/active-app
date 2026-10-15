import { ArrowUpRight } from '@tamagui/lucide-icons'
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
        px="$5"
        pt="$4"
        pb="$4"
        gap="$5"
        $sm={{ px: '$7', pt: '$6', pb: '$6' }}
      >
        <XStack items="center" justify="space-between" gap="$3" flexWrap="wrap">
          <Text fontSize={20} fontWeight="800" letterSpacing={-0.8} color="$color">
            ActiveNext
          </Text>
          <XStack items="center" gap="$2">
            <YStack width={6} height={6} rounded={3} bg="#FF9500" />
            <Text fontSize={10} fontWeight="700" letterSpacing={1.5} color="$colorSubtle">
              MADE FOR YOUR PACE
            </Text>
          </XStack>
        </XStack>

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
            <XStack items="center" gap="$3">
              <YStack width={28} height={3} bg="#FF9500" />
              <Text fontSize={11} fontWeight="700" letterSpacing={2} color="$colorSubtle">
                ONE REP AT A TIME
              </Text>
            </XStack>
            <H1
              fontSize={48}
              lineHeight={50}
              fontWeight="900"
              letterSpacing={-2.5}
              color="$color"
              $sm={{ fontSize: 60, lineHeight: 62 }}
            >
              Good things{'\n'}take reps.
            </H1>
            <Text fontSize={16} lineHeight={24} color="$colorSubtle" maxW={350}>
              A place for your workouts, your routine, and every bit of progress along the way.
            </Text>
          </YStack>
        </YStack>

        <XStack borderTopWidth={1} borderColor="$borderColor" pt="$4" gap="$3">
          {trainingSteps.map((step) => (
            <YStack key={step.number} flex={1} gap="$1">
              <Text fontSize={10} color="$colorSubtle" letterSpacing={1}>
                {step.number}
              </Text>
              <Text fontSize={16} fontWeight="700" color="$color">
                {step.title}
              </Text>
              <Text fontSize={11} lineHeight={16} color="$colorSubtle">
                {step.detail}
              </Text>
            </YStack>
          ))}
        </XStack>

        <YStack gap="$2">
          <Button
            height={60}
            bg="#FF9500"
            rounded="$4"
            borderWidth={0}
            px="$5"
            justify="space-between"
            onPress={() => router.push('/welcome/register')}
            hoverStyle={{ bg: '#FFAA33' }}
            pressStyle={{ bg: '#E68600' }}
            focusVisibleStyle={{ outlineColor: '$color', outlineWidth: 2, outlineOffset: 4 }}
            accessibilityLabel="Get started"
            iconAfter={<ArrowUpRight size={23} color="#171E27" />}
          >
            <Text fontSize={17} fontWeight="700" color="#171E27">
              Get started
            </Text>
          </Button>
          {Platform.OS === 'web' ? <WorkOSSignInButton label="I already have an account" /> : null}
        </YStack>
      </YStack>
    </ScrollView>
  )
}
