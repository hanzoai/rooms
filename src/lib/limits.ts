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
import { api } from './api'
import { scope } from './session'

/** Reads the limits as whoever holds the bearer, in this browser's organization. */
export async function readLimits(signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${api()}/v1/ai/limits`, { headers: scope(), signal })
  if (!res.ok) throw Object.assign(new Error(`Limits answered ${res.status}`), { status: res.status })
  return res.json()
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
 * plan, or could not be read. A plan holder sees usage as shares, never money.
 */
export const spendShown = ({ limits, answered }: Pick<UseLimits, 'limits' | 'answered'>): boolean =>
  answered && !limits?.plan

/** Whether a model is a Hanzo SKU — an Enso or Zen id — the only models a consumer surface offers. */
export const sku = (id: string): boolean => /^(hanzo\/)?(enso|zen)/i.test(id)

/**
 * Whether a model can answer a chat turn: it names no outputs, or names text
 * among them. `zen-scribe` (a transcript) and `zen-voice-mini` (audio) are
 * Zen ids the catalog lists, and neither answers a question.
 */
export const chats = (model: { id: string; outputs?: unknown }): boolean =>
  !Array.isArray(model.outputs) || model.outputs.includes('text')
