import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, I18nManager, Pressable, useWindowDimensions, View } from 'react-native'
import { LineChart, yAxisSides } from 'react-native-gifted-charts'
import Svg, { Line } from 'react-native-svg'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { ActionMenu } from './ui/ActionMenu'
import { Button, UiText } from './ui/Controls'
import { useCadenceColors } from './ui/useCadenceColors'
import { ChevronRight } from './ui/icons'
import { useExerciseProgression } from '../features/exercises'
import type { WidgetConfig } from '../stores/widgetStore'
import { getMetricLabel, getMetricUnit } from '../stores/widgetStore'

interface ProgressionWidgetProps {
  config: Pick<WidgetConfig, 'exerciseId' | 'exerciseName' | 'metric'>
  preview?: boolean
  onOpen?: () => void
  detail?: boolean
  onManage?: () => void
  onRemove?: () => void
}

const Y_AXIS_LABEL_WIDTH = 44
const PLOT_INSET = 8
const RANGES = ['1M', '3M', '6M', 'All'] as const

function showYearWidth(firstDate?: string, lastDate?: string) {
  return firstDate && lastDate && firstDate.slice(0, 4) !== lastDate.slice(0, 4) ? 100 : 65
}

function formatProgressionDate(date: string, year = false): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
  })
}

