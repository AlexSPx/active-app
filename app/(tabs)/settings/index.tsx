import { Alert } from 'react-native'
import { Link } from 'expo-router'
import { Button, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui'
import { ChevronRight, LogOut } from '@tamagui/lucide-icons'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { useAuth } from '../../../contexts/AuthContext'
import { useSettingsStore } from '../../../features/settings'
import { measurementText } from '../../../features/settings/inputs'
import NotificationPermissions from '../../../components/NotificationPermissions'

function MenuRow({
  title,
  description,
  href,
}: {
  title: string
  description: React.ReactNode
  href: string
}) {
  return (
    <Link href={href as any} asChild>
      <Button unstyled py="$card" minH="$touch" pressStyle={{ bg: '$backgroundPress' }}>
        <XStack gap="$field" items="center" justify="space-between">
          <YStack flex={1} gap="$compact">
            <Text fontSize="$exerciseTitle" lineHeight="$exerciseTitle" fontWeight="600">
              {title}
            </Text>
            {typeof description === 'string' ? (
              <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                {description}
              </Paragraph>
            ) : (
              description
            )}
          </YStack>
          <ChevronRight size="$icon" color="$colorMuted" />
        </XStack>
      </Button>
    </Link>
  )
}

export default function SettingsMenuScreen() {
  const { logout, user } = useAuth()
  const settings = useSettingsStore()
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Your account'
  const version = Application.nativeApplicationVersion || Constants.expoConfig?.version || 'Unknown'
  const confirmSignOut = () =>
    Alert.alert('Sign out of Active?', 'You’ll need to sign in again to access your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: () => {
          void logout()
        },
      },
    ])
  return (
    <YStack flex={1} bg="$background">
      <ScrollView showsVerticalScrollIndicator={false}>
        <YStack p="$page" gap="$section" width="100%" maxW="$content" self="center">
          <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600">
            Your settings
          </Text>
          <Link href="/settings/account" asChild>
            <Button
              unstyled
              minH="$touch"
              py="$field"
              pressStyle={{ bg: '$backgroundPress' }}
              accessibilityLabel="Your account"
            >
              <XStack gap="$field" items="center">
                <YStack flex={1} gap="$compact">
                  <Text fontSize="$sectionTitle" lineHeight="$sectionTitle" fontWeight="600">
                    {name}
                  </Text>
                  {!!user?.email && (
                    <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                      {user.email}
                    </Text>
                  )}
                </YStack>
                <Text fontSize="$caption" color="$primary">
                  Account →
                </Text>
              </XStack>
            </Button>
          </Link>
          <YStack>
            <Text fontSize="$caption" fontWeight="600" color="$colorSubtle" mb="$field">
              Training
            </Text>
            <MenuRow
              title="Body measurements"
              description={[
                settings.bodyWeight == null
                  ? 'Weight not set'
                  : `${measurementText(settings.bodyWeight, settings.bodyWeightUnit)} ${settings.bodyWeightUnit}`,
                settings.height == null
                  ? 'Height not set'
                  : `${measurementText(settings.height, settings.heightUnit)} ${settings.heightUnit}`,
              ].join(' · ')}
              href="/settings/body"
            />
            <MenuRow
              title="Rest timer"
              description={
                settings.restTimerEnabled
                  ? `On · ${Math.floor(settings.restTimerDefaultSeconds / 60)} min ${settings.restTimerDefaultSeconds % 60} sec`
                  : 'Off'
              }
              href="/settings/rest-timer"
            />
          </YStack>
          <YStack>
            <Text fontSize="$caption" fontWeight="600" color="$colorSubtle" mb="$field">
              Preferences
            </Text>
            <MenuRow
              title="Appearance"
              description={settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}
              href="/settings/theme"
            />
            <MenuRow
              title="Time zone"
              description={settings.timeZone.replace(/_/g, ' ').replace(/\//g, ' / ')}
              href="/settings/time-zone"
            />
            <MenuRow
              title="Permissions"
              description={<NotificationPermissions summaryOnly />}
              href="/settings/permissions"
            />
          </YStack>
          <Button
            chromeless
            self="flex-start"
            minH="$touch"
            color="$colorSubtle"
            icon={<LogOut size="$iconSmall" />}
            onPress={confirmSignOut}
          >
            Sign out
          </Button>
          <YStack gap="$compact">
            <XStack gap="$field" flexWrap="wrap">
              <Link href="/legal/privacy-policy" asChild>
                <Button chromeless size="$3" color="$colorSubtle">
                  Privacy policy
                </Button>
              </Link>
              <Link href="/legal/terms-of-service" asChild>
                <Button chromeless size="$3" color="$colorSubtle">
                  Terms of service
                </Button>
              </Link>
            </XStack>
            <Text fontSize="$caption" color="$colorMuted">
              Active · Version {version}
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
