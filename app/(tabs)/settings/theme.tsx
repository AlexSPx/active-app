import { View } from 'react-native'
import { Check, Play } from '../../../components/ui/icons'
import { SettingsPage } from '../../../components/settings/SettingsPage'
import { Button, Surface, UiText } from '../../../components/ui/Controls'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { useSettingsStore } from '../../../features/settings'

export default function ThemeSettingsScreen() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const colors = useCadenceColors()
  const options = [
    { label: 'System', value: 'system', description: 'Follow your device’s appearance.' },
    { label: 'Light', value: 'light', description: 'Light surfaces and dark text.' },
    { label: 'Dark', value: 'dark', description: 'Dark surfaces and light text.' },
  ] as const

  return (
    <SettingsPage title="Appearance" description="Choose how Active looks on this device.">
      <View className="gap-field">
        {options.map((option) => {
          const selected = theme === option.value
          return (
            <Button
              key={option.value}
              variant={selected ? 'selected' : 'surface'}
              shape="card"
              density="card"
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              onPress={() => setTheme(option.value)}
            >
              <View className="w-full flex-row items-center gap-field">
                <View
                  className={`h-8 w-8 items-center justify-center rounded-full border ${selected ? 'border-accent bg-accent' : 'border-divider bg-surface'}`}
                >
                  {selected && <Check size={16} color={colors.onAccent} />}
                </View>
                <View className="flex-1 gap-compact">
                  <UiText textRole="bodyEmphasis">{option.label}</UiText>
                  <UiText textRole="caption">{option.description}</UiText>
                </View>
              </View>
            </Button>
          )
        })}
      </View>
      <View className="gap-field">
        <UiText textRole="bodyEmphasis">Preview</UiText>
        <Surface>
          <UiText textRole="cardTitle">Lower body foundations</UiText>
          <UiText textRole="caption">Barbell full squat / Barbell lunge{'\n'}6 sets</UiText>
          <View
            className="h-action flex-row items-center justify-center gap-field rounded-button bg-accent"
            accessible
            accessibilityLabel="Example workout button"
          >
            <Play size={20} color={colors.onAccent} aria-hidden />
            <UiText textRole="bodyOnAccent">Start workout</UiText>
          </View>
        </Surface>
      </View>
      <UiText textRole="caption">Changes apply automatically.</UiText>
    </SettingsPage>
  )
}
