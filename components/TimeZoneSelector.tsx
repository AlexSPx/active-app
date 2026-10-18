import React, { useState } from 'react'
import { Button, Circle, Input, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui'
import { CadenceOverlay } from './ui/CadenceOverlay'
import { Check, ChevronDown } from './ui/icons'
import { timeZonesNames } from '@vvo/tzdb'
import { useSettingsStore, useUpdateUser } from '../features/settings'

interface TimeZoneSelectorProps {
  value?: string
  onValueChange?: (tz: string) => void
  inline?: boolean
}

const zoneName = (zone: string) => zone.replace(/_/g, ' ').replace(/\//g, ' / ')
function zoneOffset(zone: string) {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace('GMT', 'UTC')
  } catch {
    return 'Offset unavailable'
  }
}

export default function TimeZoneSelector({
  value,
  onValueChange,
  inline = false,
}: TimeZoneSelectorProps) {
  const { timeZone } = useSettingsStore()
  const { updateUserProfile, isUpdating, error } = useUpdateUser()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const current = value ?? timeZone
  let currentTime = 'unavailable'
  try {
    currentTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: current,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date())
  } catch {}
  const query = search.trim().toLowerCase().replace(/_/g, ' ')
  const zones = timeZonesNames.filter(
    (zone) => zoneName(zone).toLowerCase().includes(query) || zone.toLowerCase().includes(query)
  )

  const select = async (zone: string) => {
    if (onValueChange) onValueChange(zone)
    else {
      const user = await updateUserProfile({ timezone: zone })
      if (!user) return
    }
    setOpen(false)
    setSearch('')
  }
  const choices = (
    <YStack gap="$field">
      <Input
        accessibilityLabel="Search time zones"
        placeholder="City or region"
        value={search}
        onChangeText={setSearch}
        height="$action"
        rounded="$control"
        bg="$surface"
        borderColor="$borderColor"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {zones.length === 0 && (
        <Paragraph fontSize="$body" color="$colorSubtle">
          No matching time zones. Try a city or region.
        </Paragraph>
      )}
      {zones.map((zone) => (
        <Button
          key={zone}
          unstyled
          py="$field"
          minH="$touch"
          disabled={isUpdating}
          accessibilityRole="radio"
          accessibilityState={{ checked: current === zone }}
          onPress={() => select(zone)}
          pressStyle={{ bg: '$backgroundPress' }}
        >
          <XStack gap="$field" items="center">
            <Circle
              size="$icon"
              borderWidth={1}
              borderColor={current === zone ? '$primary' : '$borderColor'}
              bg={current === zone ? '$primary' : '$backgroundTransparent'}
            >
              {current === zone && <Check size="$iconSmall" color="$onPrimary" />}
            </Circle>
            <YStack flex={1} gap="$compact">
              <Text fontSize="$body" fontWeight="600">
                {zoneName(zone)}
              </Text>
              <Text fontSize="$caption" color="$colorSubtle">
                {zoneOffset(zone)}
              </Text>
            </YStack>
            {current === zone && (
              <Text fontSize="$caption" color="$primary">
                Selected
              </Text>
            )}
          </XStack>
        </Button>
      ))}
    </YStack>
  )
  return (
    <YStack gap="$section">
      <YStack gap="$compact">
        <Text fontSize="$body" fontWeight="600">
          {zoneName(current)}
        </Text>
        <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          {zoneOffset(current)} · Local time {currentTime}
        </Text>
      </YStack>
      {!!error && (
        <Paragraph fontSize="$caption" color="$destructive" accessibilityLiveRegion="polite">
          {error}
        </Paragraph>
      )}
      {inline ? (
        <>
          <YStack gap="$field">
            <Text fontSize="$body" fontWeight="600">
              Search time zones
            </Text>
            {choices}
          </YStack>
          <Paragraph fontSize="$caption" color="$colorSubtle">
            Changes apply automatically.
          </Paragraph>
        </>
      ) : (
        <>
          <Button
            height="$action"
            rounded="$control"
            iconAfter={<ChevronDown size="$icon" />}
            onPress={() => setOpen(true)}
          >
            {zoneName(current)}
          </Button>
          <CadenceOverlay
            open={open}
            onOpenChange={(next) => {
              setOpen(next)
              if (!next) setSearch('')
            }}
            snapPoints={[85]}
            title="Time zone"
            dismissible={!isUpdating}
          >
            <YStack flex={1} gap="$field">
              <XStack items="center" justify="flex-end">
                <Button
                  chromeless
                  disabled={isUpdating}
                  onPress={() => {
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  Cancel
                </Button>
              </XStack>
              <ScrollView keyboardShouldPersistTaps="handled">{choices}</ScrollView>
            </YStack>
          </CadenceOverlay>
        </>
      )}
    </YStack>
  )
}
