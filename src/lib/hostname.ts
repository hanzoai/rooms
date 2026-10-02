'use client'

import { useSyncExternalStore } from 'react'

/**
 * This page's hostname once React owns it, and '' in the render that hydrates.
 *
 * The export is prerendered with no host at all, so the server's answer is the
 * empty string and hydration's first client render agrees with it; the next
 * render has the real one. `useHydrated`'s shape, for the same reason: nothing
 * subscribes, because a page's host never changes under it.
 */
const NEVER = () => () => {}

export function useHost(): string {
  return useSyncExternalStore(
    NEVER,
    () => window.location.hostname,
    () => '',
  )
}
