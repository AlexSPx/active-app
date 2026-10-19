import React, { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { CadenceOverlay } from './ui/CadenceOverlay'
import { Button, TextField, UiText } from './ui/Controls'
import { Check, ChevronDown } from './ui/icons'
import { useCadenceColors } from './ui/useCadenceColors'
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
  const colors = useCadenceColors()
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
    <View className="gap-field">
      <TextField
        id="time-zone-search"
        accessibilityLabel="Search time zones"
        placeholder="City or region"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {zones.length === 0 && (
        <UiText textRole="bodyMuted">No matching time zones. Try a city or region.</UiText>
      )}
      {zones.map((zone) => {
        const selected = current === zone
        return (
          <Button
            key={zone}
            variant={selected ? 'selected' : 'ghost'}
            density="compact"
            className="w-full justify-start"
            disabled={isUpdating}
            accessibilityRole="radio"
            accessibilityLabel={zoneName(zone)}
            accessibilityState={{ checked: selected }}
            onPress={() => select(zone)}
          >
            <View className="w-full flex-row items-center gap-field">
              <View
                className={`h-8 w-8 items-center justify-center rounded-full border ${selected ? 'border-accent bg-accent' : 'border-divider bg-surface'}`}
                accessible={false}
              >
                {selected && <Check size={16} color={colors.onAccent} aria-hidden />}
              </View>
              <View className="flex-1 gap-compact">
                <UiText textRole="bodyEmphasis">{zoneName(zone)}</UiText>
                <UiText textRole="caption">{zoneOffset(zone)}</UiText>
              </View>
              {selected && <UiText textRole="captionEmphasis">Selected</UiText>}
            </View>
          </Button>
        )
      })}
    </View>
  )

  return (
    <View className="gap-section">
      <View className="gap-compact">
        <UiText textRole="bodyEmphasis">{zoneName(current)}</UiText>
        <UiText textRole="caption">
          {zoneOffset(current)} · Local time {currentTime}
        </UiText>
      </View>
      {!!error && (
        <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
          {error}
        </UiText>
      )}
      {inline ? (
        <>
          <View className="gap-field">
            <UiText textRole="bodyEmphasis">Search time zones</UiText>
            {choices}
          </View>
          <UiText textRole="caption">Changes apply automatically.</UiText>
        </>
      ) : (
        <>
          <Button
            variant="surface"
            className="w-full"
            accessibilityLabel={`Choose time zone, ${zoneName(current)}`}
            onPress={() => setOpen(true)}
          >
            <View className="w-full flex-row items-center justify-between gap-field">
              <UiText textRole="bodyEmphasis" className="flex-1">
                {zoneName(current)}
              </UiText>
              <ChevronDown size={20} color={colors.muted} />
            </View>
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
            <View className="flex-1 gap-field">
              <Button
                variant="ghost"
                density="compact"
                className="self-end"
                disabled={isUpdating}
                onPress={() => {
                  setOpen(false)
                  setSearch('')
                }}
              >
                Cancel
              </Button>
              <ScrollView keyboardShouldPersistTaps="handled" className="flex-1">
                <View className="gap-field pb-section">{choices}</View>
              </ScrollView>
            </View>
          </CadenceOverlay>
        </>
      )}
    </View>
  )
}
