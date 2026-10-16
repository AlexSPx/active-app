import { Alert } from 'react-native'
import type { ReactNode } from 'react'
import { Link, type Href } from 'expo-router'
import { Button, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui'
import {
  Bell,
  ChevronRight,
  Clock3,
  Database,
  Globe2,
  LogOut,
  Palette,
  Ruler,
  ScrollText,
  ShieldCheck,
  UserRound,
} from '@tamagui/lucide-icons'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { useAuth } from '../../../contexts/AuthContext'
import { useSettingsStore } from '../../../features/settings'
import { measurementText } from '../../../features/settings/inputs'
import NotificationPermissions from '../../../components/NotificationPermissions'
import { launchFacade } from '../../../features/launch/launchFacade'

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap="$compact">
      <Text
        fontFamily="$body"
        accessibilityRole="header"
        fontSize="$caption"
        lineHeight={18}
        fontWeight="600"
        color="$primary"
        px="$compact"
      >
        {title}
      </Text>
      <YStack
        bg="$surface"
        borderWidth={1}
        borderColor="$borderColor"
        rounded="$card"
        overflow="hidden"
      >
        {children}
      </YStack>
    </YStack>
  )
}

function MenuRow({
  title,
  description,
  href,
  icon,
}: {
  title: string
  description: ReactNode
  href: Href
  icon: ReactNode
}) {
  return (
    <Link href={href} asChild>
      <Button unstyled px="$field" py="$compact" minH="$touch" pressStyle={{ bg: '$surfacePress' }}>
        <XStack gap="$field" items="center" justify="space-between">
          <YStack
            width={36}
            height={36}
            rounded="$control"
            bg="$backgroundAccent"
            items="center"
            justify="center"
          >
            {icon}
          </YStack>
          <YStack flex={1} gap={2}>
            <Text fontFamily="$body" fontSize={16} lineHeight={20} fontWeight="500" color="$color">
              {title}
            </Text>
            {typeof description === 'string' ? (
              <Paragraph fontSize={13} lineHeight={18} fontWeight="400" color="$colorSubtle">
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
  const localProfile = launchFacade.auth.getStartupPlan().kind === 'local-profile'
  const { logout, user } = useAuth()
  const settings = useSettingsStore()
  const account = launchFacade.settings.menuAccount(user)
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
        <YStack p="$field" gap="$field" width="100%" maxW="$content" self="center">
          <Link href={launchFacade.settings.profileRoute() as any} asChild>
            <Button
              unstyled
              minH="$touch"
              p="$field"
              rounded="$card"
              bg="$surface"
              borderWidth={1}
              borderColor="$borderColor"
              pressStyle={{ bg: '$surfacePress' }}
              accessibilityLabel={account.accessibilityLabel}
            >
              <XStack gap="$field" items="center">
                <YStack
                  width="$touch"
                  height="$touch"
                  rounded="$button"
                  bg="$backgroundAccent"
                  items="center"
                  justify="center"
                >
                  <UserRound size={24} color="$primary" />
                </YStack>
                <YStack flex={1} gap="$compact">
                  <Text
                    fontFamily="$body"
                    fontSize="$header"
                    lineHeight={24}
                    fontWeight="500"
                    color="$color"
                  >
                    {account.name}
                  </Text>
                  {account.email && (
                    <Text
                      fontFamily="$body"
                      fontSize="$caption"
                      lineHeight="$caption"
                      color="$colorSubtle"
                    >
                      {account.email}
                    </Text>
                  )}
                </YStack>
                <ChevronRight size="$icon" color="$colorMuted" />
              </XStack>
            </Button>
          </Link>
          <MenuSection title="Training">
            <MenuRow
              title="Body measurements"
              icon={<Ruler size={22} color="$primary" />}
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
              icon={<Clock3 size={22} color="$primary" />}
              description={
                settings.restTimerEnabled
                  ? `On · ${Math.floor(settings.restTimerDefaultSeconds / 60)} min ${settings.restTimerDefaultSeconds % 60} sec`
                  : 'Off'
              }
              href="/settings/rest-timer"
            />
          </MenuSection>
          {localProfile && (
            <MenuSection title="Data">
              <MenuRow
                title="Data on this device"
                icon={<Database size={22} color="$primary" />}
                description="Manage this training profile and erase saved data"
                href="/settings/data"
              />
            </MenuSection>
          )}
          <MenuSection title="Preferences">
            <MenuRow
              title="Appearance"
              icon={<Palette size={22} color="$primary" />}
              description={settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}
              href="/settings/theme"
            />
            {!localProfile && (
              <MenuRow
                title="Time zone"
                icon={<Globe2 size={22} color="$primary" />}
                description={settings.timeZone.replace(/_/g, ' ').replace(/\//g, ' / ')}
                href="/settings/time-zone"
              />
            )}
            <MenuRow
              title="Permissions"
              icon={<Bell size={22} color="$primary" />}
              description={<NotificationPermissions summaryOnly />}
              href="/settings/permissions"
            />
          </MenuSection>
          <MenuSection title="Legal">
            <MenuRow
              title="Privacy policy"
              icon={<ShieldCheck size={22} color="$primary" />}
              description="How we handle your data"
              href="/legal/privacy-policy"
            />
            <MenuRow
              title="Terms of service"
              icon={<ScrollText size={22} color="$primary" />}
              description="Terms for using Active"
              href="/legal/terms-of-service"
            />
          </MenuSection>
          {account.signOutAction && (
            <Button
              chromeless
              self="flex-start"
              minH="$touch"
              color="$colorSubtle"
              icon={<LogOut size="$iconSmall" />}
              onPress={confirmSignOut}
            >
              {account.signOutAction.label}
            </Button>
          )}
          <YStack gap="$compact">
            <Text fontFamily="$body" fontSize="$caption" color="$colorMuted">
              Active · Version {version}
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
