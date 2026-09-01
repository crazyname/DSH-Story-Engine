/** Shared wire shapes for the DSH client api used by the story client. */

/** Standard RPC envelope returned by unary api methods. Real DSH clients include rpcId; structural test doubles may omit it. */
export type Rpc<T> = { rpcId?: string; result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } } }

/** Unwrap a successful RPC result; throws with the host error message otherwise. */
export function unwrap<T>(value: Rpc<T>, operation: string): T {
  if (!value.result.ok) throw new Error(`${operation}失败：${value.result.error.message}`)
  return value.result.value
}
