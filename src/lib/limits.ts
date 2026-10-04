'use client'

/**
 * The plan's usage, as @hanzo/ui holds it: `GET /v1/ai/limits` read as whoever
 * holds the bearer in this browser's organization, kept current by every AI
 * call `observed` (lib/served.ts) hands to `observe`. Shares only.
 *
 * Same base URL and headers as every billing read (lib/hanzo/tier.ts): the
 * bearer is the subject and `X-Org-Id` the organization this browser works in.
 */

import { useLimits as useHeld, type UseLimits } from '@hanzo/ui/product/useLimits'
import { paidPlan } from '@hanzo/ui/product/limits'
import { api } from './api'
import { scope } from './session'

/** Reads the limits as whoever holds the bearer, in this browser's organization. */
export async function readLimits(signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${api()}/v1/ai/limits`, { headers: scope(), signal })
  if (!res.ok) throw Object.assign(new Error(`Limits answered ${res.status}`), { status: res.status })
  return res.json()
}

/**
 * The org's choice to keep paying from credits once included usage runs out —
 * `PUT /v1/ai/limits`, org admins only. A refusal throws with the server's own
 * words, so the reader is told why.
 */
export async function setCreditsAfterAllowance(on: boolean): Promise<void> {
  const res = await fetch(`${api()}/v1/ai/limits`, {
    method: 'PUT',
    headers: { ...scope(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ creditsAfterAllowance: on }),
  })
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } | string; message?: unknown } | null
  const said = typeof body?.error === 'string' ? body.error : typeof body?.error?.message === 'string' ? body.error.message : typeof body?.message === 'string' ? body.message : ''
  throw Object.assign(new Error(said || (res.status === 403 ? 'Only an organization admin can turn on credits.' : `Credits answered ${res.status}`)), { status: res.status })
}

/**
 * The limits for a signed-in reader, in organization `org`; `name` turns a
 * fallback model id into the name the reader knows. Signed out reads nothing,
 * and still hears a refusal from a served call.
 */
export const useLimits = (enabled = true, org: string | null = null, name?: (id: string) => string): UseLimits =>
  useHeld(enabled ? readLimits : null, org, name)

/**
 * Whether a reader's dollar spend may be shown: their limits came back and name no
 * paid plan, or could not be read. A plan holder sees usage as shares, never money.
 */
export const spendShown = ({ limits, answered }: Pick<UseLimits, 'limits' | 'answered'>): boolean =>
  answered && !paidPlan(limits)

export { paidPlan }

/** Whether a catalog family is one of Hanzo's chat families, Enso or Zen, whose turns carry the live web. */
export const house = (family: string | undefined): boolean => family === 'enso' || family === 'zen'

/**
 * Whether a model can answer a chat turn: it names no outputs, or names text
 * among them. `zen-scribe` (a transcript) and `zen-voice-mini` (audio) are
 * Zen ids the catalog lists, and neither answers a question.
 */
export const chats = (model: { id: string; outputs?: unknown }): boolean =>
  !Array.isArray(model.outputs) || model.outputs.includes('text')
