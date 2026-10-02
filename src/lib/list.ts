/**
 * A fetched list, as an array or nothing.
 *
 * `x ?? []` covers null and undefined and nothing else: a body that answers
 * `{rooms: {}}`, or an error object where a page was expected, passes through
 * it and the first `.filter` on it throws in render. A read from the network
 * is a boundary, and this is the one check at it.
 */
export function list<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : []
}
