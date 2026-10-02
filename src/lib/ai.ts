'use client'

// Who answers a chat turn on this site, and on whose account.
//
// Signed in — the visitor's own IAM token. Enso routes the turn and it meters to
// their account like every other turn they run.
//
// Signed out — the FREE POOL, anonymously. There is no account to bill and none
// is needed: a free turn spends no balance, and what it costs instead is stated
// in the consent block the composer asks before the first send. A widget key, if
// one is configured, rides along so the turn attributes to the org that minted
// it; without one the turn is simply anonymous. Either way the client EXISTS,
// because a chat you cannot send is not a chat.
//
// This used to answer `client: null` with no key, which is what put "Sign in to
// send" under the composer — a wall in front of a lane that is free by design.
//
// So `client` is NEVER null now, and the type keeps saying `AiClient | null`
// because a caller that still branches on it stays correct. Nothing in this
// file returns null any more; if you are reading the type looking for the
// signed-out case, it is not there.

import { useEffect, useMemo, useState } from 'react'
import { useHydrated } from './hydrated'
import { api } from './api'
import { useIam } from '@hanzo/iam/react'
import { ORG, bearer, hasSession, org } from './session'
import { createAiClient, type AiClient } from '@hanzo/ai'
import { observed } from './served'
import { where } from '../where'

/**
 * The tenant a signed-out turn is recorded against: the publishable key IAM
 * mints, the same one this page beacons analytics with. It names an org and no
 * person, so it is safe in a bundle by construction, and a free turn attributes
 * to the org that published the page rather than to nobody.
 *
 * It is a KEY, not a token, and the distinction decides which route is called.
 * `laneFor` in the SDK asks whether a bearer is present: with one it sends the
 * metered `/v1/chat/completions`, without one it sends `/v1/chat/public` — the
 * credential-less lane, which reads neither the model nor the org off the
 * request, so a signed-out visitor cannot name a paid model or another tenant
 * even by trying. Passing this as `token` would therefore select the metered
 * route and be refused; it is passed as `publishableKey` (SDK >= 0.6.13).
 */


/** The gateway's own free pool: enso-free when logged out. */
export const FREE = 'enso-free'

/** Enso routes a signed-in turn: enso-auto when logged in. */
export const ENSO = 'enso-auto'

/**
 * The model that will actually ANSWER, given what the gateway serves.
 */
export function served(models: { id: string }[], prefer: string): string {
  const cleanPrefer = prefer === 'openrouter/auto' || prefer?.includes('openrouter') ? 'enso-auto' : prefer
  if (models.length === 0) return cleanPrefer || 'enso-auto'
  if (cleanPrefer && models.some((m) => m.id === cleanPrefer)) return cleanPrefer
  if (cleanPrefer === 'enso-free' || cleanPrefer === 'free' || cleanPrefer.includes('free')) {
    const free = models.find((m) => m.id === 'enso-free' || m.id === 'zen-free' || (m.id.includes('free') && !m.id.includes('openrouter')))
    if (free) return free.id
    return 'enso-free'
  }
  // House routers: Enso or Zen
  const houseAuto = models.find((m) => m.id === 'enso-auto' || m.id === 'zen-auto' || m.id === 'enso' || m.id === 'zen')
  if (houseAuto) return houseAuto.id

  const houseModel = models.find((m) => (m.id.startsWith('enso') || m.id.startsWith('zen')) && !m.id.includes('openrouter'))
  if (houseModel) return houseModel.id

  const clean = models.find((m) => !m.id.includes('openrouter'))
  if (clean) return clean.id

  return 'enso-auto'
}

/**
 * The gateway's address in the shape `createAiClient` takes it.
 *
 * The address itself is `api()` — one derivation, in `lib/hanzo/api.ts`, which
 * every plain `fetch` in the app also reads. This working correctly here and
 * nowhere else is what left eight other modules pointed at production while the
 * dev proxy sat unused beside them.
 */
export const base = (): { baseUrl?: string } => ({ baseUrl: api() })

export interface Ai {
  client: AiClient | null
  model: string
  /** Answering free, so the turn is data-shared and owes the notice. */
  free: boolean
  /** Mounted client-side. The static export always prerenders the signed-out
   *  page, so nothing interactive may render until this is true. */
  ready: boolean
}

export function useAi(): Ai {
  const { sdk, isAuthenticated } = useIam()
  // The organization every call is scoped to: the SDK's selection, sent only
  // when the token says the reader belongs to it (`org()`), and followed through
  // the one event a change fires — so the client is rebuilt and every hook on
  // it reads the new organization's rooms, agents and threads.
  const [scoped, setScoped] = useState<string | null>(() => org())
  useEffect(() => {
    const on = () => setScoped(org())
    window.addEventListener(ORG, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(ORG, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  const ready = useHydrated()


  const signedIn = isAuthenticated || hasSession()
  const account = Boolean(signedIn && sdk)

  const client = useMemo(() => {
    // TWO STATES, ONE ISSUER. Signed in is the visitor's own IAM session; signed
    // out is the org's IAM-minted publishable key. There is no third credential
    // and no locally-invented one — a token this app made up is a token the
    // gateway has no reason to accept, and it reaches the metered lane rather
    // than the free one, which is the opposite of what a signed-out reader needs.
    if (account && sdk) {
      return createAiClient({
        fetch: observed((input, init) => fetch(input, init)),
        headers: scoped ? { 'X-Org-Id': scoped } : {},
        auth: {
          ...sdk,
          getValidAccessToken: async () => {
            const t = (await sdk.getValidAccessToken?.()) || bearer()
            if (!t) return null
            try {
              const part = t.split('.')[1]
              if (part) {
                const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
                const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
                if (auds.includes('hanzo-ai') && !auds.includes('hanzo-app')) {
                  // Production gateway does not yet whitelist aud="hanzo-ai"; fallback
                  // to anonymous key rather than failing with "jwt: audience not allowed".
                  return null
                }
              }
            } catch {}
            return t
          },
        },
        ...base(),
      })
    }
    return createAiClient({ fetch: observed((input, init) => fetch(input, init)), publishableKey: where().key ?? '', ...base() })
  }, [account, sdk, scoped])

  return { client, model: account ? ENSO : FREE, free: !account, ready }
}
