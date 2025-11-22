import React from 'react'
import { Platform } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { useRouter, Stack } from 'expo-router'
import { YStack, XStack, Text, Paragraph, Label, Button, Separator, ScrollView } from 'tamagui'
import { Ruler } from '@tamagui/lucide-icons'
import WheelSelector from '../../../components/ui/WheelSelector'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useUpdateUser } from '../../../hooks/useUpdateUser'

function formatNumber(n: number | null | undefined, digits = 1) {
  if (n == null || isNaN(n)) return ''
  const rounded = Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)
  return String(rounded)
}

export default function BodySettingsScreen() {
  const router = useRouter()
  const {
    bodyWeight,
    bodyWeightUnit,
    setBodyWeight,
    setBodyWeightUnit,
    height,
    heightUnit,
    setHeight,
    setHeightUnit,
  } = useSettingsStore()

  // Local staged state so we can enable Save only when changed
  const [wKg, setWKg] = React.useState<number | null>(bodyWeight)
  const [hCm, setHCm] = React.useState<number | null>(height)
  const [wUnit, setWUnit] = React.useState<'kg' | 'lb'>(bodyWeightUnit)
  const [hUnit, setHUnit] = React.useState<'cm' | 'in'>(heightUnit)
  const { updateUserProfile, isUpdating, error } = useUpdateUser()

  // Value arrays
  const weightValuesKg = React.useMemo(
    () =>
      Array.from({ length: Math.floor((200 - 30) / 0.5) + 1 }, (_, i) =>
        Number((30 + i * 0.5).toFixed(1))
      ),
    []
  )
  const weightValuesLb = React.useMemo(
    () => Array.from({ length: 440 - 70 + 1 }, (_, i) => 70 + i),
    []
  )
  const heightValuesCm = React.useMemo(
    () => Array.from({ length: 220 - 120 + 1 }, (_, i) => 120 + i),
    []
  )
  const heightValuesIn = React.useMemo(
    () => Array.from({ length: 86 - 48 + 1 }, (_, i) => 48 + i),
    []
  )

  const displayWeight: number | null = (() => {
    if (wKg == null) return null
    return wUnit === 'kg' ? Number(wKg.toFixed(1)) : Math.round(wKg * 2.2046226218)
  })()

  const displayHeight: number | null = (() => {
    if (hCm == null) return null
    return hUnit === 'cm' ? Math.round(hCm) : Math.round(hCm / 2.54)
  })()

  const onSelectWeight = (val: number | null) => {
    if (val == null) {
      setWKg(null)
      return
    }
    const kg = wUnit === 'kg' ? val : val / 2.2046226218
    setWKg(Math.round(kg * 100) / 100)
  }
  const onSelectHeight = (val: number | null) => {
    if (val == null) {
      setHCm(null)
      return
    }
    const cm = hUnit === 'cm' ? val : val * 2.54
    setHCm(Math.round(cm))
  }

  // Dirty detection and save handler
  const nearlyEqual = (a: number | null | undefined, b: number | null | undefined, eps = 1e-6) => {
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    return Math.abs(a - b) < eps
  }
  const isDirty =
    !nearlyEqual(wKg, bodyWeight) ||
    !nearlyEqual(hCm, height) ||
    wUnit !== bodyWeightUnit ||
    hUnit !== heightUnit

  const handleSave = async () => {
    // Persist to server in metric units only
    await updateUserProfile({
      measurements: {
        weightKg: wKg ?? null,
        heightCm: hCm ?? null,
      },
    })

    // Mirror into local settings store
    setBodyWeight(wKg)
    setHeight(hCm)
    setBodyWeightUnit(wUnit)
    setHeightUnit(hUnit)
  }

  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen options={{ title: 'Body measurements' }} />
      <ScrollView flex={1} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <YStack bg="$background" p="$4" gap="$4">
          <YStack gap="$3">
            <XStack items="center" gap="$2">
              <Ruler size={18} color="$color" />
              <Text fontSize="$6" fontWeight="700">
                Body measurements
              </Text>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Label>Body weight</Label>
              <XStack gap="$2">
                <Button
                  size="$2"
                  {...(wUnit === 'kg' ? {} : { variant: 'outlined' })}
                  onPress={() => setWUnit('kg')}
                >
                  kg
                </Button>
                <Button
                  size="$2"
                  {...(wUnit === 'lb' ? {} : { variant: 'outlined' })}
                  onPress={() => setWUnit('lb')}
                >
                  lb
                </Button>
              </XStack>
            </XStack>

            <WheelSelector
              values={wUnit === 'kg' ? weightValuesKg : weightValuesLb}
              selected={displayWeight}
              onChange={(v) => onSelectWeight(v as number | null)}
              formatItem={(v) =>
                wUnit === 'kg' ? Number(v).toFixed(1) : Math.round(Number(v)).toString()
              }
              itemHeight={34}
              visibleCount={5}
              allowNull
              nullLabel="-"
            />
          </YStack>

          <Separator />

          <YStack gap="$2">
            <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Label>Height</Label>
              <XStack gap="$2">
                <Button
                  size="$2"
                  {...(hUnit === 'cm' ? {} : { variant: 'outlined' })}
                  onPress={() => setHUnit('cm')}
                >
                  cm
                </Button>
                <Button
                  size="$2"
                  {...(hUnit === 'in' ? {} : { variant: 'outlined' })}
                  onPress={() => setHUnit('in')}
                >
                  in
                </Button>
              </XStack>
            </XStack>

            {Platform.OS === 'ios' ? (
              <YStack height={140} style={{ justifyContent: 'center' }}>
                <Picker
                  selectedValue={displayHeight}
                  onValueChange={(v) => onSelectHeight(Number(v))}
                  style={{ height: 140 }}
                  itemStyle={{ fontSize: 18 }}
                >
                  {(hUnit === 'cm' ? heightValuesCm : heightValuesIn).map((v) => (
                    <Picker.Item key={v} value={v} label={Math.round(Number(v)).toString()} />
                  ))}
                </Picker>
              </YStack>
            ) : (
              <WheelSelector
                values={hUnit === 'cm' ? heightValuesCm : heightValuesIn}
                selected={displayHeight}
                onChange={(v) => onSelectHeight(v as number | null)}
                formatItem={(v) => Math.round(Number(v)).toString()}
                itemHeight={34}
                visibleCount={5}
                allowNull
                nullLabel="-"
              />
            )}
          </YStack>

          <XStack gap="$2">
            <Button
              bg={isDirty ? '$primary' : '$color4'}
              flex={1}
              disabled={!isDirty || isUpdating}
              onPress={handleSave}
            >
              {isUpdating ? 'Saving…' : 'Save'}
            </Button>
            <Button flex={1} variant="outlined" onPress={() => router.back()}>
              Back
            </Button>
          </XStack>
          {!!error && <Paragraph color="$red10">{error}</Paragraph>}
        </YStack>
      </ScrollView>
    </YStack>
  )
}
