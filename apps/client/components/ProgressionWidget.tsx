import { useState } from 'react'
import { ActivityIndicator, useWindowDimensions, View } from 'react-native'
import { LineChart } from 'react-native-gifted-charts'
import { ActionMenu } from './ui/ActionMenu'
import { Button, UiText } from './ui/Controls'
import { useCadenceColors } from './ui/useCadenceColors'
import { useExerciseProgression } from '../features/exercises'
import type { WidgetConfig } from '../stores/widgetStore'
import { getMetricLabel, getMetricUnit } from '../stores/widgetStore'

interface ProgressionWidgetProps {
  config: Pick<WidgetConfig, 'exerciseId' | 'exerciseName' | 'metric'>
  preview?: boolean
  onManage?: () => void
  onRemove?: () => void
}

const Y_AXIS_LABEL_WIDTH = 44
const PLOT_INSET = 8

function formatProgressionDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  })
}

export function ProgressionWidget({
  config,
  preview = false,
  onManage,
  onRemove,
}: ProgressionWidgetProps) {
  const { data, isLoading, error, refetch } = useExerciseProgression(
    config.exerciseId,
    config.exerciseName
  )
  const colors = useCadenceColors()
  const [width, setWidth] = useState(0)
  const { fontScale } = useWindowDimensions()
  const chartScale = Math.max(1, fontScale)
  const yAxisLabelWidth = Y_AXIS_LABEL_WIDTH * chartScale
  const points =
    config.metric === 'oneRm'
      ? data?.oneRmProgression
      : config.metric === 'volume'
        ? data?.volumeProgression
        : data?.maxWeightProgression
  const chartData = (points ?? []).map((point) => ({ value: point.value, label: '' }))
  const value = data?.personalRecords[config.metric]
  const noHistory = error === 'No exercise data available'
  const chartWidth = Math.max(0, width - yAxisLabelWidth - PLOT_INSET)
  const firstDate = points?.[0]?.date
  const lastDate = points?.[points.length - 1]?.date
  const dateRangeLabel =
    firstDate && lastDate
      ? `Trend from ${formatProgressionDate(firstDate)} to ${formatProgressionDate(lastDate)}`
      : undefined

  return (
    <View className="w-full gap-field rounded-card border border-divider bg-surface p-card">
      <View className="flex-row items-start justify-between gap-field">
        <View className="min-w-0 flex-1 gap-compact">
          <UiText textRole="bodyEmphasis" accessibilityRole="header">
            {data?.exerciseName ?? config.exerciseName}
          </UiText>
          <UiText textRole="meta">{getMetricLabel(config.metric)}</UiText>
        </View>
        {!preview && (onManage || onRemove) && (
          <ActionMenu
            label={`Actions for ${config.exerciseName} progression widget`}
            actions={[
              ...(onManage ? [{ label: 'Manage widgets', onPress: onManage }] : []),
              ...(onRemove
                ? [{ label: 'Remove widget', destructive: true, onPress: onRemove }]
                : []),
            ]}
          />
        )}
      </View>

      {value !== undefined && (
        <View className="flex-row items-baseline gap-compact">
          <UiText textRole="cardTitle" className="text-metric">
            {value.toLocaleString()}
          </UiText>
          <UiText textRole="meta">{getMetricUnit(config.metric)}</UiText>
        </View>
      )}

      {isLoading && (
        <View className="items-center gap-compact py-field">
          <ActivityIndicator size="small" color={colors.accent} />
          <UiText textRole="caption">Loading progression...</UiText>
        </View>
      )}

      {error && !noHistory && !isLoading && (
        <View className="gap-compact">
          <UiText textRole="captionDestructive" selectable>
            {error}
          </UiText>
          <Button variant="ghost" className="justify-start px-0" onPress={() => void refetch()}>
            <UiText textRole="captionEmphasis">Retry</UiText>
          </Button>
        </View>
      )}

      {chartData.length > 0 && (
        <View className="w-full gap-compact" accessible accessibilityLabel={dateRangeLabel}>
          <View className="w-full" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
            {chartWidth > 0 && (
              <LineChart
                data={chartData}
                width={chartWidth}
                height={100 * chartScale}
                color={colors.accent}
                thickness={2}
                dataPointsColor={colors.accent}
                dataPointsRadius={3}
                spacing={
                  chartData.length > 1
                    ? Math.max(0, chartWidth - PLOT_INSET * 2) / (chartData.length - 1)
                    : 0
                }
                yAxisLabelWidth={yAxisLabelWidth}
                yAxisLabelContainerStyle={{
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingRight: PLOT_INSET,
                }}
                yAxisThickness={0}
                noOfSections={4}
                showFractionalValues
                roundToDigits={1}
                yAxisTextStyle={{
                  color: colors.muted,
                  fontSize: 10,
                  lineHeight: 14,
                  width: '100%',
                  textAlign: 'right',
                  includeFontPadding: false,
                  fontVariant: ['tabular-nums'],
                }}
                formatYLabel={(label) =>
                  Number(label).toLocaleString('en-US', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  })
                }
                rulesColor={colors.divider}
                rulesLength={chartWidth}
                xAxisLength={chartWidth}
                disableScroll
                xAxisColor={colors.divider}
                yAxisColor="transparent"
                backgroundColor="transparent"
                initialSpacing={chartData.length === 1 ? chartWidth / 2 : PLOT_INSET}
                endSpacing={chartData.length === 1 ? chartWidth / 2 : PLOT_INSET}
              />
            )}
          </View>
          <View
            className={`flex-row gap-field ${firstDate === lastDate ? 'justify-center' : 'justify-between'}`}
            style={{ paddingLeft: yAxisLabelWidth, paddingRight: PLOT_INSET }}
          >
            {firstDate && <UiText textRole="meta">{formatProgressionDate(firstDate)}</UiText>}
            {lastDate && lastDate !== firstDate && (
              <UiText textRole="meta">{formatProgressionDate(lastDate)}</UiText>
            )}
          </View>
          {!preview && (
            <View className="flex-row flex-wrap justify-between gap-compact">
              <UiText textRole="meta">
                {chartData.length} {chartData.length === 1 ? 'session' : 'sessions'}
              </UiText>
              {lastDate && (
                <UiText textRole="meta">Last recorded {formatProgressionDate(lastDate)}</UiText>
              )}
            </View>
          )}
        </View>
      )}

      {!isLoading && (noHistory || (data && chartData.length === 0)) && (
        <UiText textRole="caption">
          No recorded progress yet. Complete a workout with this exercise to see your trend.
        </UiText>
      )}
    </View>
  )
}

export default ProgressionWidget
