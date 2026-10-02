import { track } from './tags'

/**
 * Activation: the first time this browser does what the product is for,
 * counted once as `first_action` with that thing as its `action` — the one
 * activation name every product shares (@hanzo/events), which GA4 hears as
 * `first_message` for the only action this site counts, `chat_message`.
 *
 * The mark lives in localStorage, so it is once per browser: a person on a
 * second device is counted there too, and a browser that stores nothing is
 * never counted, which undercounts rather than inflating.
 */
export function first(action: string): void {
  const key = `hz_first.${action}`
  try {
    if (window.localStorage.getItem(key)) return
    window.localStorage.setItem(key, '1')
  } catch {
    return
  }
  track('first_action', { action })
}
