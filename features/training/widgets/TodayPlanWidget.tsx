import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import {
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  strokeBorder,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'
import { emptyTodayPlan, type TodayPlanProps } from './todayPlan'

const TodayPlan = (props: TodayPlanProps, environment: WidgetEnvironment) => {
  'widget'
  const colors = environment.colorScheme === 'dark' ? props.appearance.dark : props.appearance.light
  const isEmpty = props.kind === 'empty'
  const isRest = props.kind === 'rest'
  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[
        padding({ horizontal: 14, vertical: 13 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
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
      <HStack modifiers={[frame({ height: 22 })]}>
        <Text modifiers={[font({ size: 10 }), foregroundStyle(colors.muted), lineLimit(1)]}>
          {props.dateLabel}
        </Text>
        <Spacer minLength={4} />
        <Image
          systemName={isEmpty ? 'plus.app' : isRest ? 'moon.stars' : 'dumbbell.fill'}
          size={isRest ? 25 : 23}
          color={colors.accent}
        />
      </HStack>
      <Text
        modifiers={[
          font({ size: 21, weight: 'bold' }),
          foregroundStyle(colors.ink),
          lineLimit(1),
          padding({ top: 2 }),
        ]}
      >
        {props.title}
      </Text>
      <Text
        modifiers={[
          font({ size: 10 }),
          foregroundStyle(colors.muted),
          lineLimit(1),
          padding({ top: 2 }),
        ]}
      >
        {props.detail}
      </Text>
      <Spacer minLength={4} />
      <HStack modifiers={[frame({ height: 21 })]}>
        <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(colors.accent)]}>
          {props.actionLabel}
        </Text>
        <Spacer minLength={4} />
        <Image
          systemName={isEmpty ? 'plus' : 'chevron.right'}
          size={12}
          color={isRest ? colors.accent : colors.paper}
          modifiers={[
            frame({ width: 21, height: 21 }),
            background(isRest ? colors.paper : colors.accent),
            clipShape('roundedRectangle', isEmpty ? 6 : 11),
          ]}
        />
      </HStack>
    </VStack>
  )
}

export default createWidget('TodayPlan', TodayPlan, emptyTodayPlan)
