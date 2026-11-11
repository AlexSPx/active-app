import { requestSemanticsSchema, type RequestSemantics } from './requestSemantics'

/** Validate structural invariants before producing the development JSON record. */
export function serializeRequestSemantics(value: RequestSemantics): string {
  return JSON.stringify(requestSemanticsSchema.parse(value))
}
