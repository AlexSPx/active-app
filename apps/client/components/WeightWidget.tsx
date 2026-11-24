import { useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { LineChart, yAxisSides } from 'react-native-gifted-charts'
import { useReducedMotion } from 'react-native-reanimated'
import { ActionMenu } from './ui/ActionMenu'
import { Button, UiText } from './ui/Controls'
import { useCadenceColors } from './ui/useCadenceColors'
import { useSettingsStore } from '../features/settings/stores/settingsStore'
import { weightChartBounds } from '../features/settings/weightChart'

export function WeightWidget({
  onOpen,
  onManage,
  onRemove,
}: {
  onOpen?: () => void
  onManage?: () => void
  onRemove?: () => void
}) {
  const history = useSettingsStore((state) => state.weightHistory)
  const unit = useSettingsStore((state) => state.bodyWeightUnit)
  const colors = useCadenceColors()
  const [width, setWidth] = useState(0)
  const { fontScale } = useWindowDimensions()
  const scale = Math.max(1, fontScale)
  const axisWidth = 44 * scale
  const chartWidth = Math.max(0, width - axisWidth - 8)
  const reduceMotion = useReducedMotion()
  const points = history.map((entry) => ({
    value: Number((entry.weightKg * (unit === 'lb' ? 2.2046226218 : 1)).toFixed(1)),
  }))
  const latest = points[points.length - 1]
  const { min, span } = weightChartBounds(
    points.map((point) => point.value),
    unit
  )
  return (
    <View className="w-full gap-compact rounded-card border border-divider bg-surface p-field">
      <View className="flex-row items-start justify-between gap-field">
        <View className="min-w-0 flex-1 gap-compact">
          <UiText textRole="bodyEmphasis" accessibilityRole="header">
            Body weight
          </UiText>
          <UiText textRole="meta">Weight trend</UiText>
        </View>
        {(onManage || onRemove) && (
          <ActionMenu
            label="Actions for body weight widget"
            actions={[
              ...(onManage ? [{ label: 'Manage widgets', onPress: onManage }] : []),
              ...(onRemove
                ? [{ label: 'Remove widget', destructive: true, onPress: onRemove }]
                : []),
            ]}
          />
        )}
      </View>
      {latest ? (
        <>
          <View className="flex-row items-baseline gap-compact">
            <UiText textRole="bodyEmphasis">{latest.value}</UiText>
            <UiText textRole="meta">{unit}</UiText>
          </View>
          <View
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            accessibilityLabel={`Weight trend, ${points.length} entries, latest ${latest.value} ${unit}`}
          >
            {chartWidth > 0 && (
              <LineChart
                data={points}
                isAnimated={!reduceMotion}
                animationDuration={650}
                width={chartWidth}
                height={48 * scale}
                color={colors.accent}
                thickness={2}
                dataPointsColor={colors.accent}
                dataPointsRadius={3}
                spacing={points.length > 1 ? Math.max(0, chartWidth - 16) / (points.length - 1) : 0}
                initialSpacing={points.length === 1 ? chartWidth / 2 : 8}
                endSpacing={8}
                yAxisSide={yAxisSides.RIGHT}
                yAxisLabelWidth={axisWidth}
                yAxisLabelContainerStyle={{
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingRight: 8,
                }}
                yAxisTextStyle={{
                  color: colors.muted,
                  fontSize: 10,
                  lineHeight: 14,
                  width: '100%',
                  textAlign: 'right',
                  includeFontPadding: false,
                  fontVariant: ['tabular-nums'],
                }}
                yAxisThickness={0}
                yAxisOffset={min}
                maxValue={span}
                noOfSections={2}
                stepValue={span / 2}
                showFractionalValues={
                  !Number.isInteger(min) ||
                  !Number.isInteger(span / 2) ||
                  points.some((point) => !Number.isInteger(point.value))
                }
                roundToDigits={1}
                rulesColor={colors.divider}
                rulesLength={chartWidth}
                xAxisLength={chartWidth}
                xAxisColor={colors.divider}
                yAxisColor="transparent"
                backgroundColor="transparent"
                disableScroll
              />
            )}
          </View>
          <View className="flex-row justify-between">
            <UiText textRole="meta">
              {history[0]?.initial
                ? 'Previous measurement'
                : new Date(history[0].recordedAt).toLocaleDateString()}
            </UiText>
            {history.length > 1 && (
              <UiText textRole="meta">
                {new Date(history[history.length - 1].recordedAt).toLocaleDateString()}
              </UiText>
            )}
          </View>
        </>
      ) : (
        <UiText textRole="caption">No weight entries yet. Add a weigh-in to see your trend.</UiText>
      )}
      {onOpen && (
        <Button variant="ghost" className="self-start" onPress={onOpen}>
          <UiText textRole="captionEmphasis">Log weight and view history</UiText>
        </Button>
      )}
    </View>
  )
}
