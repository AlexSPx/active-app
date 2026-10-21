import { useState } from 'react'
import { View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
import { BarChart2, Plus } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { ProgressionWidget } from '../../../components/ProgressionWidget'
import { WidgetManager } from '../../../components/WidgetManager'
import { useWidgetStore } from '../../../stores/widgetStore'

export function TrainingWidgets() {
  const colors = useCadenceColors()
  const { widgets, removeWidget } = useWidgetStore()
  const sortedWidgets = [...widgets].sort((a, b) => a.position - b.position)
  const [widgetMode, setWidgetMode] = useState<'add' | 'manage' | null>(null)

  return (
    <>
      <View className="gap-field border-t border-divider pt-section">
        <View className="flex-row items-center justify-between gap-field">
          <UiText textRole="bodyEmphasis" accessibilityRole="header">
            Your progress
          </UiText>
          <Button
            variant="ghost"
            density="compact"
            className="flex-row gap-compact"
            accessibilityLabel="Add progress widget"
            onPress={() => setWidgetMode('add')}
          >
            <Plus size={16} color={colors.accent} aria-hidden />
            <UiText textRole="captionEmphasis">Add</UiText>
          </Button>
        </View>

        {sortedWidgets.length > 0 ? (
          <View className="gap-field">
            {sortedWidgets.map((widget) => (
              <ProgressionWidget
                key={widget.id}
                config={widget}
                onManage={() => setWidgetMode('manage')}
                onRemove={() => removeWidget(widget.id)}
              />
            ))}
          </View>
        ) : (
          <View className="gap-field py-compact">
            <View className="flex-row items-center gap-field">
              <BarChart2 size={22} color={colors.muted} aria-hidden />
              <View className="flex-1 gap-compact">
                <UiText textRole="bodyEmphasis">Keep an eye on your lifts</UiText>
                <UiText textRole="caption">
                  Choose an exercise and metric. Your progress will show up here.
                </UiText>
              </View>
            </View>
            <Button variant="ghost" className="w-full" onPress={() => setWidgetMode('add')}>
              <UiText textRole="captionEmphasis">Add your first widget</UiText>
            </Button>
          </View>
        )}
      </View>

      <WidgetManager
        isVisible={widgetMode !== null}
        mode={widgetMode ?? 'add'}
        onModeChange={setWidgetMode}
        onClose={() => setWidgetMode(null)}
      />
    </>
  )
}
