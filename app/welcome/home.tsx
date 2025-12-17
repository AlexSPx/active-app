import { YStack, XStack, Text, Button, H1, Image } from 'tamagui'
import { useRouter } from 'expo-router'
import { Dumbbell, Zap, Target, ArrowRight } from '@tamagui/lucide-icons'

export default function WelcomeHome() {
  const router = useRouter()

  const handleLogin = () => {
    router.push('/welcome/login')
  }

  const handleSignup = () => {
    router.push('/welcome/register')
  }

  return (
    <YStack flex={1} bg="$background" px="$6" justify="space-between">
      {/* Hero Section */}
      <YStack items="center" animation="bouncy" enterStyle={{ opacity: 0, y: -20, scale: 0.9 }} mt="$4">
        <Image
          source={{ uri: require('../../assets/icons/splash-icon-light.png') }}
          width={100}
          height={100}
          resizeMode="contain"
          mb="$4"
        />

        <YStack items="center" gap="$2">
          <H1 fontSize="$9" fontWeight="900" color="$color12" letterSpacing={-1} style={{ textAlign: 'center' }}>
            ActiveNext
          </H1>
          <Text fontSize="$5" color="$color10" px="$4" style={{ textAlign: 'center' }}>
            Your personal fitness journey starts here.
          </Text>
        </YStack>
      </YStack>

      {/* Feature Highlights */}
      <YStack gap="$4" width="100%" px="$2" pb="$4">
        <FeatureRow
          icon={<Target size={24} color="$green10" />}
          title="Track Progress"
          subtitle="Monitor workouts and hit your goals"
          bg="$green2"
        />
        <FeatureRow
          icon={<Zap size={24} color="orange" />}
          title="Stay Motivated"
          subtitle="Get personalized insights daily"
          bg="$red2"
        />
        <FeatureRow
          icon={<Dumbbell size={24} color="$blue10" />}
          title="Custom Workouts"
          subtitle="Build your perfect routine"
          bg="$blue2"
        />
      </YStack>

      {/* Action Buttons */}
      <YStack gap="$4" width="100%" mb="$4">
        <Button
          size="$6"
          bg="$blue9"
          color="white"
          rounded="$8"
          onPress={handleSignup}
          pressStyle={{ opacity: 0.9, scale: 0.98 }}
          iconAfter={<ArrowRight size={20} />}
          animation="quick"
        >
          <Text fontSize="$5" fontWeight="700" color="white">
            Get Started
          </Text>
        </Button>

        <Button
          size="$6"
          variant="outlined"
          borderColor="$color5"
          color="$color11"
          rounded="$8"
          onPress={handleLogin}
          pressStyle={{ opacity: 0.8, scale: 0.98, borderColor: '$color7' }}
          animation="quick"
        >
          <Text fontSize="$5" fontWeight="600">
            I already have an account
          </Text>
        </Button>
      </YStack>
    </YStack>
  )
}

function FeatureRow({ icon, title, subtitle, bg }: { icon: any; title: string; subtitle: string; bg: any }) {
  return (
    <XStack items="center" gap="$4" p="$3" rounded="$6" hoverStyle={{ bg: '$color2' }} pressStyle={{ bg: '$color3' }} animation="quick">
      <XStack width={48} height={48} bg={bg} rounded="$5" items="center" justify="center">
        {icon}
      </XStack>
      <YStack flex={1}>
        <Text fontSize="$5" fontWeight="700" color="$color12" mb="$1">
          {title}
        </Text>
        <Text fontSize="$3" color="$color10">
          {subtitle}
        </Text>
      </YStack>
    </XStack>
  )
}