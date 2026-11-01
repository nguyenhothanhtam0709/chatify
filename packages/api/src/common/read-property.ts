/**
 * Reads one property of a value that is not typed (a thrown error, a request, a handshake),
 * or `undefined` when the value is not an object. The caller checks what comes back.
 */
export function readProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' || typeof value === 'function'
    ? value === null
      ? undefined
      : Reflect.get(value, key)
    : undefined;
}
