import { Alert, FlatList, Linking, Pressable, View } from 'react-native'
import { UiText } from '../../components/ui/Controls'
import { ChevronRight } from '../../components/ui/icons'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import dependencies from '../../features/about/dependencies.json'
import { useTabContentInset } from '../../navigation/TabContentInset'

export default function DependenciesScreen() {
  const bottomInset = useTabContentInset()
  const colors = useCadenceColors()

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
            Expo client runtime dependencies and their dependencies from the Yarn lockfile. License
            identifiers come from package registries and may be unknown. Open a package for its
            license and notices. Native platform dependencies are not included.
          </UiText>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          className="min-h-touch flex-row items-center gap-field rounded-settings border border-divider bg-surface p-field hover:bg-raised active:bg-raised focus:border-2 focus:border-accent"
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name}, ${item.version}, ${item.license ?? 'Unknown'} license, package details`}
          onPress={() => {
            void Linking.openURL(item.url).catch(() =>
              Alert.alert('Could not open package information', 'Please try again later.')
            )
          }}
        >
          <View className="flex-1 gap-compact">
            <UiText textRole="bodyEmphasis">{item.name}</UiText>
            <UiText textRole="caption">
              {item.version} · {item.license ?? 'Unknown'}
            </UiText>
          </View>
          <ChevronRight size={20} color={colors.muted} aria-hidden />
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View className="h-compact" />}
      contentContainerClassName="w-full max-w-[720px] self-center p-page"
    />
  )
}
