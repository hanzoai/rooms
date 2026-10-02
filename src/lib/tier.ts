'use client'

/**
 * WHAT THIS ACCOUNT IS ON, AND WHAT IT MAY SPEND.
 *
 * Two reads, one question each. `GET /v1/billing/tier` names the plan and its
 * term. `GET /v1/billing/balance` is the money: it reads the ledger the model
 * gate admits against and every metered call is debited from, so its
 * `available` is the one figure a person's spend is compared to. The tier's own
 * `effectiveAvailable` is computed from commerce's store, which a top-up reaches
 * and a usage debit does not, so it stays at the top-up after the ledger has
 * spent it — and for the ecosystem orgs it is a $1,000 floor the gate never
 * reads. The balance replaces it here; nothing adds the two.
 *
 * WHAT IT DOES NOT DO IS GUESS. The server answers 502 rather than 0 for a
 * balance it could not read — "unknown is not broke" — and this keeps that
 * distinction all the way to the screen: a failed read resolves to an error, an
 * error renders as a sentence, and no path in this file produces a number that
 * did not come from a response.
 *
 * The failure carries `status` because that is what `workspace/failure.ts`
 * reads first, so a refusal here already speaks the vocabulary every room uses.
 * A second Refusal class would be a second vocabulary for the same event.
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { bearer, org, orgs, scope } from './session'
import { list } from './list'
import { money } from './plans'
import { date } from './limits'

/** The plan, as billing names it. */
export interface TierLimits {
  name: string
  displayName: string
  dailyCreditsCents: number
  maxAgents: number
  /** MaxAgents 0 means "no ceiling" rather than "no agents" — the reading a
   *  bare zero cannot carry. The server publishes it because the zero is
   *  ambiguous, so nothing here re-derives it. */
  unlimitedAgents: boolean
  allowedModels?: string[]
}

/** Whole USD cents, every field. */
export interface TierBalance {
  currency: string
  prepaidAvailable: number
  creditsRemaining: number
  dailyRemaining: number
  /** THE ONE FIGURE TO COMPARE AGAINST ZERO: the ledger's `available`, which
   *  `readTier` states from GET /v1/billing/balance. */
  effectiveAvailable: number
  /** The account that figure is the balance OF, as billing resolved the payer —
   *  the org's own pool, or a member's wallet inside it. Never derived here. */
  account?: string
}

/** A rate term — "10 requests per minute, 3 left, resets at …". */
export interface TierWindow {
  span: string
  limit: number
  used: number
  remaining: number
  resets: string
}

export interface Tier {
  user: string
  /** The catalog rung the subject is served as — a plan slug like "max-20x",
   *  or "" where the account holds no subscription. `tier` is the coarser
   *  class (free/dev/enterprise) that slug is served under; this is the row
   *  `lib/plans.ts` names, and the one a menu should print. */
  plan: string
  tier: TierLimits
  balance: TierBalance
  windows?: TierWindow[]
}

/** An error that names the status, for `say()` to turn into a sentence. */
const refusal = (status: number, message: string): Error =>
  Object.assign(new Error(message), { status })

