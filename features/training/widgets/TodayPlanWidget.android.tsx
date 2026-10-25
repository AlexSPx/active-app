import { Box, Button, Column, Image, Text } from '@expo/ui/jetpack-compose'
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  size,
} from '@expo/ui/jetpack-compose/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'
import { emptyTodayPlan, type TodayPlanProps } from './todayPlan'

const TodayPlan = (props: TodayPlanProps, environment: WidgetEnvironment) => {
  'widget'
  const theme = environment.colorScheme === 'dark' ? 'dark' : 'light'
  const colors = props.appearance[theme]
  const isEmpty = props.kind === 'empty'
  const isRest = props.kind === 'rest'
  return (
    <Box modifiers={[fillMaxSize()]}>
      <Image
        source={{ uri: `widget_${props.kind}_${theme}` }}
        contentScale="fillBounds"
        contentDescription={null}
        modifiers={[fillMaxSize()]}
      />
      <Button
        {...{ target: props.url }}
        colors={{ containerColor: 'transparent' }}
        contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}
        modifiers={[fillMaxSize()]}
      >
        <Box modifiers={[fillMaxSize(), padding(14, 13, 14, 13)]}>
          <Column modifiers={[fillMaxWidth()]}>
            <Box modifiers={[fillMaxWidth(), height(22)]}>
              <Text style={{ fontSize: 10 }} color={colors.muted} maxLines={1}>
                {props.dateLabel}
              </Text>
              <Box contentAlignment="topEnd" modifiers={[fillMaxWidth()]}>
                <Image
                  source={{ uri: `widget_${props.kind}_icon` }}
                  tint={colors.accent}
                  contentDescription={null}
                  modifiers={[size(25, 25)]}
                />
              </Box>
            </Box>
            <Text
              style={{ fontSize: 21, fontWeight: 'bold' }}
              color={colors.ink}
              maxLines={1}
              modifiers={[padding(0, 2, 0, 0)]}
            >
              {props.title}
            </Text>
            <Text
              style={{ fontSize: 10 }}
              color={colors.muted}
              maxLines={1}
              modifiers={[padding(0, 2, 0, 0)]}
            >
              {props.detail}
            </Text>
          </Column>
          <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
            <Box contentAlignment="centerStart" modifiers={[fillMaxWidth(), height(21)]}>
              <Text style={{ fontSize: 10, fontWeight: '600' }} color={colors.accent} maxLines={1}>
                {props.actionLabel}
              </Text>
              <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
                <Box
                  contentAlignment="center"
                  modifiers={[
                    size(21, 21),
                    background(isRest ? 'transparent' : colors.accent),
                    cornerRadius(isEmpty ? 6 : 11),
                  ]}
                >
                  <Image
                    source={{ uri: isEmpty ? 'widget_plus_icon' : 'widget_chevron_icon' }}
                    tint={isRest ? colors.accent : colors.paper}
                    contentDescription={null}
                    modifiers={[size(12, 12)]}
                  />
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Button>
    </Box>
  )
}

export default createWidget('TodayPlan', TodayPlan, emptyTodayPlan)
