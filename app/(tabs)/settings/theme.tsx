import { YStack, Text, XStack, Button, Card } from 'tamagui'
import { Check, Sun, Moon, Smartphone } from '@tamagui/lucide-icons'
import { useSettingsStore } from '../../../stores/settingsStore'
import { Stack } from 'expo-router'

export default function ThemeSettingsScreen() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const options = [
    { label: 'Light', value: 'light', icon: Sun, description: 'Bright and clear' },
    { label: 'Dark', value: 'dark', icon: Moon, description: 'Easy on the eyes' },
    { label: 'System', value: 'system', icon: Smartphone, description: 'Matches device settings' },
  ] as const

  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen options={{ title: 'Appearance' }} />
      <YStack p="$4" gap="$4">
        <Text fontSize="$4" color="$color11" ml="$2">
          Select your preferred theme
        </Text>
        
        <YStack gap="$3">
          {options.map((option) => {
            const isActive = theme === option.value
            const Icon = option.icon
            
            return (
              <Button
                key={option.value}
                size="$6"
                bg={isActive ? '$backgroundAccent' : '$backgroundStrong'}
                borderColor={isActive ? '$borderAccent' : 'transparent'}
                borderWidth={1}
                pressStyle={{ bg: isActive ? '$backgroundAccentPress' : '$backgroundPress' }}
                onPress={() => setTheme(option.value)}
                p="$4"
                height="auto"
                animation="quick"
              >
                <XStack flex={1} items="center" gap="$4">
                  <YStack
                    bg={isActive ? '$primary' : '$background'}
                    p="$2"
                    rounded={100}
                    items="center"
                    justify="center"
                  >
                    <Icon size={24} color={isActive ? '$onPrimary' : '$color'} />
                  </YStack>
                  
                  <YStack flex={1} gap="$1">
                    <Text fontSize="$5" fontWeight="600" color={isActive ? '$primary' : '$color'}>
                      {option.label}
                    </Text>
                    <Text fontSize="$3" color="$color11">
                      {option.description}
                    </Text>
                  </YStack>

                  {isActive && (
                    <YStack
                      bg="$primary"
                      width={24}
                      height={24}
                      rounded={12}
                      items="center"
                      justify="center"
                    >
                      <Check size={14} color="$onPrimary" />
                    </YStack>
                  )}
                </XStack>
              </Button>
            )
          })}
        </YStack>
      </YStack>
    </YStack>
  )
}
