import { useLocalSearchParams } from 'expo-router'
import { ScrollView } from 'react-native'
import { ProgressionWidget } from '../components/ProgressionWidget'
import { UiText } from '../components/ui/Controls'
import { useWidgetStore } from '../stores/widgetStore'

export default function ProgressScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>()
  const widget = useWidgetStore((state) =>
    typeof id === 'string' && id.length > 0
      ? state.widgets.find((item) => item.id === id)
      : undefined
  )

  return (
    <ScrollView contentContainerClassName="p-card">
      {widget ? (
        <ProgressionWidget config={widget} detail />
      ) : (
        <UiText textRole="body">This progress widget is no longer available.</UiText>
      )}
    </ScrollView>
  )
}
