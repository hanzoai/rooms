// What went wrong, in words that name something you can act on.
//
// A browser reports a request that never got an answer as `TypeError: Load
// failed` (Safari) or `Failed to fetch` (Chrome). Both are the SAME event and
// neither says which address failed or why — so a form that shows the message
// verbatim reads as "the app is broken" for a cause that is usually one line of
// configuration. There is no status to report because no response arrived.
//
// The cause is nearly always one of two, and both are about WHERE the page is
// open rather than about the request: the API is not running at the address the
// page was built with, or it is running and does not allow this page's origin,
// which the browser refuses BEFORE the request and reports identically.
// `localhost` and `127.0.0.1` are different origins to a browser and the same
// machine to a person, which is why this is worth a sentence rather than a
// shrug.

import { api } from './api'

/** A browser's word for "no answer arrived", per engine. */
const silent = (message: string): boolean =>
  /load failed|failed to fetch|networkerror|network request failed/i.test(message)

/**
 * What the server said about a failed call, or undefined when it said nothing.
 *
 * The platform refuses in RFC 9457 problem documents — `{title, status,
 * detail}` — and `@hanzo/ai` 0.6.16 reads only `msg` and `error`, so a refusal
 * with a reason reaches the page as `HTTP 400`. The reason is in the body the
 * error carries, and this reads it: `detail`, then `message`, then `title`.
 */
export function told(error: unknown): string | undefined {
  const body = (error as { body?: unknown } | null | undefined)?.body
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    for (const key of ['detail', 'message', 'msg', 'error', 'title'] as const) {
      const v = b[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (key === 'error' && v && typeof v === 'object') {
        const m = (v as { message?: unknown }).message
        if (typeof m === 'string' && m.trim()) return m.trim()
      }
    }
  }
  return undefined
}

/**
 * The sentence to show for a failed call.
 *
 * Anything the SERVER said is passed through untouched — a refusal in the
 * platform's own words is better than any rewording of it. Only the silence
 * gets replaced, because silence is the case with nothing in it to show.
 */
export function reach(error: unknown): string {
  const message = told(error) ?? (error instanceof Error ? error.message : String(error ?? ''))
  // Named at call time, so it is the address the page in front of the reader
  // actually used rather than the one the build was made with.
  const where = api()
  if (!message) return `No answer from ${where}.`
  if (!silent(message)) return message
  const here = typeof window === 'undefined' ? '' : window.location.origin
  // SAME ORIGIN IS NOT A CORS REFUSAL. On the dev server the platform's address
  // IS this page's, because `/v1` is proxied there — so silence means whatever
  // the proxy points at is not up, and the second half below would send the
  // reader after an allowlist that was never in the way.
  if (where === here) return `No answer from ${here}/v1 — the address it proxies to is not running.`
  return (
    `No answer from ${where}. It is either not running, or it is not open to ` +
    `pages served from ${here || 'this address'} ` +
    `— a browser treats localhost and 127.0.0.1 as different places.`
  )
}
