import { Paragraph } from 'tamagui'
import NotificationPermissions from '../../../components/NotificationPermissions'
import { SettingsPage } from '../../../components/settings/SettingsPage'
import { TrainingReminders } from '../../../features/training/components/TrainingReminders'

export default function PermissionsScreen() {
  return (
    <SettingsPage
      title="Permissions"
      description="Manage notification access and rest timer alerts."
    >
      <NotificationPermissions />
      <TrainingReminders />
      <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
        Your device controls permission access. You can change it at any time in device settings.
      </Paragraph>
    </SettingsPage>
  )
}