export function ProgressionWidget({
  config,
  preview = false,
  onOpen,
  detail = false,
  onManage,
  onRemove,
}: ProgressionWidgetProps) {
  const { data, isLoading, error, refetch } = useExerciseProgression(
    config.exerciseId,
    config.exerciseName
  )
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const colors = useCadenceColors()
  const [width, setWidth] = useState(0)
  const [pressed, setPressed] = useState(false)
  const [range, setRange] = useState<'1M' | '3M' | '6M' | 'All'>('3M')
  const [rangeWidth, setRangeWidth] = useState(0)
  const selectedIndex = useSharedValue(1)
  const rangeButtonWidth = Math.max(0, (rangeWidth - 8) / RANGES.length)
  const isRTL = I18nManager.isRTL
  useEffect(() => {
    selectedIndex.value = withTiming(RANGES.indexOf(range), {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    })
  }, [range, selectedIndex])
  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: (isRTL ? -selectedIndex.value : selectedIndex.value) * rangeButtonWidth,
      },
    ],
  }))
  const { fontScale } = useWindowDimensions()
  const chartScale = Math.max(1, fontScale)
  const yAxisLabelWidth = Y_AXIS_LABEL_WIDTH * chartScale
  const points =
    config.metric === 'oneRm'
      ? data?.oneRmProgression
      : config.metric === 'volume'
        ? data?.volumeProgression
        : data?.maxWeightProgression
  const domain = progressionDomain(points ?? [], range)
  const visiblePoints = detail ? filterProgression(points ?? [], range) : (points ?? [])
  const chartData = visiblePoints.map((point, index) => ({
    value: point.value,
    label: '',
    ...(detail && index < visiblePoints.length - 1 ? { spacing: 0 } : {}),
  }))
  const hasDecimalValues = chartData.some((point) => !Number.isInteger(point.value))
  const sections = detail ? 4 : 2
  const axisUnit = 5
  const minimum = chartData.length ? Math.min(...chartData.map((point) => point.value)) : 0
  const maximum = chartData.length ? Math.max(...chartData.map((point) => point.value)) : 0
  const padding = Math.max((maximum - minimum) * 0.1, maximum * 0.05, axisUnit)
  const axisStart = Math.max(0, Math.floor((minimum - padding) / axisUnit) * axisUnit)
  const axisStep = Math.ceil((maximum + padding - axisStart) / sections / axisUnit) * axisUnit
  const value =
    detail && visiblePoints.length
      ? Math.max(...visiblePoints.map((point) => point.value))
      : detail
        ? undefined
        : data?.personalRecords[config.metric]
  const noHistory = error === 'No exercise data available'
  const chartWidth = Math.max(0, width - yAxisLabelWidth - PLOT_INSET)
  const firstDate = detail ? domain.start : visiblePoints[0]?.date
  const lastDate = detail ? domain.end : visiblePoints[visiblePoints.length - 1]?.date
  const dayCount =
    firstDate && lastDate
      ? Math.max(1, (Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000)
      : 1
  const tickCount =
    firstDate === lastDate
      ? 1
      : Math.min(
          dayCount + 1,
          5,
          Math.max(2, Math.floor(chartWidth / (showYearWidth(firstDate, lastDate) * chartScale)))
        )
  const dateTicks =
    detail && firstDate && lastDate && chartWidth > 0
      ? Array.from({ length: tickCount }, (_, index) => {
          const day = firstDate === lastDate ? 0 : Math.round((dayCount * index) / (tickCount - 1))
          return {
            date: new Date(Date.parse(firstDate) + day * 86_400_000).toISOString().slice(0, 10),
            x:
              firstDate === lastDate
                ? chartWidth / 2
                : PLOT_INSET + (day / dayCount) * Math.max(0, chartWidth - PLOT_INSET * 2),
          }
        })
      : []
  const showYear = !!firstDate && !!lastDate && firstDate.slice(0, 4) !== lastDate.slice(0, 4)
  if (detail && chartData.length > 1 && firstDate && lastDate) {
    const span = Date.parse(lastDate) - Date.parse(firstDate)
    chartData.forEach((point, index) => {
      if (index < chartData.length - 1)
        point.spacing = span
          ? ((Date.parse(visiblePoints[index + 1].date) - Date.parse(visiblePoints[index].date)) /
              span) *
            Math.max(0, chartWidth - PLOT_INSET * 2)
          : 0
    })
  }
  const initialSpacing =
    detail && firstDate && lastDate && visiblePoints[0]
      ? PLOT_INSET +
        (Date.parse(firstDate) === Date.parse(lastDate)
          ? 0.5
          : (Date.parse(visiblePoints[0].date) - Date.parse(firstDate)) /
            (Date.parse(lastDate) - Date.parse(firstDate))) *
          Math.max(0, chartWidth - PLOT_INSET * 2)
      : chartData.length === 1
        ? chartWidth / 2
        : PLOT_INSET
  const dateRangeLabel =
    firstDate && lastDate
      ? `Trend from ${formatProgressionDate(firstDate, showYear)} to ${formatProgressionDate(lastDate, showYear)}`
      : undefined

  return (
    <View className="w-full gap-field">
      <View
        className={`w-full gap-compact rounded-card border border-divider p-field ${pressed ? 'bg-raised' : 'bg-surface'}`}
      >
        <View className="flex-row items-start justify-between gap-field">
          <Pressable
            className="min-h-touch min-w-0 flex-1 flex-row items-center gap-compact"
            disabled={!onOpen || preview}
            accessibilityRole={onOpen && !preview ? 'button' : undefined}
            accessibilityLabel={
              onOpen && !preview
                ? `Open ${config.exerciseName} ${getMetricLabel(config.metric)} progress`
                : undefined
            }
            onPress={onOpen}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
          >
            <View className="min-w-0 flex-1 gap-compact">
              <UiText textRole="bodyEmphasis" accessibilityRole="header">
                {data?.exerciseName ?? config.exerciseName}
              </UiText>
              <UiText textRole="meta">{getMetricLabel(config.metric)}</UiText>
            </View>
            {onOpen && !preview && <ChevronRight size={18} color={colors.muted} aria-hidden />}
          </Pressable>
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

        {detail && (
          <View
            className="flex-row rounded-control bg-raised p-1"
            accessibilityRole="radiogroup"
            accessibilityLabel="Progress period"
            onLayout={(event) => setRangeWidth(event.nativeEvent.layout.width)}
          >
            {rangeWidth > 0 && (
              <Animated.View
                testID="progress-range-highlight"
                pointerEvents="none"
                accessible={false}
                className="absolute rounded-control bg-accent"
                style={[{ start: 4, top: 4, bottom: 4, width: rangeButtonWidth }, highlightStyle]}
              />
            )}
            {RANGES.map((period) => (
              <Pressable
                key={period}
                className="h-8 min-w-0 flex-1 items-center justify-center rounded-control"
                hitSlop={{ top: 6, bottom: 6 }}
                accessibilityRole="radio"
                accessibilityState={{ checked: range === period }}
                onPress={() => setRange(period)}
              >
                <UiText textRole={range === period ? 'captionOnAccent' : 'caption'}>
                  {period}
                </UiText>
              </Pressable>
            ))}
          </View>
        )}
        {detail && value !== undefined && (
          <UiText textRole="caption">Best in selected period</UiText>
        )}
        {value !== undefined && (
          <View className="flex-row items-baseline gap-compact">
            <UiText textRole="bodyEmphasis">{value.toLocaleString()}</UiText>
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
          <Pressable
            className="w-full gap-compact"
            disabled={!onOpen || preview}
            accessible
            accessibilityRole={onOpen && !preview ? 'button' : undefined}
            accessibilityLabel={
              onOpen && !preview
                ? `Open ${config.exerciseName} ${getMetricLabel(config.metric)} progress, ${dateRangeLabel ?? 'chart'}`
                : dateRangeLabel
            }
            onPress={onOpen && !preview ? onOpen : undefined}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
          >
            <View className="w-full" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
              {detail && dateTicks.length > 0 && (
                <Svg
                  pointerEvents="none"
                  style={{ position: 'absolute', top: 10, left: 0 }}
                  width={chartWidth}
                  height={160 * chartScale}
                >
                  {dateTicks.map((tick) => (
                    <Line
                      key={tick.date}
                      x1={tick.x}
                      x2={tick.x}
                      y1={0}
                      y2={160 * chartScale}
                      stroke={colors.divider}
                      strokeWidth={1}
                      strokeDasharray="2,4"
                    />
                  ))}
                </Svg>
              )}
              {chartWidth > 0 && (
                <LineChart
                  data={chartData}
                  isAnimated={!preview && !reduceMotion}
                  animationDuration={650}
                  width={chartWidth}
                  height={(detail ? 160 : 48) * chartScale}
                  color={colors.accent}
                  thickness={2}
                  dataPointsColor={colors.accent}
                  dataPointsRadius={3}
                  spacing={
                    chartData.length > 1
                      ? Math.max(0, chartWidth - PLOT_INSET * 2) / (chartData.length - 1)
                      : 0
                  }
                  yAxisSide={yAxisSides.RIGHT}
                  yAxisLabelWidth={yAxisLabelWidth}
                  yAxisLabelContainerStyle={{
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    paddingRight: PLOT_INSET,
                  }}
                  yAxisThickness={0}
                  noOfSections={sections}
                  yAxisOffset={axisStart}
                  stepValue={axisStep}
                  maxValue={axisStep * sections}
                  showFractionalValues={hasDecimalValues}
                  roundToDigits={hasDecimalValues ? 1 : 0}
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
                      maximumFractionDigits: hasDecimalValues ? 1 : 0,
                    })
                  }
                  rulesColor={colors.divider}
                  rulesLength={chartWidth}
                  xAxisLength={chartWidth}
                  disableScroll
                  xAxisColor={colors.divider}
                  yAxisColor="transparent"
                  backgroundColor="transparent"
                  initialSpacing={initialSpacing}
                  endSpacing={PLOT_INSET}
                />
              )}
            </View>
            {detail && dateTicks.length > 0 ? (
              <View style={{ width: chartWidth, height: 20 }}>
                {dateTicks.map((tick) => {
                  const labelWidth = Math.min(
                    chartWidth,
                    showYearWidth(firstDate, lastDate) * chartScale
                  )
                  return (
                    <View
                      key={tick.date}
                      style={{
                        position: 'absolute',
                        left: Math.max(
                          0,
                          Math.min(chartWidth - labelWidth, tick.x - labelWidth / 2)
                        ),
                        width: labelWidth,
                        alignItems:
                          tick.x < labelWidth / 2
                            ? 'flex-start'
                            : tick.x > chartWidth - labelWidth / 2
                              ? 'flex-end'
                              : 'center',
                      }}
                    >
                      <UiText textRole="meta">{formatProgressionDate(tick.date, showYear)}</UiText>
                    </View>
                  )
                })}
              </View>
            ) : (
              <View
                className={`flex-row gap-field ${firstDate === lastDate ? 'justify-center' : 'justify-between'}`}
                style={{ paddingLeft: PLOT_INSET, paddingRight: yAxisLabelWidth + PLOT_INSET }}
              >
                {firstDate && (
                  <UiText textRole="meta">{formatProgressionDate(firstDate, showYear)}</UiText>
                )}
                {lastDate && lastDate !== firstDate && (
                  <UiText textRole="meta">{formatProgressionDate(lastDate, showYear)}</UiText>
                )}
              </View>
            )}
          </Pressable>
        )}

        {detail && firstDate && lastDate && chartData.length === 0 && (
          <UiText textRole="meta">
            {formatProgressionDate(firstDate, showYear)} –{' '}
            {formatProgressionDate(lastDate, showYear)}
          </UiText>
        )}
        {!isLoading && (noHistory || (data && chartData.length === 0)) && (
          <UiText textRole="caption">
            {detail && data
              ? 'No progress recorded in this period.'
              : 'No recorded progress yet. Complete a workout with this exercise to see your trend.'}
          </UiText>
        )}
      </View>
      {detail && data && (
        <View className="gap-compact rounded-card border border-divider bg-surface p-field">
          <UiText textRole="bodyEmphasis" accessibilityRole="header">
            Workout records
          </UiText>
          {[...visiblePoints]
            .reverse()
            .filter((point) => point.workoutRecord)
            .map((point, index) => (
              <Pressable
                key={`${point.workoutRecord?.id}-${index}`}
                className="min-h-touch flex-row items-center justify-between gap-field rounded-control px-compact py-compact active:bg-raised"
                accessibilityRole="button"
                accessibilityLabel={`${point.workoutRecord?.name}, ${formatProgressionDate(point.date, true)}, ${point.value} ${getMetricUnit(config.metric)}`}
                onPress={() =>
                  point.workoutRecord &&
                  router.push({
                    pathname: '/(tabs)/(history)/record/[id]',
                    params: { id: point.workoutRecord.id },
                  })
                }
              >
                <View className="min-w-0 flex-1">
                  <UiText textRole="body">{point.workoutRecord?.name}</UiText>
                  <UiText textRole="meta">{formatProgressionDate(point.date, true)}</UiText>
                </View>
                <UiText textRole="bodyEmphasis">
                  {point.value.toLocaleString()} {getMetricUnit(config.metric)}
                </UiText>
                <ChevronRight size={18} color={colors.muted} aria-hidden />
              </Pressable>
            ))}
          {!visiblePoints.some((point) => point.workoutRecord) && (
            <UiText textRole="caption">No linked workout records available for this period.</UiText>
          )}
        </View>
      )}
    </View>
  )
}

type ProgressionRange = '1M' | '3M' | '6M' | 'All'

export function progressionDomain(
  points: { date: string }[],
  range: ProgressionRange,
  now = new Date()
) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const key = (date: Date) => date.toISOString().slice(0, 10)
  if (range === 'All') return { start: points[0]?.date, end: points[points.length - 1]?.date }
  const months = range === '1M' ? 1 : range === '3M' ? 3 : 6
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1))
  start.setUTCDate(
    Math.min(
      end.getUTCDate(),
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
    )
  )
  return { start: key(start), end: key(end) }
}

export function filterProgression<T extends { date: string }>(
  points: T[],
  range: ProgressionRange,
  now = new Date()
): T[] {
  const { start, end } = progressionDomain(points, range, now)
  return start && end ? points.filter((point) => point.date >= start && point.date <= end) : []
}

export default ProgressionWidget
