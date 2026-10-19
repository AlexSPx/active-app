import { useMemo, useState } from 'react'
import { useWorkoutMutations, useWorkoutRecords } from '../../workouts'

export function useRecordDetailController(id: string) {
  const { workoutRecords, loading, error, refetch } = useWorkoutRecords()
  const {
    deleteWorkoutRecord,
    loading: deleting,
    error: deleteError,
    clearError,
  } = useWorkoutMutations()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const record = useMemo(
    () => workoutRecords.find((item) => (item.id ?? `${item.workoutId}-${item.createdAt}`) === id),
    [workoutRecords, id]
  )

  const openConfirmation = () => {
    clearError()
    setConfirmationOpen(true)
  }
  const confirmDelete = async () => {
    if (!record?.id || deleting) return false
    const deleted = await deleteWorkoutRecord(record.id)
    if (deleted) setConfirmationOpen(false)
    return deleted
  }

  return {
    record,
    loading,
    error,
    refetch,
    deleting,
    deleteError,
    confirmationOpen,
    openConfirmation,
    cancelConfirmation: () => setConfirmationOpen(false),
    confirmDelete,
  }
}
