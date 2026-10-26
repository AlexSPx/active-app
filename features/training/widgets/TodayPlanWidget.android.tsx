import {
  Box,
  Button,
  Column,
  Image,
  LinearProgressIndicator,
  Row,
  Text,
} from '@expo/ui/jetpack-compose'
import {
  background,
  cornerRadius,
  fillMaxHeight,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'
import { emptyTodayPlan, type TodayPlanProps } from './todayPlan'

const TodayPlan = (props: TodayPlanProps, environment: WidgetEnvironment) => {
  'widget'
  const theme = environment.colorScheme === 'dark' ? 'dark' : 'light'
  const colors = props.appearance[theme]
  const isEmpty = props.kind === 'empty'
  const cycle = props.cycle
  return (
    <Box modifiers={[fillMaxSize(), background(colors.paper), cornerRadius(21)]}>
      <Button
        {...{ target: props.url }}
        colors={{ containerColor: 'transparent' }}
        contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}
        modifiers={[fillMaxSize()]}
      >
        <Box modifiers={[fillMaxSize()]}>
          <Column modifiers={[fillMaxSize(), padding(18, 16, 100, 48)]}>
            <Text style={{ fontSize: 10, fontWeight: '500' }} color={colors.muted} maxLines={1}>
              {props.dateLabel}
            </Text>
            <Text
              style={{ fontSize: props.title.length > 8 ? 24 : 42, fontWeight: '800' }}
              color={colors.ink}
              maxLines={2}
              modifiers={[padding(0, 10, 0, 0)]}
            >
              {props.title}
            </Text>
            <Text
              style={{ fontSize: 11, fontWeight: '400' }}
              color={colors.muted}
              maxLines={1}
              modifiers={[padding(0, 3, 0, 0)]}
            >
              {props.detail}
            </Text>
          </Column>
          <Box contentAlignment="bottomStart" modifiers={[fillMaxSize(), padding(18, 0, 100, 14)]}>
            <Row verticalAlignment="center">
              <Text
                style={{ fontSize: 11, fontWeight: '600' }}
                color={colors.accent}
                maxLines={1}
                modifiers={[padding(0, 0, 8, 0)]}
              >
                {props.actionLabel}
              </Text>
              <Box
                contentAlignment="center"
                modifiers={[size(22, 22), background(colors.accent), cornerRadius(11)]}
              >
                <Image
                  source={{ uri: isEmpty ? 'widget_plus_icon' : 'widget_chevron_icon' }}
                  tint={colors.paper}
                  contentDescription={null}
                  modifiers={[size(10, 10)]}
                />
              </Box>
            </Row>
          </Box>
          <Box contentAlignment="centerEnd" modifiers={[fillMaxSize()]}>
            <Box modifiers={[width(84), fillMaxHeight(), background(colors.panel)]}>
              <Box contentAlignment="topCenter" modifiers={[fillMaxSize(), padding(8, 16, 8, 0)]}>
                <Image
                  source={{ uri: `widget_${props.kind}_icon` }}
                  tint={colors.accent}
                  contentDescription={null}
                  modifiers={[size(20, 20)]}
                />
              </Box>
              <Box contentAlignment="center" modifiers={[fillMaxSize(), padding(8, 38, 8, 28)]}>
                {cycle ? (
                  <Column horizontalAlignment="center">
                    <Text style={{ fontSize: 10, fontWeight: '400' }} color={colors.muted}>
                      Day
                    </Text>
                    <Text
                      style={{ fontSize: 42, fontWeight: '800' }}
                      color={colors.ink}
                      maxLines={1}
                    >
                      {String(cycle.current)}
                    </Text>
                    <Text
                      style={{ fontSize: 10, fontWeight: '400' }}
                      color={colors.muted}
                      maxLines={1}
                    >
                      {`of ${cycle.total}`}
                    </Text>
                  </Column>
                ) : props.progress ? (
                  <Text
                    style={{ fontSize: 10, textAlign: 'center' }}
                    color={colors.muted}
                    maxLines={5}
                  >
                    {props.progress.label}
                  </Text>
                ) : (
                  <Box modifiers={[height(6)]} />
                )}
              </Box>
              <Box
                contentAlignment="bottomCenter"
                modifiers={[fillMaxSize(), padding(8, 0, 8, 16)]}
              >
                {cycle && cycle.total <= 7 ? (
                  <Row>
                    {Array.from({ length: cycle.total }, (_, index) => (
                      <Box key={index} modifiers={[padding(2, 0, 2, 0)]}>
                        <Box
                          modifiers={[
                            size(5, 5),
                            background(
                              index + 1 === cycle.current ? colors.accent : `${colors.accent}33`
                            ),
                            cornerRadius(3),
                          ]}
                        />
                      </Box>
                    ))}
                  </Row>
                ) : props.progress?.value != null ? (
                  <LinearProgressIndicator
                    progress={props.progress.value}
                    color={colors.accent}
                    trackColor={`${colors.accent}33`}
                    modifiers={[width(48), height(4)]}
                  />
                ) : (
                  <Box modifiers={[height(6)]} />
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </Button>
    </Box>
  )
}

export default createWidget('TodayPlan', TodayPlan, emptyTodayPlan)
