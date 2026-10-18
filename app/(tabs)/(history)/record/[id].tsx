import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActionMenu } from '../../../../components/ui/ActionMenu'
import { RecordDetailView, useRecordDetailController } from '../../../../features/history'

export default function RecordDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const id = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '')
  const router = useRouter()
  const detail = useRecordDetailController(id)

  const confirmDelete = async () => {
    const deleted = await detail.confirmDelete()
    if (deleted) router.replace('/(tabs)/(history)')
    return deleted
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            detail.record?.id ? (
              <ActionMenu
                label="Session actions"
                actions={[
                  {
                    label: 'Delete record',
                    onPress: detail.openConfirmation,
                    destructive: true,
                    disabled: detail.deleting,
                  },
                ]}
              />
            ) : null,
        }}
      />
      <RecordDetailView
        record={detail.record}
        loading={detail.loading}
        error={detail.error}
        onRetry={detail.refetch}
        deleting={detail.deleting}
        deleteError={detail.deleteError}
        confirmationOpen={detail.confirmationOpen}
        onOpenConfirmation={detail.openConfirmation}
        onCancelConfirmation={detail.cancelConfirmation}
        onConfirmDelete={confirmDelete}
      />
    </>
  )
}
