import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import {
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  progressViewStyle,
  strokeBorder,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'
import { emptyTodayPlan, type TodayPlanProps } from './todayPlan'

const TodayPlan = (props: TodayPlanProps, environment: WidgetEnvironment) => {
  'widget'
  const colors = environment.colorScheme === 'dark' ? props.appearance.dark : props.appearance.light
  const isEmpty = props.kind === 'empty'
  const isRest = props.kind === 'rest'
  const cycle = props.cycle
  const isSmall = environment.widgetFamily === 'systemSmall'
  return (
    <HStack
      spacing={0}
      modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background(colors.paper),
        clipShape('roundedRectangle', 21),
        strokeBorder({
          content: colors.border,
          shape: 'roundedRectangle',
          cornerRadius: 21,
          style: { lineWidth: isEmpty ? 1.5 : 0, dash: isEmpty ? [3, 3] : [] },
        }),
        containerBackground(colors.paper, 'widget'),
        widgetURL(props.url),
      ]}
    >
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[
          padding({ leading: isSmall ? 12 : 18, trailing: isSmall ? 8 : 12, top: 16, bottom: 14 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 10, weight: 'medium' }),
            foregroundStyle(colors.muted),
            lineLimit(1),
          ]}
        >
          {props.dateLabel}
        </Text>
        <Text
          modifiers={[
            font({ size: isSmall ? 22 : props.title.length > 8 ? 24 : 42, weight: 'heavy' }),
            foregroundStyle(colors.ink),
            lineLimit(2),
            minimumScaleFactor(0.75),
            padding({ top: 10 }),
          ]}
        >
          {props.title}
        </Text>
        <Text
          modifiers={[
            font({ size: 11 }),
            foregroundStyle(colors.muted),
            lineLimit(1),
            padding({ top: 3 }),
          ]}
        >
          {props.detail}
        </Text>
        <Spacer minLength={6} />
        <HStack spacing={isSmall ? 4 : 8}>
          <Text
            modifiers={[
              font({ size: isSmall ? 10 : 11, weight: 'semibold' }),
              foregroundStyle(colors.accent),
              lineLimit(1),
              minimumScaleFactor(0.8),
            ]}
          >
            {props.actionLabel}
          </Text>
          <Image
            systemName={isEmpty ? 'plus' : 'chevron.right'}
            size={10}
            color={colors.paper}
            modifiers={[
              frame({ width: 22, height: 22 }),
              background(colors.accent),
              clipShape('circle'),
            ]}
          />
        </HStack>
      </VStack>
      <VStack
        spacing={0}
        modifiers={[
          padding({ horizontal: 8, vertical: 16 }),
          frame({ width: isSmall ? 56 : 84 }),
          frame({ maxHeight: Infinity }),
          background(colors.panel),
        ]}
      >
        <Image
          systemName={isEmpty ? 'plus.app' : isRest ? 'moon.stars' : 'dumbbell.fill'}
          size={20}
          color={colors.accent}
        />
        <Spacer minLength={6} />
        {cycle ? (
          <VStack spacing={0}>
            <Text modifiers={[font({ size: 10 }), foregroundStyle(colors.muted)]}>Day</Text>
            <Text
              modifiers={[
                font({ size: 42, weight: 'heavy' }),
                foregroundStyle(colors.ink),
                lineLimit(1),
                minimumScaleFactor(0.6),
              ]}
            >
              {String(cycle.current)}
            </Text>
            <Text
              modifiers={[font({ size: 10 }), foregroundStyle(colors.muted), lineLimit(1)]}
            >{`of ${cycle.total}`}</Text>
          </VStack>
        ) : props.progress ? (
          <Text
            modifiers={[
              font({ size: 10 }),
              foregroundStyle(colors.muted),
              lineLimit(5),
              minimumScaleFactor(0.8),
            ]}
          >
            {props.progress.label}
          </Text>
        ) : null}
        <Spacer minLength={6} />
        {cycle && cycle.total <= (isSmall ? 5 : 7) ? (
          <HStack spacing={4}>
            {Array.from({ length: cycle.total }, (_, index) => (
              <Text
                key={index}
                modifiers={[
                  frame({ width: 5, height: 5 }),
                  background(index + 1 === cycle.current ? colors.accent : `${colors.accent}33`),
                  clipShape('circle'),
                ]}
              >
                {''}
              </Text>
            ))}
          </HStack>
        ) : props.progress?.value != null ? (
          <ProgressView
            value={props.progress.value}
            modifiers={[
              progressViewStyle('linear'),
              tint(colors.accent),
              frame({ width: isSmall ? 32 : 48, height: 4 }),
            ]}
          />
        ) : null}
      </VStack>
    </HStack>
  )
}

export default createWidget('TodayPlan', TodayPlan, emptyTodayPlan)
