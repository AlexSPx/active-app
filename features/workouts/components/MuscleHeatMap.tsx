import { memo, useState, useMemo } from 'react'
import { XStack, YStack, Text, Button } from 'tamagui'
import Body from 'react-native-body-highlighter'
import type { MuscleGroup } from '../../../types/api'

const muscleToSlug: Record<MuscleGroup, string[]> = {
  // Front muscles
  CHEST: ['chest'],
  BICEPS: ['biceps'],
  ABDOMINALS: ['abs'],
  FOREARMS: ['forearm'],
  QUADRICEPS: ['quadriceps'],
  SHOULDERS: ['deltoids'],
  NECK: ['neck'],
  ADDUCTORS: ['adductors'],
  ABDUCTORS: ['adductors'],

  // Back muscles
  TRAPS: ['trapezius'],
  MIDDLE_BACK: ['upper-back'],
  LOWER_BACK: ['lower-back'],
  LATS: ['upper-back'],
  TRICEPS: ['triceps'],
  HAMSTRINGS: ['hamstring'],
  GLUTES: ['gluteal'],
  CALVES: ['calves'],
}

const HEAT_MAP_COLORS = [
  '#f0f0f0',  // 0: not targeted
  '#ffcccc',  // 1: very light
  '#ff9999',  // 2: light  
  '#ff6666',  // 3: medium
  '#ff3333',  // 4: high
  '#cc0000',  // 5+: very high
]

interface MuscleHeatMapProps {
  primaryMuscles: string[]
  secondaryMuscles: string[]
  scale?: number
}

export const MuscleHeatMap = memo(function MuscleHeatMap({
  primaryMuscles,
  secondaryMuscles,
  scale = 1.2,
}: MuscleHeatMapProps) {
  const [side, setSide] = useState<'front' | 'back'>('front')

  const { bodyParts, maxIntensity } = useMemo(() => {
    const muscleScoreMap = new Map<string, number>()

    for (const muscle of secondaryMuscles) {
      const slugs = muscleToSlug[muscle.replace(/[\s-]+/g, '_').toUpperCase() as MuscleGroup]
      if (slugs) {
        slugs.forEach(slug => {
          const current = muscleScoreMap.get(slug) || 0
          muscleScoreMap.set(slug, current + 1)
        })
      }
    }

    for (const muscle of primaryMuscles) {
      const slugs = muscleToSlug[muscle.replace(/[\s-]+/g, '_').toUpperCase() as MuscleGroup]
      if (slugs) {
        slugs.forEach(slug => {
          const current = muscleScoreMap.get(slug) || 0
          muscleScoreMap.set(slug, current + 2)
        })
      }
    }

    const scores = Array.from(muscleScoreMap.values())
    const max = scores.length > 0 ? Math.max(...scores) : 0

    const parts = Array.from(muscleScoreMap.entries()).map(([slug, score]) => {
      const normalizedIntensity = max > 0 
        ? Math.ceil((score / max) * 5)
        : 1
      return {
        slug: slug as any,
        intensity: Math.min(normalizedIntensity, 5),
      }
    })

    return { bodyParts: parts, maxIntensity: max }
  }, [primaryMuscles, secondaryMuscles])

  if (bodyParts.length === 0) {
    return (
      <YStack p="$4" items="center">
        <Text color="$colorSubtle" fontSize="$3">
          No muscle data available
        </Text>
      </YStack>
    )
  }

  return (
    <YStack gap="$4" items="center" width="100%">
      {/* Toggle Buttons */}
      <XStack gap="$2" bg="$backgroundFocus" p="$1" rounded="$4">
        <Button
          size="$3"
          bg={side === 'front' ? '$primary' : 'transparent'}
          color={side === 'front' ? 'white' : '$colorSubtle'}
          onPress={() => setSide('front')}
          pressStyle={{ opacity: 0.8 }}
        >
          Front
        </Button>
        <Button
          size="$3"
          bg={side === 'back' ? '$primary' : 'transparent'}
          color={side === 'back' ? 'white' : '$colorSubtle'}
          onPress={() => setSide('back')}
          pressStyle={{ opacity: 0.8 }}
        >
          Back
        </Button>
      </XStack>

      {/* Body View */}
      <YStack items="center">
        <Body
          data={bodyParts}
          side={side}
          scale={scale}
          colors={HEAT_MAP_COLORS}
        />
      </YStack>

      {/* Legend - now shows intensity scale */}
      <XStack justify="center" gap="$3" flexWrap="wrap">
        <XStack items="center" gap="$1">
          <YStack
            width={12}
            height={12}
            style={{ borderRadius: 2 }}
            bg={HEAT_MAP_COLORS[1] as any}
          />
          <Text fontSize="$1" color="$colorSubtle">Low</Text>
        </XStack>
        <XStack items="center" gap="$1">
          <YStack
            width={12}
            height={12}
            style={{ borderRadius: 2 }}
            bg={HEAT_MAP_COLORS[3] as any}
          />
          <Text fontSize="$1" color="$colorSubtle">Med</Text>
        </XStack>
        <XStack items="center" gap="$1">
          <YStack
            width={12}
            height={12}
            style={{ borderRadius: 2 }}
            bg={HEAT_MAP_COLORS[5] as any}
          />
          <Text fontSize="$1" color="$colorSubtle">High</Text>
        </XStack>
      </XStack>
    </YStack>
  )
})
