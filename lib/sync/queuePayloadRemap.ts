export interface PayloadRewriteResult<T = unknown> {
  value: T
  changed: boolean
}

export function replaceQueuedIdReferences<T = unknown>(
  value: T,
  oldId: string,
  newId: string,
): PayloadRewriteResult<T> {
  if (typeof value === 'string') {
    if (value === oldId) {
      return { value: newId as T, changed: true }
    }
    return { value, changed: false }
  }

  if (Array.isArray(value)) {
    let changed = false
    const nextValue = value.map((item) => {
      const result = replaceQueuedIdReferences(item, oldId, newId)
      changed = changed || result.changed
      return result.value
    })
    return { value: (changed ? nextValue : value) as T, changed }
  }

  if (value && typeof value === 'object') {
    let changed = false
    const nextValue: Record<string, unknown> = {}

    for (const [key, nestedValue] of Object.entries(value)) {
      const result = replaceQueuedIdReferences(nestedValue, oldId, newId)
      nextValue[key] = result.value
      changed = changed || result.changed
    }

    return { value: (changed ? nextValue : value) as T, changed }
  }

  return { value, changed: false }
}
