import { memo } from 'react'
import { View } from 'react-native'
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'

const muscleSlugs: Record<string, Slug[] | undefined> = {
  chest: ['chest'],
  lats: ['upper-back'],
  'middle back': ['upper-back'],
  'lower back': ['lower-back'],
  traps: ['trapezius'],
  shoulders: ['deltoids'],
  neck: ['neck'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  quadriceps: ['quadriceps'],
  hamstrings: ['hamstring'],
  calves: ['calves'],
  adductors: ['adductors'],
  abductors: ['gluteal'],
  glutes: ['gluteal'],
  abdominals: ['abs', 'obliques'],
}

const bodyParts: Slug[] = [
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

export const MuscleAtlas = memo(function MuscleAtlas({ muscles }: { muscles: readonly string[] }) {
  const colors = useCadenceColors()
  const slugs = new Set(muscles.flatMap((muscle) => muscleSlugs[muscle] ?? []))
  const data: ExtendedBodyPart[] = bodyParts.map((slug) => ({
    slug,
    color: slugs.has(slug) ? colors.accent : muscles.length ? colors.divider : colors.muted,
  }))
  return (
    <View
      className="flex-row items-center justify-center"
      style={{ width: 132, height: 138 }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {(['front', 'back'] as const).map((side) => (
        <Body
          key={side}
          side={side}
          scale={0.33}
          data={data}
          border={colors.background}
          defaultFill={colors.divider}
        />
      ))}
    </View>
  )
})
