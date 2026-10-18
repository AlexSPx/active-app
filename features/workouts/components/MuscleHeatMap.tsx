import { memo, useState } from 'react'
import { View } from 'react-native'
import { UiText } from '../../../components/ui/Controls'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter'

const muscleToSlug: Record<string, Slug[] | undefined> = {
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
  const colors = useCadenceColors()
  const diagramWidth = 144
  const [width, setWidth] = useState(0)
  const primary = [...new Set(primaryMuscles.map(normalize).filter(Boolean))]
  const supporting = [...new Set(secondaryMuscles.map(normalize).filter(Boolean))].filter(
    (muscle) => !primary.includes(muscle)
  )
  const groups = [
    { muscles: primary, title: 'Primary', color: 'bg-accent' },
    { muscles: supporting, title: 'Supporting', color: 'bg-muted' },
  ] as const
  const parts = new Map<Slug, ExtendedBodyPart>(
    bodySlugs.map((slug) => [slug, { slug, color: colors.divider }])
  )
  for (const [muscles, color] of [
    [supporting, colors.muted],
    [primary, colors.accent],
  ] as const) {
    for (const muscle of muscles) {
      for (const slug of muscleToSlug[muscle] ?? []) parts.set(slug, { slug, color })
    }
  }
  if (!primary.length && !supporting.length)
    return <UiText textRole="bodyMuted">No muscle groups listed for these exercises.</UiText>
  const diagramScale = Math.max(
    0,
    Math.min(scale, diagramWidth / 200, width ? (width - 12) / 400 : diagramWidth / 200)
  )
  return (
    <View className="gap-field">
      <View className="gap-field">
        {groups.map(({ muscles, title, color }) => (
          <View key={title} className="flex-row items-start gap-field">
            <View className="min-w-20 shrink-0 flex-row items-center gap-compact">
              <View className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
              <UiText textRole="caption">{title}</UiText>
            </View>
            <UiText textRole="caption" className="flex-1">
              {muscles.map(label).join(' · ') || 'None listed'}
            </UiText>
          </View>
        ))}
      </View>
      <View
        className="flex-row justify-center gap-field"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {(['front', 'back'] as const).map((side) => (
          <View key={side} className="min-w-0 flex-1 items-center gap-field">
            <UiText textRole="caption">{side === 'front' ? 'Front' : 'Back'}</UiText>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${side === 'front' ? 'Front' : 'Back'} muscle diagram. Primary: ${primary.map(label).join(', ') || 'none listed'}. Supporting: ${supporting.map(label).join(', ') || 'none listed'}.`}
            >
              <View importantForAccessibility="no-hide-descendants" aria-hidden>
                <Body
                  data={[...parts.values()]}
                  side={side}
                  scale={diagramScale}
                  border={colors.background}
                  defaultFill={colors.divider}
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
})
