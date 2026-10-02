'use client'

import { useSyncExternalStore } from 'react'

/**
 * False while the server's markup is on screen, true once React owns it.
 *
 * Three places needed this and each wrote it as `useState(false)` plus
 * `useEffect(() => setReady(true), [])` — the shape
 * `react-hooks/set-state-in-effect` names, and a second render on every mount.
 *
 * `useSyncExternalStore` says it without the copy: the server snapshot is
 * `false`, so the SSR'd markup and the first client paint agree and hydration
 * matches; the client snapshot is `true`, so the very next render — the one
 * hydration already performs — has the real answer. Nothing subscribes, because
 * nothing changes after that, which is why `subscribe` returns an unsubscribe
 * that does nothing and is defined at module scope so its identity never moves.
 */
const NEVER = () => () => {}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => true,
    () => false,
  )
}
