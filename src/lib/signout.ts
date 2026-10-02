'use client'

/**
 * IAM, called from this page. The embedded sign-in, the silent check for a
 * session and sign-out all go through `useClient`, whose credential calls are
 * answered on this origin where it answers them (universe static-sites
 * `iam-on-hanzo-ai`): that is also where IAM keeps its session cookie, so the
 * session a person signs in with here is the one a later visit finds, and the
 * one sign-out ends. Nobody is sent to hanzo.id for any of it.
 */

import { useMemo } from 'react'
import { IAM } from '@hanzo/iam'
import { useIam } from '@hanzo/iam/react'
import { useSignOut as useUiSignOut } from '@hanzo/ui/auth'
import { track } from './tags'
import { APEX } from './host'

/**
 * The hosts that answer IAM's sign-in and sign-out calls on their own origin:
 * every host this export is served on and signs in at (universe static-sites
 * `iam-on-hanzo-ai`), and the dev server's /v1 proxy.
 */
const HOSTS = new Set([...APEX, 'cloud.hanzo.ai', 'hanzo.bot', 'bot.hanzo.ai', 'localhost', '127.0.0.1'])

/** Whether the page in front of us is on such an origin. */
export const here = (): boolean => typeof window !== 'undefined' && HOSTS.has(window.location.hostname)

/** The IAM client for this page; the token exchange at the callback shares its PKCE store. */
export function useClient(): IAM {
  const { config } = useIam()
  const local = here()
  return useMemo(() => new IAM(local ? { ...config, proxyBaseUrl: window.location.origin } : config), [config, local])
}

/** Where a sign-out lands: this site's sign-in, which does not ask IAM for the session just ended. */
export const OUT = '/login?from=logout'

/**
 * Sign-out on this site: @hanzo/ui/auth's `signOut` — the tokens handed back to
 * IAM's /v1/iam routes, IAM's session here ended, the local session cleared —
 * counted as logout_completed, and then /login?from=logout, where the person can
 * sign straight back in. IAM's own logout page is never visited.
 */
export function useSignOut(): () => Promise<void> {
  return useUiSignOut({ to: OUT, track })
}
