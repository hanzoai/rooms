/**
 * WHERE THE PLATFORM IS, DERIVED ONCE.
 *
 * `hooks/useAi.ts` worked this out correctly for the SDK client and nothing
 * else could reach it: seven other modules wrote their own
 * `process.env.NEXT_PUBLIC_HANZO_API_URL || 'https://api.hanzo.ai'` — reach.ts,
 * team.ts, coding.ts, referrals.ts, useTiers.ts, Settings.tsx, Directory.tsx,
 * Beluga.tsx — and every one of them got the local case wrong in the same way.
 *
 * THE LOCAL CASE IS THE WHOLE POINT. api.hanzo.ai admits an origin by allowlist
 * and by an https, portless DNS proof; localhost satisfies neither, so a
 * credentialed read to an ABSOLUTE address fails its preflight and the room
 * draws as though the org owned nothing. `next.config.mjs` proxies `/v1` for
 * exactly this, but a caller with an absolute default never reaches a rewrite.
 * Same-origin on the dev server is what makes the proxy do its job.
 *
 * A FUNCTION, NOT A CONSTANT. Those eight were module-scope `const`s, evaluated
 * while the static export prerenders — where there is no `window` — so the
 * production address was frozen into the bundle before a browser could say
 * where it was. Called at request time it answers for the page that is open.
 */

import { guest, team } from './host'
import { where } from '../host'

/** The gateway's origin, with no trailing slash: callers write `${api()}/v1/…`. */
export function api(): string {
  const set = where().api
  if (set) return set.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    // The shipped site is served from an origin the gateway already admits, so
    // there the absolute address stands and no proxy is involved. hanzo.team,
    // hanzo.bot and the Sites plane's `<slug>.hanzo.app` aliases serve this same
    // export and are admitted the same way; none of them has a /v1 of its own.
    if (host === 'hanzo.ai' || host.endsWith('.hanzo.ai') || team(host) || host === 'hanzo.bot' || guest(host))
      return 'https://api.hanzo.ai'
    return window.location.origin
  }
  return 'https://api.hanzo.ai'
}

/**
 * Identity, likewise once. IAM issues the bearer every call above carries and
 * is not reached through the API host, so it is a second address rather than a
 * path on the first. It is NOT proxied and does not need to be — hanzo.id
 * admits localhost on authorize, token and userinfo.
 *
 * `NEXT_PUBLIC_HANZO_IAM_URL` is the name — the one `.env.example` documents
 * and `AccountContext` already reads. `team.ts` read `NEXT_PUBLIC_HANZO_ID_URL`
 * instead, a name nothing sets, so pointing this app at another IAM would have
 * moved the account panel and left the invitation links behind on hanzo.id.
 * Two spellings of one setting are indistinguishable from a working one until
 * the day it is changed.
 */
export function iam(): string {
  return (where().iam || 'https://hanzo.id').replace(/\/+$/, '')
}

/**
 * The IAM application hanzo.ai signs people in through, and the one an invited
 * member joins through: the gateway admits it and IAM holds hanzo.ai's callbacks
 * on it. It is platform-owned, so its full id is `admin/<CLIENT>`.
 */
export const CLIENT = 'hanzo-app'
