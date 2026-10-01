import { memo, useState } from 'react'
import { XStack, YStack, Text, Circle, getTokenValue, useTheme } from 'tamagui'
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter'
import type { MuscleGroup } from '../../../types/api'

const muscleToSlug: Partial<Record<MuscleGroup, Slug[]>> = {
  CHEST: ['chest'],
  BICEPS: ['biceps'],
  ABDOMINALS: ['abs'],
  FOREARMS: ['forearm'],
  QUADRICEPS: ['quadriceps'],
  SHOULDERS: ['deltoids'],
  NECK: ['neck'],
  ADDUCTORS: ['adductors'],
  TRAPS: ['trapezius'],
  MIDDLE_BACK: ['upper-back'],
  LOWER_BACK: ['lower-back'],
  LATS: ['upper-back'],
  TRICEPS: ['triceps'],
  HAMSTRINGS: ['hamstring'],
  GLUTES: ['gluteal'],
  CALVES: ['calves'],
}
// The diagram's neutral parts have baked-in colors, so supply every part's theme color.
const bodySlugs: Slug[] = [
  'abs',
  'adductors',
  'ankles',
  'biceps',
  'calves',
  'chest',
  'deltoids',
  'feet',
  'forearm',
  'gluteal',
  'hamstring',
  'hands',
  'hair',
  'head',
  'knees',
  'lower-back',
  'neck',
  'obliques',
  'quadriceps',
  'tibialis',
  'trapezius',
  'triceps',
  'upper-back',
]
const normalize = (muscle: string) =>
  muscle
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase()
const label = (muscle: string) =>
  muscle
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())

interface MuscleHeatMapProps {
  primaryMuscles: string[]
  secondaryMuscles: string[]
  scale?: number
}

export const MuscleHeatMap = memo(function MuscleHeatMap({
  primaryMuscles,
  secondaryMuscles,
  scale = 1,
}: MuscleHeatMapProps) {
  const theme = useTheme()
  const diagramWidth = getTokenValue('$muscleDiagram', 'size')
  const [width, setWidth] = useState(0)
  const primary = [...new Set(primaryMuscles.map(normalize).filter(Boolean))]
  const supporting = [...new Set(secondaryMuscles.map(normalize).filter(Boolean))].filter(
    (muscle) => !primary.includes(muscle)
  )
  const groups = [
    { muscles: primary, title: 'Primary', color: '$primary' },
    { muscles: supporting, title: 'Supporting', color: '$trainingMuted' },
  ] as const
  const parts = new Map<Slug, ExtendedBodyPart>(
    bodySlugs.map((slug) => [slug, { slug, color: theme.borderColor.val }])
  )
  for (const [muscles, color] of [
    [supporting, theme.trainingMuted.val],
    [primary, theme.primary.val],
  ] as const) {
    for (const muscle of muscles) {
      for (const slug of muscleToSlug[muscle as MuscleGroup] ?? []) parts.set(slug, { slug, color })
    }
  }
  if (!primary.length && !supporting.length)
    return (
      <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
        No muscle groups listed for these exercises.
      </Text>
    )
  const diagramScale = Math.min(
    scale,
    diagramWidth / 200,
    width ? (width - getTokenValue('$field', 'space')) / 400 : diagramWidth / 200
  )
  return (
    <YStack gap="$field">
      <YStack gap="$compact">
        {groups.map(({ muscles, title, color }) => (
          <XStack key={title} gap="$field" items="flex-start">
            <XStack width="$day" gap="$compact" items="center">
              <Circle size="$iconSmall" bg={color} aria-hidden />
              <Text fontSize="$caption" lineHeight="$caption" color="$color" fontWeight="600">
                {title}
              </Text>
            </XStack>
            <Text flex={1} fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
              {muscles.map(label).join(' · ') || 'None listed'}
            </Text>
          </XStack>
        ))}
      </YStack>
      <XStack
        gap="$field"
        justify="center"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {(['front', 'back'] as const).map((side) => (
          <YStack key={side} flex={1} minW={0} items="center" gap="$compact">
            <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
              {side === 'front' ? 'Front' : 'Back'}
            </Text>
            <YStack
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${side === 'front' ? 'Front' : 'Back'} muscle diagram. Primary: ${primary.map(label).join(', ') || 'none listed'}. Supporting: ${supporting.map(label).join(', ') || 'none listed'}.`}
            >
              <YStack importantForAccessibility="no-hide-descendants" aria-hidden>
                <Body
                  data={[...parts.values()]}
                  side={side}
                  scale={diagramScale}
                  border={theme.background.val}
                  defaultFill={theme.borderColor.val}
                />
              </YStack>
            </YStack>
          </YStack>
        ))}
      </XStack>
    </YStack>
  )
})
