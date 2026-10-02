'use client'

// What an agent can reach for, and what an account can connect.
//
// TWO READS, AND THEY ARE NOT THE SAME LIST. `/v1/tools/skills` is what THIS
// org's agents already know how to do, each with the flag saying whether it is
// switched on; `/v1/integrations/connectors/providers` is the catalogue of what
// a person could connect that they have not. One answers "use something", the
// other "connect something", which is why the menu has two rows and not one
// list with a mixed meaning in it.
//
// `/v1/tools/plugins` IS DELIBERATELY NOT HERE. It reads as the third row and
// is not: its own description says a plugin there is "MOUNTED CODE that extends
// the deployment's own surface — not a tool an agent calls — so this is an
// inventory and not a tool source". It answers what this deployment booted with,
// which is an operator's fact about the estate and not a thing a reader
// installs. Listing it under a reader's `+` would offer them subsystems to
// "use" that were never theirs to switch.
//
// A 403 HERE MEANS THE ACCOUNT, NOT THE ROUTE. Both paths are in the published
// schema at `/v1/openapi.json`; both refuse an unauthenticated caller with
// "a validated principal is required". Reading that as an empty list is how a
// pane tells somebody they have no skills when it simply never asked.
//
// READ ONCE PER DOCUMENT. The lists belong to the account, not the
// conversation, so switching channels must not re-ask — the cache below is
// keyed by path and holds the in-flight promise, so two menus opening at once
// make one request and a second open makes none.

import { useEffect, useState } from 'react'
import { useIam } from '@hanzo/iam/react'
import { say } from './failure'
import { api } from './lib/api'
import { scope } from './lib/session'

/** A skill an agent in this org can reach for. */
export interface Skill {
  name: string
  description: string
  /** Whether the org has switched it on. */
  activated: boolean
}

/** A service this account could connect. */
export interface Provider {
  id: string
  name: string
  description: string
  category: string
  /**
   * The intake paths this provider supports — `device`, `oauth`, `token`. At
   * least one, always. It is what decides whether a surface can offer to
   * connect it or only to name it.
   */
  methods: string[]
}

/**
 * An answer, or the reason there is none.
 *
 * `rows` and `trouble` both null is STILL READING, which is a third state and
 * not a missing one: drawing "nothing here" while the request is in flight is
 * the lie this shape exists to prevent.
 */
export interface Ask<T> {
  rows: T[] | null
  trouble: string | null
}

const READING: Ask<never> = { rows: null, trouble: null }

/** Answers held for this document, keyed by path. The promise is cached, not
 *  just the result, so concurrent askers share one request. */
const held = new Map<string, Promise<Ask<unknown>>>()

/** The token these answers were fetched for. Signing in or out drops them,
 *  because a list read as one account is not the next account's list. */
let asWho: string | null = null

function fetchOnce<T>(path: string, token: string, shape: (body: unknown) => T[]): Promise<Ask<T>> {
  if (asWho !== token) {
    held.clear()
    asWho = token
  }
  const already = held.get(path)
  if (already) return already as Promise<Ask<T>>

  const going = fetch(`${api()}${path}`, { headers: scope() })
    .then(async (r) => {
      if (!r.ok) {
        // The status is the fact; `say` turns it into the reader's sentence.
        throw Object.assign(new Error(`${r.status}`), { status: r.status })
      }
      return { rows: shape(await r.json()), trouble: null }
    })
    .catch((e: unknown) => {
      // A FAILED READ IS NOT CACHED. Holding it would mean a reader who signed
      // in, or whose network came back, keeps meeting the same stale refusal
      // until they reload the whole document.
      held.delete(path)
      return { rows: null, trouble: say(e, 'this account’s tools') }
    })

  held.set(path, going as Promise<Ask<unknown>>)
  return going as Promise<Ask<T>>
}

const OUT: Ask<never> = {
  rows: null,
  trouble: 'Sign in to see what your agents can reach for.',
}

/**
 * Reads one list, or explains why it could not.
 *
 * NOTHING IS SET FROM THE EFFECT'S BODY, and the two states that used to be
 * are DERIVED instead: signed out is a fact about this render, not an event to
 * record, and "still reading" is simply not yet holding an answer for the
 * question being asked. Setting either synchronously in an effect renders the
 * component twice for a value the first render already knew.
 *
 * The answer is STAMPED with the question it answers. Without that, a token
 * that changes leaves the previous account's rows on screen until the new read
 * lands — the reader sees somebody else's tools for a moment, and the fix used
 * to be a `setAnswer(READING)` in the effect body. Comparing the stamp says the
 * same thing with no extra render and no window where the two disagree.
 */
function useList<T>(path: string, shape: (body: unknown) => T[]): Ask<T> {
  const { isAuthenticated, accessToken } = useIam()
  const asking = `${path}|${accessToken ?? ''}`
  const [held, setHeld] = useState<{ asked: string; answer: Ask<T> } | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return
    let live = true
    void fetchOnce<T>(path, accessToken, shape).then((answer) => {
      if (live) setHeld({ asked: asking, answer })
    })
    return () => {
      live = false
    }
    // `shape` is a module constant at every call site; listing it would re-ask
    // on every render for a function that never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking, isAuthenticated, accessToken, path])

  if (!isAuthenticated || !accessToken) return OUT
  return held?.asked === asking ? held.answer : READING
}

const asSkills = (body: unknown): Skill[] => {
  const tools = (body as { tools?: unknown })?.tools
  if (!Array.isArray(tools)) return []
  return tools.map((t) => {
    const o = (t ?? {}) as Record<string, unknown>
    return {
      name: String(o.name ?? ''),
      description: String(o.description ?? ''),
      activated: o.activated === true,
    }
  })
}

const asProviders = (body: unknown): Provider[] => {
  const providers = (body as { providers?: unknown })?.providers
  if (!Array.isArray(providers)) return []
  return providers.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>
    return {
      id: String(o.id ?? ''),
      name: String(o.name ?? o.id ?? ''),
      description: String(o.description ?? ''),
      category: String(o.category ?? ''),
      methods: Array.isArray(o.methods) ? o.methods.map(String) : [],
    }
  })
}

/** What this org's agents already know how to do. */
export function useSkills(): Ask<Skill> {
  return useList('/v1/tools/skills', asSkills)
}

/** What this account could connect and has not. */
export function useProviders(): Ask<Provider> {
  return useList('/v1/integrations/connectors/providers', asProviders)
}
