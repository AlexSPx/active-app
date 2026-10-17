import { useState } from 'react'
import { Picker } from '@react-native-picker/picker'
import { ScrollView, Text, TextInput, Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useCSSVariable, withUniwind } from 'uniwind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettingsStore } from '../../features/settings'

const StyledPicker = withUniwind(Picker)
const themeOptions = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

export default function UniwindPreview() {
  const insets = useSafeAreaInsets()
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const [accentColor, mutedColor] = useCSSVariable(['--color-accent', '--color-muted'])
  const [focused, setFocused] = useState(false)
  const [value, setValue] = useState('Type here to check focus')
  const [selection, setSelection] = useState('strength')
  const [controlOn, setControlOn] = useState(false)
  const [visible, setVisible] = useState(true)
  const translationX = useSharedValue(0)
  const toggleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translationX.value }],
  }))

  if (!visible) return null

  return (
    <View
      accessibilityViewIsModal
      className="absolute inset-0 z-50 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1 gap-1">
            <Text className="text-foreground text-xl font-bold">Uniwind preview</Text>
            <Text className="text-muted text-sm">Development only · saved preference: {theme}</Text>
          </View>
          <Pressable
            accessibilityLabel="Close Uniwind preview"
            accessibilityRole="button"
            className="rounded-control bg-raised px-4 py-3"
            onPress={() => setVisible(false)}
          >
            <Text className="text-foreground font-medium">Close</Text>
          </Pressable>
        </View>

        <View className="flex-row gap-2">
          {themeOptions.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: theme === option.value }}
              className={`flex-1 rounded-control border px-3 py-3 ${
                theme === option.value ? 'border-accent bg-raised' : 'border-divider bg-surface'
              }`}
              onPress={() => setTheme(option.value)}
            >
              <Text className="text-center text-foreground">{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <View className="gap-3 rounded-card border border-divider bg-surface p-4">
          <Text className="text-foreground text-lg font-semibold">Text and focus</Text>
          <TextInput
            accessibilityLabel="Preview text input"
            className={`rounded-control border bg-background px-3 py-3 text-foreground ${
              focused ? 'border-accent' : 'border-divider'
            }`}
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            onChangeText={setValue}
            placeholder="Tap to focus"
            placeholderTextColor={mutedColor == null ? undefined : String(mutedColor)}
            value={value}
          />
          <Text className="text-muted text-sm">Focus: {focused ? 'active' : 'inactive'}</Text>
        </View>

        <View className="gap-3 rounded-card border border-divider bg-surface p-4">
          <Text className="text-foreground text-lg font-semibold">Animated control</Text>
          <Pressable
            accessibilityLabel="Animate preview control"
            accessibilityRole="switch"
            accessibilityState={{ checked: controlOn }}
            className="h-10 w-[4.5rem] justify-center rounded-full bg-raised p-1"
            onPress={() => {
              const next = !controlOn
              setControlOn(next)
              translationX.value = withTiming(next ? 28 : 0, { duration: 180 })
            }}
          >
            <Animated.View className="h-8 w-8 rounded-full bg-accent" style={toggleStyle} />
          </Pressable>
        </View>

        <View className="flex-row items-center gap-3 rounded-card border border-divider bg-surface p-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-raised">
            <Svg width={28} height={28} viewBox="0 0 24 24" accessibilityLabel="Accent star icon">
              <Path
                d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9L12 3Z"
                fill="none"
                stroke={accentColor == null ? '#624572' : String(accentColor)}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
              />
            </Svg>
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-foreground font-semibold">SVG theme color</Text>
            <Text className="text-muted text-sm">{String(accentColor)}</Text>
          </View>
        </View>

        <View className="gap-3 rounded-card border border-divider bg-surface p-4">
          <Text className="text-foreground text-lg font-semibold">Third-party picker</Text>
          <StyledPicker
            className="rounded-control border border-divider bg-background text-foreground"
            onValueChange={(nextValue) => setSelection(String(nextValue))}
            selectedValue={selection}
          >
            <Picker.Item label="Strength" value="strength" />
            <Picker.Item label="Cardio" value="cardio" />
          </StyledPicker>
          <Text className="text-muted text-sm">Selected: {selection}</Text>
        </View>

        {[1, 2, 3].map((index) => (
          <View key={index} className="gap-2 rounded-card border border-divider bg-surface p-4">
            <Text className="text-foreground font-semibold">Scrollable panel {index}</Text>
            <Text className="text-muted text-sm">
              This content checks that the internal preview scrolls beneath the safe area.
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
