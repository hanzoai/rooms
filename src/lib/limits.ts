'use client'

/**
 * WHAT A PLAN HOLDER HAS LEFT, AS A SHARE.
 *
 * A paid plan is a subscription with usage limits, never a debit from a
 * balance. `GET /v1/ai/limits` answers the acting org's plan and three
 * windows — the five-hour session, the day, and the billing month — each as
 * the percent USED with the moment it resets, and the next plan up. Shares
 * only: nothing here is a count of requests or an amount of money.
 *
 * The month is the plan's included usage for the period. Spending it refuses
 * nothing — Enso and Zen keep answering from free models — so it is a line
 * under the bars, never a refusal. The session and the day refuse when spent.
 *
 * `plan` "" is a caller with no plan (Free), and then nothing else is sent:
 * that reader keeps the Free display. A read that fails is `null`, which is not
 * knowing, and nothing is drawn from it.
 *
 * Same base URL and headers as every billing read (lib/hanzo/tier.ts): the
 * bearer is the subject and `X-Org-Id` the organization this browser works in.
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { scope } from './session'

/** One window: the percent of it used, and when it starts over. */
export interface Span {
  /** Used, 0–100. */
  percent: number
  /** RFC 3339, or null when no window is running — a session starts at the next request. */
  resets_at: string | null
}

export interface Limits {
  /** The plan slug ("max-20x"), or "" for a caller with no plan. */
  plan: string
  period_start?: string
  period_end?: string
  session?: Span
  day?: Span
  month?: Span
  /** The next plan's slug, "" at the top of the ladder. */
  upgrade?: string
}

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null)

function span(v: unknown): Span | undefined {
  const o = v as { percent?: unknown; resets_at?: unknown } | null | undefined
  const p = o?.percent
  if (typeof p !== 'number' || !Number.isFinite(p)) return undefined
  return { percent: Math.min(100, Math.max(0, Math.round(p))), resets_at: text(o?.resets_at) }
}

/**
 * The answer, checked field by field: it is a network response. A body without
 * a string `plan` is not an answer at all; a window without a numeric percent
 * is left out rather than drawn as full or empty.
 */
export function limitsOf(body: unknown): Limits | null {
  const o = body as Record<string, unknown> | null | undefined
  const plan = text(o?.plan)
  if (plan === null) return null
  if (plan === '') return { plan }
  return {
    plan,
    period_start: text(o?.period_start) ?? undefined,
    period_end: text(o?.period_end) ?? undefined,
    session: span(o?.session),
    day: span(o?.day),
    month: span(o?.month),
    upgrade: text(o?.upgrade) ?? '',
  }
}

/** Reads the limits as whoever holds the bearer, in this browser's organization. */
export async function readLimits(signal?: AbortSignal): Promise<Limits> {
  const res = await fetch(`${api()}/v1/ai/limits`, { headers: scope(), signal })
  if (!res.ok) throw Object.assign(new Error(`Limits answered ${res.status}`), { status: res.status })
  const got = limitsOf(await res.json())
  if (!got) throw Object.assign(new Error('Limits answered without a plan'), { status: 502 })
  return got
}

/**
 * The limits, held, and the way to read them again. `limits` is `null` until
 * answered, and after a refusal: a reader whose limits are unknown is drawn no
 * bars. `answered` says the first read has come back either way, so a surface
 * that shows something only to a reader with no plan waits for it.
 */
export function useLimits(
  enabled = true,
  org: string | null = null,
): { limits: Limits | null; answered: boolean; reload: () => void } {
  const [limits, setLimits] = useState<Limits | null>(null)
  const [answered, setAnswered] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const stop = new AbortController()
    readLimits(stop.signal)
      .then((got) => {
        if (!stop.signal.aborted) setLimits(got)
      })
      .catch(() => {
        if (!stop.signal.aborted) setLimits(null)
      })
      .finally(() => {
        if (!stop.signal.aborted) setAnswered(true)
      })
    return () => stop.abort()
  }, [enabled, nonce, org])

  return { limits, answered, reload: useCallback(() => setNonce((n) => n + 1), []) }
}

/**
 * Whether a reader's dollar spend may be shown: their limits came back and name no
 * plan, or could not be read. A plan holder sees usage as shares, never money.
 */
export const spendShown = ({ limits, answered }: { limits: Limits | null; answered: boolean }): boolean =>
  answered && !limits?.plan

/** What is left of a window, 0–100: the bar goes down as it is used. */
export const left = (s: Span): number => 100 - s.percent

/** Whether a model is a Hanzo SKU — an Enso or Zen id — the only models a consumer surface offers. */
export const sku = (id: string): boolean => /^(hanzo\/)?(enso|zen)/i.test(id)

/** A reset as a clock reads it in this browser — "17:00" — or '' for none. */
export function clock(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? '' : new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

/** A period's end as a sentence states it — "Oct 30, 2026" — or '' for none. Periods end on UTC days. */
export function date(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
}

/** A period's end without its year — "Oct 30" — for the month bar. */
export function day(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}