/** GETs `path` as whoever holds the bearer, in this browser's organization. */
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${api()}${path}`, {
    headers: scope(),
    signal,
  })
  if (!res.ok) {
    // The body is RFC 7807 here — `detail` is the server's own sentence, which
    // is better than any rewording of it. Where there is none, the status is
    // still a fact and `say()` knows what to do with it.
    let detail = ''
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? ''
    } catch {
      // an HTML error page proves nothing worth showing
    }
    throw refusal(res.status, detail || `Billing answered ${res.status}`)
  }
  return (await res.json()) as T
}

/** Reads the tier and the balance for whoever holds the bearer. The requests
 *  name no subject — the credential is the scope — so there is no id to get wrong. */
export async function readTier(signal?: AbortSignal): Promise<Tier> {
  const token = bearer()
  if (!token) throw refusal(401, 'Sign in to see your plan')
  const [data, ledger] = await Promise.all([
    read<Tier>('/v1/billing/tier', signal),
    read<{ available: number; account?: string }>('/v1/billing/balance', signal),
  ])
  data.balance = { ...data.balance, effectiveAvailable: ledger.available, account: ledger.account }
  return data
}

/**
 * Whether a tier answer is a paid plan: billing names a paid plan the account's
 * subscription is on, or serves it a paid tier — `pro`, which a plan recorded
 * outside checkout confers, or `enterprise` (the platform org, a partner org).
 * A trial nobody paid for is `starter` and names no plan.
 */
export function paid(t: { plan?: string; tier?: { name?: string } } | null | undefined): boolean {
  return Boolean((t?.plan && t.plan !== 'free') || t?.tier?.name === 'pro' || t?.tier?.name === 'enterprise')
}

/** A plan the org subscribes to, as GET /v1/billing/subscriptions lists it. Money in whole cents. */
export interface Subscription {
  id: string
  status: string
  quantity: number
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  plan: { id: string; name: string; price: number; currency: string; interval: string }
}

/** The states in which a subscription is the plan the org is on. */
const LIVE: ReadonlySet<string> = new Set(['active', 'trialing'])

/**
 * The org's live subscription, or null where it holds none — being on no plan
 * is an answer, and a refusal is not: that throws, the way the tier read does.
 */
export async function readSubscription(signal?: AbortSignal): Promise<Subscription | null> {
  const got = await read<{ subscriptions?: unknown }>('/v1/billing/subscriptions', signal)
  return list<Subscription>(got?.subscriptions).find((s) => LIVE.has(s?.status) && typeof s?.plan?.price === 'number') ?? null
}

/**
 * The term as a sentence: "$200/month subscription, renews Oct 30, 2026". The
 * price is per seat, so it is the seats times it; a cancelled term ends rather
 * than renews.
 */
export function renewal(s: Subscription): string {
  const each = money((s.plan.price * Math.max(1, s.quantity || 1)) / 100)
  const when = date(s.currentPeriodEnd)
  return `${each}/${s.plan.interval || 'month'} subscription${when ? `, ${s.cancelAtPeriodEnd ? 'ends' : 'renews'} ${when}` : ''}`
}

/** The live subscription, held: null while unknown, refused, or on no plan. */
export function useSubscription(enabled = true, org: string | null = null): Subscription | null {
  const [sub, setSub] = useState<Subscription | null>(null)
  useEffect(() => {
    if (!enabled) return
    const stop = new AbortController()
    readSubscription(stop.signal)
      .then((got) => {
        if (!stop.signal.aborted) setSub(got)
      })
      .catch(() => {
        if (!stop.signal.aborted) setSub(null)
      })
    return () => stop.abort()
  }, [enabled, org])
  return sub
}

/** How long a sign-in waits on billing before it offers the plans. */
const PATIENCE = 5000

/** `signal`, cut off at PATIENCE, on a browser that can combine the two; else PATIENCE alone. */
function within(signal?: AbortSignal): AbortSignal | undefined {
  const limit = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(PATIENCE) : undefined
  if (!signal || !limit) return limit ?? signal
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, limit]) : limit
}

/**
 * Whether this account pays for a plan where it works: in the organization it
 * acts in, or, before it has picked one, in any organization its token names.
 * A read that fails or takes longer than PATIENCE counts as no plan, so the
 * plans are offered rather than the app withheld. At most ten organizations
 * are asked.
 */
export async function paying(signal?: AbortSignal): Promise<boolean> {
  const token = bearer()
  if (!token) return false
  const acting = org()
  const where: (string | null)[] = acting ? [acting] : orgs().slice(0, 10)
  const reads = await Promise.allSettled(
    (where.length ? where : [null]).map(async (o) => {
      const res = await fetch(`${api()}/v1/billing/tier`, {
        headers: { Authorization: `Bearer ${token}`, ...(o ? { 'X-Org-Id': o } : {}) },
        signal: within(signal),
      })
      return res.ok ? ((await res.json()) as Tier) : null
    }),
  )
  return reads.some((r) => r.status === 'fulfilled' && paid(r.value))
}

/**
 * The tier, held. `null` while unknown — which is BOTH "still asking" and
 * "asked and was refused", so `wrong` is kept beside it rather than swallowed:
 * a row cannot choose between saying nothing and saying why without it.
 */
export function useTier(enabled = true, org: string | null = null): {
  tier: Tier | null
  wrong: unknown
  reload: () => void
} {
  const [tier, setTier] = useState<Tier | null>(null)
  const [wrong, setWrong] = useState<unknown>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const stop = new AbortController()
    setWrong(null)
    readTier(stop.signal)
      .then((got) => {
        if (!stop.signal.aborted) setTier(got)
      })
      .catch((e: unknown) => {
        if (!stop.signal.aborted) {
          setTier(null)
          setWrong(e)
        }
      })
    return () => stop.abort()
  }, [enabled, nonce, org])

  return { tier, wrong, reload: useCallback(() => setNonce((n) => n + 1), []) }
}

/**
 * Whether an organization is its owner's personal one, off IAM's own row.
 *
 * The token's `orgs` claim names an organization and the reader's role in it
 * and says nothing of its kind; IAM keeps that on the row (`isPersonal`), and
 * `GET /v1/iam/organizations` answers the rows the caller belongs to. `null`
 * until it is answered for this organization. A refusal reads as `false`, so a
 * room that needs a plan goes on asking for one.
 */
export function usePersonal(org: string | null, enabled = true): boolean | null {
  const [read, setRead] = useState<{ org: string; personal: boolean } | null>(null)

  useEffect(() => {
    if (!enabled || !org) return
    const stop = new AbortController()
    fetch(`${api()}/v1/iam/organizations?${new URLSearchParams({ q: org })}`, {
      headers: scope(),
      signal: stop.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { organizations?: unknown } | null) => {
        const row = list<{ name?: string; isPersonal?: boolean }>(body?.organizations).find((o) => o?.name === org)
        if (!stop.signal.aborted) setRead({ org, personal: Boolean(row?.isPersonal) })
      })
      .catch(() => {
        if (!stop.signal.aborted) setRead({ org, personal: false })
      })
    return () => stop.abort()
  }, [enabled, org])

  return read && read.org === org ? read.personal : null
}
