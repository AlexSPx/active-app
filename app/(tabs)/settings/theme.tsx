import { Button, Circle, Paragraph, Text, XStack, YStack } from 'tamagui'
import { Check } from '@tamagui/lucide-icons'
import { SettingsPage } from '../../../components/settings/SettingsPage'
import { useSettingsStore } from '../../../features/settings'

export default function ThemeSettingsScreen() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const options = [
    { label: 'System', value: 'system', description: 'Follow your device’s appearance.' },
    { label: 'Light', value: 'light', description: 'Light surfaces and dark text.' },
    { label: 'Dark', value: 'dark', description: 'Dark surfaces and light text.' },
  ] as const
  return (
    <SettingsPage title="Appearance" description="Choose how Active looks on this device.">
      <YStack>
        {options.map((option) => (
          <Button
            key={option.value}
            unstyled
            py="$card"
            minH="$touch"
            accessibilityRole="radio"
            accessibilityState={{ checked: theme === option.value }}
            onPress={() => setTheme(option.value)}
            pressStyle={{ bg: '$backgroundPress' }}
          >
            <XStack items="center" gap="$field">
              <Circle
                size="$icon"
                borderWidth={1}
                borderColor={theme === option.value ? '$primary' : '$borderColor'}
                bg={theme === option.value ? '$primary' : '$backgroundTransparent'}
              >
                {theme === option.value && <Check size="$iconSmall" color="$onPrimary" />}
              </Circle>
              <YStack flex={1} gap="$compact">
                <Text fontSize="$body" fontWeight="600">
                  {option.label}
                </Text>
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  {option.description}
                </Text>
              </YStack>
              {theme === option.value && (
                <Text fontSize="$caption" color="$primary">
                  Selected
                </Text>
              )}
            </XStack>
          </Button>
        ))}
      </YStack>
      <YStack gap="$field">
        <Text fontSize="$body" fontWeight="600">
          Preview
        </Text>
        <YStack
          bg="$surface"
          borderWidth={1}
          borderColor="$borderColor"
          rounded="$card"
          p="$card"
          gap="$field"
        >
          <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600">
            Lower body foundations
          </Text>
          <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            Barbell squat · Barbell lunge{'\n'}6 sets · ~15 min
          </Paragraph>
          <YStack
            height="$action"
            rounded="$button"
            bg="$primary"
            items="center"
            justify="center"
            accessibilityLabel="Example workout button"
          >
            <Text fontSize="$body" color="$onPrimary" fontWeight="600">
              Start workout
            </Text>
          </YStack>
        </YStack>
      </YStack>
      <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
        Changes apply automatically.
      </Paragraph>
    </SettingsPage>
  )
}
