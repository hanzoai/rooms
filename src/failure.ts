'use client'

// What to tell a reader when a room's store does not answer.
//
// The rooms used to print the error they caught, which on a store that is down
// reads "mount /v1/s3: no instance running". That says nothing a reader can act
// on — it names a mount and an instance, neither of which is theirs — and it
// puts the shape of the estate on a public page. The detail is still in the
// network tab, where the person who can act on it is looking.
//
// ONE FUNCTION, because every room owes the same three answers and three copies
// would drift into three vocabularies for one event.

import { told } from './lib/reach'

/**
 * THE STATUS, WHERE THE FAILURE CARRIES ONE.
 *
 * `@hanzo/ai`'s APIError publishes `status` as a number, and a number is a fact
 * — while the message beside it is prose the SDK is free to improve. It did:
 * 0.6.16 added a table answering 503 with "The service is not running right
 * now.", which reads the same to a person and matches none of the patterns
 * below, so every downed store fell through to the flat "Could not read" and
 * the rooms stopped saying that nothing had been lost. Reading the status first
 * is what makes this survive the next rewording.
 */
const status = (e: unknown): number | null => {
  const s = (e as { status?: unknown } | null | undefined)?.status
  return typeof s === 'number' && Number.isFinite(s) ? s : null
}

/** True where a failure is the store being absent rather than the reader. The
 *  text is still read, because a network failure raises before any status. */
const absent = (text: string): boolean =>
  /no instance running|not running|service unavailable|503|econnrefused|failed to fetch|network/i.test(
    text,
  )

/**
 * True where the answer was no, whoever said it.
 *
 * Three vocabularies for one event. The gateway says 401 "authentication
 * required" on a turn and 403 "a validated principal is required" on a read,
 * and the SDK raises before sending at all when it has no credential to send
 * with. A reader meets the same wall in every case, so all three read as one.
 */
const barred = (text: string): boolean =>
  /401|403|forbidden|unauthori[sz]ed|not authori[sz]ed|authentication required|validated principal|permission|serve anonymous|anonymous completions/i.test(
    text,
  )

/** Whether the store answered and the answer was no — exported so a surface can
 *  offer the way past a refusal rather than only describing it. */
export const refused = (error: unknown): boolean => {
  const code = status(error)
  if (code === 401 || code === 403) return true
  return barred(error instanceof Error ? error.message : String(error ?? ''))
}

/**
 * A sentence about `subject` — "your drive", "this board" — naming what a
 * reader can do next. Never the caught text: an error written for an operator
 * is not an answer for a reader.
 */
export function say(error: unknown, subject: string, act: 'read' | 'save' = 'read'): string {
  const text = error instanceof Error ? error.message : String(error ?? '')
  const code = status(error)
  // VERB FIRST, so the subject's number never has to agree with anything. Said
  // subject-first, "your projects is not answering" is what a plural name gets,
  // and every caller then has to remember to phrase its subject singular.
  if (code === 502 || code === 503 || code === 504 || absent(text))
    return `Could not reach ${subject}. Nothing has been lost — try again shortly.`
  if (code === 401 || code === 403 || barred(text))
    return act === 'save'
      ? `This account cannot change ${subject}.`
      : `This account cannot open ${subject}.`
  return act === 'save' ? `Could not save ${subject}.` : `Could not read ${subject}.`
}

/**
 * The reader's version of a failure, keeping what the store said when that is
 * an answer.
 *
 * A gateway that refuses over credit, a context that ran long, a model nobody
 * serves — each of those is the reader's own situation, stated by the only
 * thing that knows it, and translating them away would leave a room saying
 * nothing where it could have said the one useful thing. A gateway that is not
 * there, or one that refused the account, is the estate talking to itself; that
 * half is replaced.
 */
export function plainly(error: unknown, subject: string): string {
  const text = error instanceof Error ? error.message : String(error ?? '')
  return absent(text) || barred(text) ? say(error, subject) : told(error) ?? text
}

/**
 * The refusals a plan lifts, by the status each arrives with: a model the plan
 * does not include, and the Free plan's two limits — a person's own share of
 * the pool spent for the window, and the pool every free user shares used up.
 */
const LIFTED: Record<string, number> = {
  plan_required: 402,
  allowance_spent: 402,
  pool_busy: 429,
  pool_exhausted: 429,
}

/**
 * Whether a refusal asks for a plan, and the checkout it names.
 *
 * The gateway refuses a model the plan does not include with 402
 * `plan_required`, a Free caller whose share is spent with 402
 * `allowance_spent`, and a free request the shared pool cannot serve with 429
 * `pool_busy` or `pool_exhausted`, each with an `upgrade_url`. The code decides,
 * never the sentence. The address is kept only when it is an https page on
 * hanzo.ai or one of its hosts; any other leaves `href` empty and the caller
 * builds its own.
 */
export function planRequired(error: unknown): { href?: string } | null {
  const said = ((error as { body?: unknown } | null)?.body as { error?: { code?: unknown; upgrade_url?: unknown } } | null)?.error
  const code = typeof said?.code === 'string' ? said.code : ''
  if (!LIFTED[code] || status(error) !== LIFTED[code]) return null
  return { href: ours(said?.upgrade_url) }
}

/** A plan holder's spent window. */
export interface Cap {
  limit: 'session' | 'day'
  /** When it opens again, RFC 3339. */
  resets: string | null
  /** The next plan's checkout, on hanzo.ai only. Absent at the top plan. */
  href?: string
}

/**
 * Whether a refusal is a plan's usage limit, and which window.
 *
 * A paid plan is a subscription with limits: a spent session or day comes back
 * 429 `usage_cap_exceeded` naming the window, its reset and, below the top
 * plan, an `upgrade_url`. The month refuses nothing — Enso and Zen keep
 * answering — so no other window is a cap. The code decides, never the
 * sentence, and the address is kept by the rule `planRequired` keeps.
 */
export function capped(error: unknown): Cap | null {
  const said = ((error as { body?: unknown } | null)?.body as { error?: { code?: unknown; limit?: unknown; resets_at?: unknown; upgrade_url?: unknown } } | null)?.error
  if (said?.code !== 'usage_cap_exceeded' || status(error) !== 429) return null
  if (said.limit !== 'session' && said.limit !== 'day') return null
  return { limit: said.limit, resets: typeof said.resets_at === 'string' ? said.resets_at : null, href: ours(said.upgrade_url) }
}

function ours(href: unknown): string | undefined {
  if (typeof href !== 'string') return undefined
  try {
    const url = new URL(href)
    const host = url.hostname
    return url.protocol === 'https:' && (host === 'hanzo.ai' || host.endsWith('.hanzo.ai')) ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** The family a model id belongs to, as a reader knows it, or '' for one outside them. */
export const familyOf = (id: string): string =>
  /^(hanzo\/)?enso/i.test(id) ? 'Enso' : /^(hanzo\/)?zen/i.test(id) ? 'Zen' : ''

/** What the server said about a failure, for the detail folded under the plain line. */
export const detail = (error: unknown): string => told(error) ?? (error instanceof Error ? error.message : String(error ?? ''))
