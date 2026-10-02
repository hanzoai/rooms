'use client'

// Which preview tiers this identity may see.
//
// The rail offers Chat and Dev to everyone. The rooms after them — Inbox,
// Agents, Tasks, Drive — are behind a tier, and a tier opens for exactly three
// reasons, asked here and nowhere else:
//
//   1. A SUPERADMIN sees every tier. That is IAM's answer, read off the signed
//      membership set: its first entry is the org the account lives in, and a
//      SuperAdmin lives in the reserved `admin` org (hanzoai/authz Claims.Sudo).
//      A membership of `admin` held from another org confers nothing, and a
//      per-org `isAdmin` is a different, org-scoped question.
//
//   2. An ALPHA or BETA org sees its own tier. Whether an org is in a cohort is
//      a targeting decision that lives on the cloud, so it is asked of the cloud:
//      POST /v1/flags answers the feature flags in force for this identity, and
//      `tier.alpha` / `tier.beta` open their rooms.
//
//   3. A LOCALHOST BUILD sees every tier, because a room nobody can open is a
//      room nobody can work on. The check is the ORIGIN the page was served
//      from, not an env var and not a build flag: a deployed host can never
//      satisfy it however it is configured, so this cannot leak an unfinished
//      room into production by being set wrong somewhere.
//
//   4. Nothing else. Signed out, still loading, or on any error the answer is the
//      empty set: the rail shows Chat and Dev and nothing more. Failing closed is
//      the point — a stranger meets the product the landing page describes, and a
//      flags outage cannot leak an unfinished room into it.
//
// The per-account SETTING that hides a tier the reader is entitled to lives with
// the reader, not here — see `useHidden`. This answers what you MAY see; that
// answers what you have chosen to.

import { useEffect, useState } from 'react'
import { useIam, useOrganizations } from '@hanzo/iam/react'
import { api } from './api'
import { scope, superAdmin as isSuperAdmin } from './session'

export type Tier = 'alpha' | 'beta'

/** Every tier, for the callers that are entitled to all of them. */
const ALL: Tier[] = ['alpha', 'beta']

/**
 * Whether this page is being served from a developer's own machine.
 *
 * The ORIGIN, because it is the one fact a deployment cannot accidentally
 * acquire: no environment variable, no build flag and no misconfigured host
 * turns api.hanzo.ai into localhost. Loopback by both names, and the private
 * ranges a second machine on the same desk is reached by.
 *
 * READ AFTER MOUNT, never during the render that hydrates. The server has no
 * origin to look at and answers false, so a client that answered true on its
 * first pass rendered a different rail than the HTML it was hydrating and React
 * threw the tree away. It is a fact about the browser, and a fact only the
 * browser holds arrives in an effect.
 */
const local = (): boolean => {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host)
  )
}

export function useTiers(): Set<Tier> {
  const { user, accessToken } = useIam()
  const { organizations } = useOrganizations()
  const [flags, setFlags] = useState<Record<string, unknown>>({})
  const [here, setHere] = useState(false)
  const [superAdmin, setSuperAdmin] = useState(false)

  useEffect(() => setHere(local()), [])
  // IAM's answer off the token's own `orgs` claim (lib/auth/session), read after
  // mount like `local` so the first render matches the HTML it hydrates.
  useEffect(() => setSuperAdmin(isSuperAdmin()), [accessToken])
  const id = user?.id ?? user?.name ?? ''

  useEffect(() => {
    // A SuperAdmin needs no answer from the server, and a stranger has none to
    // ask for. Only a signed-in, non-admin identity consults /v1/flags.
    if (!id || superAdmin) {
      setFlags({})
      return
    }
    const ac = new AbortController()
    // The PostHog-shaped evaluate: a distinct_id and the person's org, answered
    // with `{ featureFlags: { … } }`. The bearer carries the principal, as on
    // every other read: no host the rooms are drawn on holds a session cookie
    // for the API, so a cookie alone was answered 403 on every page. A refusal
    // still falls to the empty set, the signed-out room — the safe direction.
    fetch(`${api()}/v1/flags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...scope() },
      body: JSON.stringify({ distinct_id: id, person_properties: { org: organizations[0]?.name } }),
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setFlags((body?.featureFlags as Record<string, unknown>) ?? {}))
      .catch(() => setFlags({}))
    return () => ac.abort()
  }, [id, superAdmin, organizations])

  // A platform admin, or a page served off a developer's own machine. Both see
  // every tier for the same reason: a room nobody can open is a room nobody can
  // work on.
  if (superAdmin || here) return new Set<Tier>(ALL)
  const tiers = new Set<Tier>()
  if (flags['tier.alpha'] === true) tiers.add('alpha')
  if (flags['tier.beta'] === true) tiers.add('beta')
  return tiers
}

const HIDDEN_KEY = 'hanzo.hidden-tiers'

/** The tiers this reader has chosen to hide, and the toggle that sets them.
 *
 * Entitlement is one question (`useTiers`), what you want to see is another. A
 * reader who may see a beta room can still put it away — the choice is theirs and
 * lives with them, in this browser, never on the server. It starts empty: you see
 * what you are entitled to until you say otherwise. */
export function useHidden(): [Set<Tier>, (tier: Tier) => void] {
  const [hidden, setHidden] = useState<Set<Tier>>(new Set())

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]') as Tier[]
      setHidden(new Set(saved))
    } catch {
      setHidden(new Set())
    }
  }, [])

  const toggle = (tier: Tier) =>
    setHidden((was) => {
      const next = new Set(was)
      next.has(tier) ? next.delete(tier) : next.add(tier)
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]))
      } catch {
        /* a browser that refuses storage keeps the choice for this session */
      }
      return next
    })

  return [hidden, toggle]
}
