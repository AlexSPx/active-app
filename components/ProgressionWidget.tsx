import React, { useState } from 'react'
import {
  Card,
  YStack,
  XStack,
  Text,
  Button,
  Spinner,
  useTheme,
  getTokenValue,
  getConfig,
  getVariableValue,
} from 'tamagui'
import { LineChart } from 'react-native-gifted-charts'
import { useExerciseProgression } from '../features/exercises'
import type { WidgetConfig } from '../stores/widgetStore'
import { getMetricLabel, getMetricUnit } from '../stores/widgetStore'

interface ProgressionWidgetProps {
  config: Pick<WidgetConfig, 'exerciseId' | 'exerciseName' | 'metric'>
  preview?: boolean
}

export function ProgressionWidget({ config, preview = false }: ProgressionWidgetProps) {
  const { data, isLoading, error, refetch } = useExerciseProgression(config.exerciseId)
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const points =
    config.metric === 'oneRm'
      ? data?.oneRmProgression
      : config.metric === 'volume'
        ? data?.volumeProgression
        : data?.maxWeightProgression
  const chartData = (points ?? []).map((point) => ({
    value: point.value,
    label: new Date(`${point.date}T12:00:00`).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
    }),
  }))
  const value = data?.personalRecords[config.metric]
  const noHistory = error === 'No exercise data available'
  const inset = getTokenValue('$field', 'space')
  const chartWidth = Math.max(0, width - inset * 2)

  return (
    <Card
      p="$field"
      bg="$surface"
      borderColor="$borderColor"
      borderWidth={1}
      rounded={preview ? '$menu' : '$card'}
      gap="$field"
    >
      <XStack items="center" justify="space-between" gap="$field">
        <YStack flex={1} gap="$compact">
          <Text fontSize="$exerciseTitle" lineHeight="$exerciseTitle" fontWeight="600">
            {data?.exerciseName ?? config.exerciseName}
          </Text>
          <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {getMetricLabel(config.metric)}
          </Text>
        </YStack>
        {value !== undefined && (
          <XStack items="baseline" gap="$compact">
            <Text fontSize="$metric" lineHeight="$metric" fontWeight="600">
              {value.toLocaleString()}
            </Text>
            <Text fontSize="$caption" color="$colorSubtle">
              {getMetricUnit(config.metric)}
            </Text>
          </XStack>
        )}
      </XStack>
      {isLoading && (
        <YStack items="center" gap="$compact" py="$field">
          <Spinner size="small" color="$primary" />
          <Text fontSize="$caption" color="$colorSubtle">
            Loading progression...
          </Text>
        </YStack>
      )}
      {error && !noHistory && !isLoading && (
        <YStack gap="$compact">
          <Text fontSize="$caption" color="$destructive">
            {error}
          </Text>
          <Button chromeless minH="$touch" onPress={() => void refetch()}>
            <Text color="$primary">Retry</Text>
          </Button>
        </YStack>
      )}
      {chartData.length > 0 && (
        <YStack onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {chartWidth > 0 && (
            <LineChart
              data={chartData}
              width={chartWidth}
              height={getTokenValue('$day', 'size')}
              color={theme.primary.val}
              thickness={getTokenValue('$0.5', 'space')}
              dataPointsColor={theme.primary.val}
              dataPointsRadius={getTokenValue('$compact', 'space')}
              spacing={Math.max(
                getTokenValue('$touch', 'size'),
                chartWidth / Math.max(chartData.length - 1, 1)
              )}
              hideYAxisText
              xAxisLabelTextStyle={{
                fontSize: getVariableValue(getConfig().fonts.body.size.caption),
                color: theme.colorSubtle.val,
              }}
              hideRules
              xAxisColor={theme.borderColor.val}
              yAxisColor={theme.backgroundTransparent.val}
              backgroundColor={theme.surface.val}
              initialSpacing={inset}
              endSpacing={inset}
            />
          )}
          {!preview && (
            <XStack justify="space-between" gap="$field" flexWrap="wrap" mt="$compact">
              <Text fontSize="$1" color="$colorSubtle">
                {chartData.length} {chartData.length === 1 ? 'session' : 'sessions'}
              </Text>
              {data?.lastWorkout && (
                <Text fontSize="$1" color="$colorSubtle">
                  Last recorded{' '}
                  {new Date(data.lastWorkout.createdAt).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              )}
            </XStack>
          )}
        </YStack>
      )}
      {!isLoading && (noHistory || (data && chartData.length === 0)) && (
        <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          No recorded progress yet. Complete a workout with this exercise to see your trend.
        </Text>
      )}
    </Card>
  )
}

export default ProgressionWidget
