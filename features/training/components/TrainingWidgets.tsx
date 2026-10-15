import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import { Plus } from '@tamagui/lucide-icons'
import { ProgressionWidget } from '../../../components/ProgressionWidget'
import { WidgetManager } from '../../../components/WidgetManager'
import { useWidgetStore, type WidgetConfig } from '../../../stores/widgetStore'
import { getTrainingFacade } from '../trainingFacade'

export function TrainingWidgets() {
  const { widgets } = useWidgetStore()
  const sortedWidgets = getTrainingFacade().getWidgets(widgets)
  return sortedWidgets === null ? null : <WidgetSection widgets={sortedWidgets} />
}

function WidgetSection({ widgets: sortedWidgets }: { widgets: WidgetConfig[] }) {
  const [widgetMode, setWidgetMode] = useState<'add' | 'manage' | null>(null)
  return (
    <>
      <YStack pt="$section" pb="$section" gap="$field">
        <XStack items="center" justify="space-between" gap="$compact" flexWrap="wrap">
          <Text fontSize="$header" lineHeight="$header" fontWeight="600" color="$color">
            Your widgets
          </Text>
          <XStack gap="$compact">
            {sortedWidgets.length > 0 && (
              <Button
                chromeless
                minH="$touch"
                rounded="$day"
                onPress={() => setWidgetMode('manage')}
              >
                <Text color="$primary" fontSize="$caption" fontWeight="600">
                  Manage
                </Text>
              </Button>
            )}
            <Button chromeless minH="$touch" rounded="$day" onPress={() => setWidgetMode('add')}>
              <Plus size="$iconSmall" color="$primary" aria-hidden />
              <Text color="$primary" fontSize="$caption" fontWeight="600">
                Add
              </Text>
            </Button>
          </XStack>
        </XStack>
        {sortedWidgets.length > 0 ? (
          sortedWidgets.map((widget) => <ProgressionWidget key={widget.id} config={widget} />)
        ) : (
          <YStack gap="$compact">
            <Text fontSize="$exerciseTitle" lineHeight="$exerciseTitle" fontWeight="600">
              No widgets yet
            </Text>
            <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
              Choose an exercise and metric to track your progress here.
            </Text>
          </YStack>
        )}
        <Button
          height="$action"
          rounded="$button"
          bg="$surface"
          borderColor="$borderColor"
          borderWidth={1}
          onPress={() => setWidgetMode('add')}
        >
          <Plus size="$iconSmall" color="$primary" aria-hidden />
          <Text color="$primary" fontSize="$caption" fontWeight="600">
            Add widget
          </Text>
        </Button>
      </YStack>
      <WidgetManager
        isVisible={widgetMode !== null}
        mode={widgetMode ?? 'add'}
        onModeChange={setWidgetMode}
        onClose={() => setWidgetMode(null)}
      />
    </>
  )
}
