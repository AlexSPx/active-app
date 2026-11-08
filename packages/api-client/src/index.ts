import { requests } from './request-contract.cjs'
import { responses, error } from './response-contract.cjs'
import operations from './operations.json'
import type { Operations } from './operation-types'
import type { components } from './generated'

export type { Operations } from './operation-types'
export type ApiErrorBody = components['schemas']['Error']
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: ApiErrorBody, public readonly requestId: string | null) {
    super(body.message)
  }
}

type Args<K extends keyof Operations> = { path: Operations[K]['path']; query: Operations[K]['query']; body: Operations[K]['body']; idempotencyKey?: string }
type Auth = { kind: 'bearer'; token: string } | { kind: 'session'; csrfToken: string } | { kind: 'none' }
export function createClient(baseUrl: string, auth: Auth, transport: typeof fetch = fetch) {
  if (auth.kind === 'session' && (!auth.csrfToken || typeof location === 'undefined' || new URL(baseUrl, location.href).origin !== location.origin)) {
    throw new Error('Web sessions require a same-origin server')
  }
  return async function call<K extends keyof Operations>(operation: K, args: Args<K>): Promise<Operations[K]['response']> {
    const spec = operations[operation]
    if (spec.mutation && !args.idempotencyKey) throw new Error('Idempotency-Key is required for mutations')
    const contract = requests[operation]
    const path = contract.path.parse(args.path) as Record<string, string>
    const query = contract.query.parse(args.query) as Record<string, string | number>
    const body = contract.body.parse(args.body)
    const target = new URL(spec.path.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(path[key])), baseUrl)
    for (const [key, value] of Object.entries(query)) target.searchParams.set(key, String(value))
    const headers: Record<string, string> = {}
    if (operation !== 'discovery') headers['X-Active-Contract-Version'] = '1'
    if (auth.kind === 'bearer') headers.Authorization = `Bearer ${auth.token}`
    if (auth.kind === 'session') headers['X-CSRF-Token'] = auth.csrfToken
    if (args.idempotencyKey) headers['Idempotency-Key'] = args.idempotencyKey
    if (body !== null) headers['Content-Type'] = 'application/json'
    const response = await transport(target.toString(), { method: spec.method, headers, credentials: auth.kind === 'session' ? 'same-origin' : 'omit', ...(body === null ? {} : { body: JSON.stringify(body) }) })
    if (!response.ok) {
      const parsed = error.parse(await response.json()) as ApiErrorBody
      throw new ApiError(response.status, parsed, response.headers.get('x-request-id'))
    }
    const value: unknown = spec.legal ? await response.text() : await response.json()
    return responses[operation].parse(value) as Operations[K]['response']
  }
}
