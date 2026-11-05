import type { ScrollViewInstance } from 'react-native'
import { useTabContentInset } from '../../../navigation/TabContentInset'
import { useCallback, useRef } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { Link, useFocusEffect } from 'expo-router'
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
} from '../../../components/ui/icons'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { useAuth } from '../../../contexts/AuthContext'
import { useSettingsStore } from '../../../features/settings'
import { measurementText } from '../../../features/settings/inputs'
import NotificationPermissions from '../../../components/NotificationPermissions'
import { launchFacade } from '../../../features/launch/launchFacade'
import {
  Button,
  Divider,
  SettingsGroup,
  SettingsRow,
  UiText,
} from '../../../components/ui/Controls'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'

export default function SettingsMenuScreen() {
  const bottomInset = useTabContentInset()
  const scrollViewRef = useRef<ScrollViewInstance>(null)
  const localProfile = launchFacade.auth.getStartupPlan().kind === 'local-profile'
  const { logout, user } = useAuth()
  const settings = useSettingsStore()
  const colors = useCadenceColors()
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

  useFocusEffect(
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false })
    }, [])
  )

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <View className="w-full max-w-[720px] self-center gap-field p-page">
          <Link href={launchFacade.settings.profileRoute() as any} asChild>
            <Button
              variant="surface"
              shape="card"
              density="card"
              accessibilityLabel={account.accessibilityLabel}
            >
              <View className="w-full flex-row items-center gap-field">
                <View className="h-touch w-touch items-center justify-center rounded-button bg-raised">
                  <UserRound size={24} color={colors.accent} />
                </View>
                <View className="flex-1 gap-compact">
                  <UiText textRole="bodyEmphasis">{account.name}</UiText>
                  {account.email && <UiText textRole="caption">{account.email}</UiText>}
                </View>
                <ChevronRight size={20} color={colors.muted} />
              </View>
            </Button>
          </Link>

          <SettingsGroup title="Training">
            <Link href="/settings/body" asChild>
              <SettingsRow
                title="Body measurements"
                icon={<Ruler size={22} color={colors.accent} />}
                description={[
                  settings.bodyWeight == null
                    ? 'Weight not set'
                    : `${measurementText(settings.bodyWeight, settings.bodyWeightUnit)} ${settings.bodyWeightUnit}`,
                  settings.height == null
                    ? 'Height not set'
                    : `${measurementText(settings.height, settings.heightUnit)} ${settings.heightUnit}`,
                ].join(' · ')}
                trailing={<ChevronRight size={20} color={colors.muted} />}
              />
            </Link>
            <Divider className="ml-field" />
            <Link href="/settings/rest-timer" asChild>
              <SettingsRow
                title="Rest timer"
                icon={<Clock3 size={22} color={colors.accent} />}
                description={
                  settings.restTimerEnabled
                    ? `On · ${Math.floor(settings.restTimerDefaultSeconds / 60)} min ${settings.restTimerDefaultSeconds % 60} sec`
                    : 'Off'
                }
                trailing={<ChevronRight size={20} color={colors.muted} />}
              />
            </Link>
          </SettingsGroup>

          {localProfile && (
            <SettingsGroup title="Data">
              <Link href="/settings/data" asChild>
                <SettingsRow
                  title="Data on this device"
                  icon={<Database size={22} color={colors.accent} />}
                  description="Manage this training profile and erase saved data"
                  trailing={<ChevronRight size={20} color={colors.muted} />}
                />
              </Link>
            </SettingsGroup>
          )}

          <SettingsGroup title="Preferences">
            <Link href="/settings/theme" asChild>
              <SettingsRow
                title="Appearance"
                icon={<Palette size={22} color={colors.accent} />}
                description={settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}
                trailing={<ChevronRight size={20} color={colors.muted} />}
              />
            </Link>
            {!localProfile && (
              <>
                <Divider className="ml-field" />
                <Link href="/settings/time-zone" asChild>
                  <SettingsRow
                    title="Time zone"
                    icon={<Globe2 size={22} color={colors.accent} />}
                    description={settings.timeZone.replace(/_/g, ' ').replace(/\//g, ' / ')}
                    trailing={<ChevronRight size={20} color={colors.muted} />}
                  />
                </Link>
              </>
            )}
            <Divider className="ml-field" />
            <Link href="/settings/permissions" asChild>
              <SettingsRow
                title="Permissions"
                icon={<Bell size={22} color={colors.accent} />}
                description={<NotificationPermissions summaryOnly />}
                trailing={<ChevronRight size={20} color={colors.muted} />}
              />
            </Link>
          </SettingsGroup>

          <SettingsGroup title="Legal">
            <Link href="/legal/privacy-policy" asChild>
              <SettingsRow
                title="Privacy policy"
                icon={<ShieldCheck size={22} color={colors.accent} />}
                description="How we handle your data"
                trailing={<ChevronRight size={20} color={colors.muted} />}
              />
            </Link>
            <Divider className="ml-field" />
            <Link href="/legal/terms-of-service" asChild>
              <SettingsRow
                title="Terms of service"
                icon={<ScrollText size={22} color={colors.accent} />}
                description="Terms for using Active"
                trailing={<ChevronRight size={20} color={colors.muted} />}
              />
            </Link>
          </SettingsGroup>

          {account.signOutAction && (
            <Button variant="ghost" className="self-start" onPress={confirmSignOut}>
              <View className="flex-row items-center gap-compact">
                <LogOut size={20} color={colors.muted} />
                <UiText textRole="bodyMuted">{account.signOutAction.label}</UiText>
              </View>
            </Button>
          )}
          <UiText textRole="caption">Active · Version {version}</UiText>
        </View>
      </ScrollView>
    </View>
  )
}
