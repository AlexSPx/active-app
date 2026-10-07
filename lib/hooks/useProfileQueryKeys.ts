import { useMemo } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { queryKeys } from '../queryKeys'

export function useProfileQueryKeys() {
  const ownerId = useAuthStore((state) => state.profileOwnerId)
  return useMemo(() => queryKeys.forOwner(ownerId), [ownerId])
}
