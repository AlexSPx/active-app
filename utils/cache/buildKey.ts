// Build a stable cache key from parts. Handles primitives and objects by stable sorting keys.
export function buildCacheKey(parts: any[]): string {
  const norm = parts.map(stableSerialize)
  return norm.join('|')
}

function stableSerialize(value: any): string {
  const t = typeof value
  if (
    value === null ||
    t === 'number' ||
    t === 'string' ||
    t === 'boolean' ||
    value === undefined
  ) {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableSerialize).join(',') + ']'
  }
  // Object: sort keys
  const keys = Object.keys(value).sort()
  const entries = keys.map((k) => JSON.stringify(k) + ':' + stableSerialize(value[k]))
  return '{' + entries.join(',') + '}'
}
