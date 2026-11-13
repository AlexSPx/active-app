import { FlatList, View } from 'react-native'
import { UiText } from '../../components/ui/Controls'
import dependencies from '../../features/about/dependencies.json'
import { useTabContentInset } from '../../navigation/TabContentInset'

export default function DependenciesScreen() {
  const bottomInset = useTabContentInset()

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: bottomInset }}
      data={dependencies}
      keyExtractor={(item) => `${item.ecosystem}:${item.name}:${item.version}`}
      ListHeaderComponent={
        <View className="gap-field pb-section">
          <UiText accessibilityRole="header" textRole="screenTitle">
            Dependencies
          </UiText>
          <UiText textRole="bodyMuted">
            Packages recorded in the project’s Yarn and Cargo lockfiles, including development tools
            and the server. Native platform dependencies and license notices are not included.
          </UiText>
        </View>
      }
      renderItem={({ item }) => (
        <View className="gap-compact py-field">
          <UiText textRole="bodyEmphasis">{item.name}</UiText>
          <UiText textRole="caption">
            {item.ecosystem} · {item.version}
          </UiText>
        </View>
      )}
      contentContainerClassName="w-full max-w-[720px] self-center p-page"
    />
  )
}
