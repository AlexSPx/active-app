let pending: { ownerId: string; finish: (error: Error | null) => void } | null = null

export function waitForProfileDatabase(ownerId: string) {
  let finish: (error: Error | null) => void = () => {}
  const ready = new Promise<Error | null>((resolve) => {
    finish = resolve
  })
  const entry = { ownerId, finish }
  pending = entry
  return {
    ready,
    cancel: () => {
      if (pending === entry) pending = null
    },
  }
}

export function finishProfileDatabase(ownerId: string, error: Error | null): boolean {
  if (pending?.ownerId !== ownerId) return false
  const { finish } = pending
  pending = null
  finish(error)
  return true
}
