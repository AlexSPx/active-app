export const DEVICE_DATA_ERASE_PENDING_KEY = 'device-data-erase-pending-v1'

export interface EraseJournalStorage {
  getItem(key: string): Promise<string | null>
  removeItem(key: string): Promise<void>
}

/** Completes a marked erase before the caller restores or opens profile data. */
export async function completePendingDeviceErase(
  storage: EraseJournalStorage,
  erase: () => Promise<void>
): Promise<boolean> {
  if ((await storage.getItem(DEVICE_DATA_ERASE_PENDING_KEY)) === null) return false
  await erase()
  await storage.removeItem(DEVICE_DATA_ERASE_PENDING_KEY)
  return true
}
