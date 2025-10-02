import React, { useMemo } from 'react'
import { Card, YStack, XStack, Text, Button, Spinner, useTheme } from 'tamagui'
import { LineChart } from 'react-native-gifted-charts'
import { TrendingUp, TrendingDown, Trash2, Target, BarChart3 } from '@tamagui/lucide-icons'
import { useExerciseProgression } from '../hooks/useExerciseProgression'
import type { WidgetConfig, ProgressionMetric } from '../stores/widgetStore'
import { getMetricLabel, getMetricUnit } from '../stores/widgetStore'

interface ProgressionWidgetProps {
  config: WidgetConfig
  onRemove?: (widgetId: string) => void
}

const MetricIcon = ({ metric }: { metric: ProgressionMetric }) => {
  switch (metric) {
    case 'oneRm':
      return <Target size={16} />
    case 'volume':
      return <BarChart3 size={16} />
    case 'maxWeight':
      return <TrendingUp size={16} />
    default:
      return <TrendingUp size={16} />
  }
}

export function ProgressionWidget({ config, onRemove }: ProgressionWidgetProps) {
  const { data, isLoading, error } = useExerciseProgression(config.exerciseId)
  const theme = useTheme()

  const primaryColor = theme.blue9?.val ?? '#6366f1'
  const mutedColor = theme.color11?.val ?? '#64748b'
  const prColor = theme.green10?.val ?? '#22c55e'

  const progressionData = useMemo(() => {
    if (!data) return []
    if (config.metric === 'oneRm') return data.oneRmProgression
    if (config.metric === 'volume') return data.volumeProgression
    return data.maxWeightProgression
  }, [data, config.metric])

  const chartData = useMemo(() => {
    return progressionData.map((point, index) => ({
      value: point.value,
      label: `${index + 1}`,
      ...(point.isPersonalRecord && { dataPointColor: prColor, dataPointRadius: 6 }),
    }))
  }, [progressionData, prColor])

  const currentValue = useMemo(() => {
    if (!data || !data.personalRecords) return undefined
    switch (config.metric) {
      case 'oneRm':
        return data.personalRecords.oneRm
      case 'volume':
        return data.personalRecords.volume
      case 'maxWeight':
        return data.personalRecords.maxWeight
      default:
        return undefined
    }
  }, [data, config.metric])

  const trendUp = useMemo(() => {
    if (chartData.length < 2) return undefined
    const first = chartData[0].value
    const last = chartData[chartData.length - 1].value
    if (last > first) return true
    if (last < first) return false
    return undefined
  }, [chartData])

  const handleRemove = () => {
    onRemove?.(config.id)
  }

  if (!config.isVisible) return null

  return (
    <Card p="$4" mb="$3" bg="$background" borderColor="$borderColor" borderWidth={1}>
      <XStack items="center" justify="space-between" mb="$3">
        <XStack items="center" flex={1} gap="$2">
          <MetricIcon metric={config.metric} />
          <YStack>
            <Text fontSize="$4" fontWeight="700">
              {getMetricLabel(config.metric)}
            </Text>
            <Text fontSize="$2" color="$color11">
              {data?.exerciseName ?? config.exerciseName}
            </Text>
          </YStack>
        </XStack>

        {onRemove && (
          <Button size="$2" onPress={handleRemove} p="$2" chromeless>
            <Trash2 size={16} />
          </Button>
        )}
      </XStack>

      {isLoading && (
        <YStack items="center" p="$4">
          <Spinner size="small" color="$blue9" />
          <Text fontSize="$2" color="$color11" mt="$2">
            Loading progression data...
          </Text>
        </YStack>
      )}

      {error && !isLoading && (
        <YStack items="center" p="$4">
          <Text fontSize="$3" color="$red10">
            {error}
          </Text>
        </YStack>
      )}

      {data && chartData.length > 0 && (
        <YStack gap="$3">
          {currentValue !== undefined && (
            <XStack items="center" justify="center" gap="$2">
              <Text fontSize="$7" fontWeight="800" color="$color12">
                {currentValue}
              </Text>
              <Text fontSize="$4" color="$color11">
                {getMetricUnit(config.metric)}
              </Text>
              <Text fontSize="$2" color="$color11">
                PR
              </Text>
            </XStack>
          )}

          <YStack items="center" py="$2">
            <LineChart
              data={chartData}
              width={280}
              height={120}
              color={primaryColor}
              thickness={2}
              dataPointsColor={primaryColor}
              dataPointsRadius={4}
              spacing={Math.max(20, 260 / Math.max(chartData.length - 1, 1))}
              hideYAxisText
              xAxisLabelTextStyle={{ fontSize: 10, color: mutedColor as string }}
              showVerticalLines={false}
              showYAxisIndices={false}
              hideRules
              backgroundColor="transparent"
              curved
              animateOnDataChange
              animationDuration={800}
              initialSpacing={10}
              endSpacing={10}
            />
          </YStack>

          <YStack items="center" gap="$2">
            <Text fontSize="$2" color="$color11">
              {chartData.length} Sessions
            </Text>
            <XStack items="center" gap="$2">
              {trendUp === true ? (
                <>
                  <TrendingUp size={14} />
                  <Text fontSize="$3" fontWeight="600" color="$green10">
                    Up
                  </Text>
                </>
              ) : trendUp === false ? (
                <>
                  <TrendingDown size={14} />
                  <Text fontSize="$3" fontWeight="600" color="$color11">
                    Down
                  </Text>
                </>
              ) : (
                <Text fontSize="$3" fontWeight="600" color="$color11">
                  Flat
                </Text>
              )}
            </XStack>

            {data.lastWorkout && (
              <Text fontSize="$2" color="$color11">
                Last workout: {new Date(data.lastWorkout.createdAt).toLocaleDateString()}
              </Text>
            )}
          </YStack>
        </YStack>
      )}

      {data && chartData.length === 0 && !isLoading && !error && (
        <YStack items="center" p="$4">
          <Text fontSize="$3" color="$color11">
            No progression data available for {config.exerciseName}
          </Text>
          <Text fontSize="$2" color="$color11" mt="$1">
            Complete some workouts to see your progress!
          </Text>
        </YStack>
      )}
    </Card>
  )
}

export default ProgressionWidget
