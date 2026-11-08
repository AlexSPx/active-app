import type { ZodType } from 'zod'
export const requests: Record<string, { body: ZodType; path: ZodType; query: ZodType }>
