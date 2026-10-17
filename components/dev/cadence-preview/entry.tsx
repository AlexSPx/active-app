import '../../../global.css'
import { useEffect, useState } from 'react'
import { ScrollView, StatusBar, Text, useColorScheme, View } from 'react-native'
import { registerRootComponent } from 'expo'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { Uniwind } from 'uniwind'
import {
  Button,
  Divider,
  IconButton,
  SegmentedSelection,
  SettingsGroup,
  SettingsRow,
  Surface,
  TextField,
  UiBadge,
  UiText,
} from '../../ui/Controls'

void SplashScreen.preventAutoHideAsync()

function CadenceControlsPreview() {
  const [fontsLoaded, fontError] = useFonts({
    'DM Sans': require('../../../assets/fonts/DM-Sans-Regular.ttf'),
    'DM Sans Medium': require('../../../assets/fonts/DM-Sans-Medium.ttf'),
    'DM Sans Semibold': require('../../../assets/fonts/DM-Sans-SemiBold.ttf'),
  })
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [section, setSection] = useState<'today' | 'week'>('today')
  const deviceColorScheme = useColorScheme()
  const sectionOptions = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
  ] as const
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  const selectTheme = (value: 'system' | 'light' | 'dark') => {
    setTheme(value)
    Uniwind.setTheme(value)
  }
  const activeTheme = theme === 'system' ? deviceColorScheme : theme

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} className="flex-1 bg-background">
        <StatusBar barStyle={activeTheme === 'dark' ? 'light-content' : 'dark-content'} />
        <ScrollView
          style={{ flex: 1 }}
          className="flex-1 bg-background"
          contentContainerClassName="gap-section p-page"
        >
          <View className="gap-compact">
            <UiText accessibilityRole="header" textRole="screenTitle">
              Cadence controls
            </UiText>
            <UiText textRole="bodyMuted">
              Native preview of the shared settings controls, font weights, and semantic colors.
            </UiText>
          </View>

          <Surface>
            <UiText textRole="cardTitle">Appearance</UiText>
            <SegmentedSelection<'system' | 'light' | 'dark'>
              value={theme}
              accessibilityLabel="Preview color theme"
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onValueChange={selectTheme}
            />
            <UiText textRole="caption">
              Theme selection changes the same CSS variables used by the app.
            </UiText>
          </Surface>

          <SettingsGroup title="CONTROL STATES">
            <View className="gap-field p-card">
              <Button accessibilityLabel="Start workout">Start workout</Button>
              <Button disabled accessibilityLabel="Unavailable action">
                Unavailable action
              </Button>
              <Button loading accessibilityLabel="Saving workout">
                Saving workout
              </Button>
              <View className="flex-row items-center gap-field">
                <IconButton
                  variant="secondary"
                  shape="control"
                  accessibilityLabel="Add exercise"
                  onPress={() => undefined}
                >
                  <Text className="text-body font-dm-medium text-foreground">+</Text>
                </IconButton>
                <UiBadge>Active</UiBadge>
                <UiBadge variant="secondary">Draft</UiBadge>
              </View>
            </View>
          </SettingsGroup>

          <SettingsGroup title="SETTINGS ROWS">
            <SettingsRow
              title="Body measurements"
              description="Manage units and profile details"
              icon={<UiText textRole="captionEmphasis">✓</UiText>}
              trailing={<UiText textRole="captionEmphasis">Open</UiText>}
              onPress={() => undefined}
            />
            <Divider />
            <SettingsRow
              title="Long content wraps"
              description="A longer description demonstrates wrapping without clipping when a setting includes more detail than fits on one line."
              icon={<UiText textRole="captionEmphasis">✓</UiText>}
              onPress={() => undefined}
            />
          </SettingsGroup>

          <Surface>
            <UiText textRole="cardTitle">Form states</UiText>
            <UiText textRole="bodyEmphasis">Email address</UiText>
            <TextField
              accessibilityLabel="Email address"
              accessibilityHint="Enter a valid email address"
              placeholder="name@example.com"
              value="not-an-email"
              editable={false}
              invalid
            />
            <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
              Enter a valid email address.
            </UiText>
            <TextField
              accessibilityLabel="Workout name"
              placeholder="Workout name"
              value="Leg day"
              disabled
            />
          </Surface>

          <Surface>
            <UiText textRole="cardTitle">Readable long copy</UiText>
            <UiText textRole="body">
              Keep your workout settings easy to review as content grows. This paragraph wraps
              across the available width and keeps enough spacing around controls for larger text
              and smaller screens.
            </UiText>
            <Divider />
            <UiText textRole="caption">
              Cadence preview · DM Sans regular, medium, and semibold
            </UiText>
          </Surface>

          <SegmentedSelection<'today' | 'week'>
            value={section}
            accessibilityLabel="Preview selection state"
            options={sectionOptions}
            onValueChange={setSection}
          />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

registerRootComponent(CadenceControlsPreview)
