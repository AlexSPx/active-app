import { Alert, Linking, View } from 'react-native'
import { Link } from 'expo-router'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { SettingsPage } from '../../components/settings/SettingsPage'
import { SettingsGroup, SettingsRow, UiText } from '../../components/ui/Controls'
import { ChevronRight, Globe2, Library, Settings } from '../../components/ui/icons'
import { useCadenceColors } from '../../components/ui/useCadenceColors'

export default function AboutScreen() {
  const colors = useCadenceColors()
  const version = Application.nativeApplicationVersion || Constants.expoConfig?.version || 'Unknown'

  return (
    <SettingsPage title="About">
      <SettingsGroup title="Active">
        <View className="-my-1 min-h-touch flex-row items-center gap-field px-2 py-2">
          <View className="h-touch w-touch items-center justify-center rounded-control bg-raised">
            <Settings size={22} color={colors.accent} />
          </View>
          <View className="flex-1 gap-compact">
            <UiText textRole="bodyEmphasis">App version</UiText>
            <UiText textRole="caption">{version}</UiText>
          </View>
        </View>
        <SettingsRow
          title="GitHub"
          icon={<Globe2 size={22} color={colors.accent} />}
          trailing={<ChevronRight size={20} color={colors.muted} />}
          onPress={() => {
            void Linking.openURL('https://github.com/AlexSPx/active-app').catch(() =>
              Alert.alert('Could not open GitHub', 'Please try again later.')
            )
          }}
        />
        <Link href="/settings/dependencies" asChild>
          <SettingsRow
            title="Dependencies"
            icon={<Library size={22} color={colors.accent} />}
            trailing={<ChevronRight size={20} color={colors.muted} />}
          />
        </Link>
      </SettingsGroup>
    </SettingsPage>
  )
}
