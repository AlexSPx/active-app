import React from 'react'
import { YStack, XStack, Text, Button, ScrollView, Sheet, Input } from 'tamagui'
import { ChevronDown, Check } from '@tamagui/lucide-icons'
import { useSettingsStore } from '../stores/settingsStore'
import { useUpdateUser } from '../hooks/useUpdateUser'
import { LoadingSpinner } from './ui/LoadingSpinner'

// Cache to avoid re-importing tzdb between openings
let cachedTimeZones: string[] | null = null

export default function TimeZoneSelector() {
  const { timeZone, setTimeZone } = useSettingsStore()
  const { updateUserProfile } = useUpdateUser()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [timeZones, setTimeZones] = React.useState<string[] | null>(cachedTimeZones)

  // Lazy load tzdb when sheet opens
  React.useEffect(() => {
    if (!open || timeZones) return
    let cancelled = false
    setLoading(true)
    import('@vvo/tzdb')
      .then((mod) => {
        if (cancelled) return
        cachedTimeZones = mod.timeZonesNames
        setTimeZones(cachedTimeZones)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, timeZones])

  const filteredTimezones = React.useMemo(() => {
    if (!timeZones) return []
    if (!search) return timeZones
    const q = search.toLowerCase()
    return timeZones.filter((tz) => tz.toLowerCase().includes(q))
  }, [search, timeZones])

  const handleSelect = async (tz: string) => {
    setTimeZone(tz)
    // fire and forget profile update; ignore blanks handled in hook/api
    try {
      await updateUserProfile({ timezone: tz })
    } catch {}
    setOpen(false)
    setSearch('')
  }

  return (
    <YStack gap="$3">
      <XStack gap="$2" items="center">
        <Text fontWeight="700">Current:</Text>
        <Text>{timeZone}</Text>
      </XStack>

      <Button width="100%" iconAfter={ChevronDown} onPress={() => setOpen(true)}>
        {timeZone}
      </Button>

      <Sheet
        modal
        open={open}
        onOpenChange={setOpen}
        snapPoints={[85]}
        dismissOnSnapToBottom
        animation="medium"
      >
        <Sheet.Overlay animation="lazy" enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
        <Sheet.Frame p="$4" gap="$4">
          <Sheet.Handle />
          <YStack gap="$3" flex={1}>
            <Text fontSize="$6" fontWeight="bold">
              Select Time Zone
            </Text>
            <Text fontSize="$2" color="$colorSubtle">
              {timeZones ? `${timeZones.length} timezones available` : 'Loading timezones…'}
            </Text>
            <Input
              placeholder="Search timezones..."
              value={search}
              onChangeText={setSearch}
              size="$4"
              disabled={loading || !timeZones}
            />

            {loading && (
              <YStack flex={1} items="center" justify="center">
                <LoadingSpinner text="Loading timezones…" />
              </YStack>
            )}

            {!loading && timeZones && (
              <ScrollView flex={1}>
                <YStack gap="$2" pb="$4">
                  {filteredTimezones.map((tz) => (
                    <Button
                      key={tz}
                      size="$4"
                      chromeless
                      onPress={() => handleSelect(tz)}
                      bg={tz === timeZone ? '$backgroundPress' : 'transparent'}
                      iconAfter={tz === timeZone ? <Check size={16} /> : undefined}
                    >
                      <Text>{tz}</Text>
                    </Button>
                  ))}
                </YStack>
              </ScrollView>
            )}
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  )
}
