import { YStack, XStack, Text, Button, View, ScrollView } from 'tamagui'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Plus } from '@tamagui/lucide-icons'
import { WeeklyView } from '../../components/WeeklyView'
import { TodayView } from '../../components/TodayView'
import { ProgressionWidget } from '../../components/ProgressionWidget'
import { WidgetManager } from '../../components/WidgetManager'
import { useWidgetStore } from '../../stores/widgetStore'

export default function HomeScreen() {
  const router = useRouter()
  const [showWidgetManager, setShowWidgetManager] = useState(false)

  const { widgets, removeWidget } = useWidgetStore()
  const sortedWidgets = widgets.sort((a, b) => a.position - b.position)

  return (
    <ScrollView flex={1} bg="$background" showsVerticalScrollIndicator={false}>
      {/* Content starts below native header */}

      {/* Weekly View */}
      <YStack p="$4" pt="$0">
        <WeeklyView />
      </YStack>

      {/* Today View */}
      <YStack p="$4" pt="$0">
        <TodayView />
      </YStack>

      {/* Progress Widgets Section */}
      <YStack p="$4" pt="$0">
        <XStack items="center" justify="space-between" mb="$3">
          <Text fontSize="$5" fontWeight="600">
            Progress Tracking
          </Text>
          <Button
            size="$3"
            variant="outlined"
            onPress={() => setShowWidgetManager(true)}
            bg="$backgroundAccent"
            borderColor="$borderAccent"
            pressStyle={{ bg: '$backgroundAccentPress' }}
          >
            <Plus size={16} color="$primary" />
            <Text color="$primary" fontWeight="500">
              Add Widget
            </Text>
          </Button>
        </XStack>

        {sortedWidgets.length > 0 ? (
          <YStack>
            {sortedWidgets.map((widget) => (
              <ProgressionWidget key={widget.id} config={widget} onRemove={removeWidget} />
            ))}
          </YStack>
        ) : (
          <YStack
            items="center"
            justify="center"
            p="$6"
            bg="$background"
            borderColor="$borderColor"
            borderWidth={1}
            rounded="$4"
            borderStyle="dashed"
          >
            <Text fontSize="$4" color="$color11" mb="$2">
              Track Your Progress
            </Text>
            <Text fontSize="$3" color="$color11" mb="$4">
              Add widgets to visualize your exercise progression
            </Text>
            <Button size="$4" onPress={() => setShowWidgetManager(true)} bg="$primary">
              <Plus size={16} />
              <Text color="$onPrimary" fontWeight="600" ml="$2">
                Add Your First Widget
              </Text>
            </Button>
          </YStack>
        )}
      </YStack>

      {/* Widget Manager Modal */}
      <WidgetManager isVisible={showWidgetManager} onClose={() => setShowWidgetManager(false)} />
    </ScrollView>
  )
}
