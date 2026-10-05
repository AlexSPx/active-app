import { SettingsPage } from '../../../components/settings/SettingsPage'
import TimeZoneSelector from '../../../components/TimeZoneSelector'

export default function TimeZoneSettingsScreen() {
  return (
    <SettingsPage
      title="Time zone"
      description="Choose the time zone for your workout history and reminders."
    >
      <TimeZoneSelector inline />
    </SettingsPage>
  )
}
