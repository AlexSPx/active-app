import { memo, useEffect, useState } from 'react'
import { View } from 'react-native'
import { UiText } from '../../../components/ui/Controls'

interface WorkoutSessionHeaderProps {
  workoutName: string
  date: string
  startTime: string | null
}

function formatElapsedTime(startTimestamp: number | null, now: number) {
  const elapsed = startTimestamp == null ? 0 : Math.max(0, now - startTimestamp)
  const minutes = Math.floor(elapsed / 60_000)
  const seconds = Math.floor((elapsed % 60_000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export const WorkoutSessionHeader = memo(function WorkoutSessionHeader({
  workoutName,
  date,
  startTime,
}: WorkoutSessionHeaderProps) {
  const startTimestamp = startTime ? Date.parse(startTime) : null
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (startTimestamp == null || !Number.isFinite(startTimestamp)) return

    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [startTimestamp])

  const duration = formatElapsedTime(
    startTimestamp != null && Number.isFinite(startTimestamp) ? startTimestamp : null,
    now
  )

  return (
    <View className="mb-field gap-compact">
      <UiText accessibilityRole="header" textRole="cardTitle">
        {workoutName}
      </UiText>
      <UiText textRole="caption">
        {date} • {duration}
      </UiText>
    </View>
  )
})
