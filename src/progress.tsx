'use client'

// How far a run has got. ONE bar, for every surface that shows one.
//
// THE FIELD IS NOT SERVED YET, and that is the whole reason this reads the way
// it does. Measured against the local cloud on 2026-08-27: `GET
// /v1/agents/sessions` and `GET /v1/agents/sessions/{id}` both answer 26 fields
// and none of them is `progress`, `/v1/openapi.json`'s `sessionView` and
// `sessionDetail` schemas carry no such property, and `@hanzo/ai` 0.6.7's
// `Session` interface does not declare one. (`progressView` in that document is
// a CRM journey checklist — done/total/percent/next — and is a different thing
// wearing a similar word.)
//
// So this draws NOTHING today, and lights up the moment the field arrives with
// no further change here. It never substitutes a zero for an absent number: a
// run whose progress is unknown gets no bar, and a run that reports a phase but
// no percentage gets the track and the word without a fill. A 0% bar and an
// unknown one look identical to a reader and mean opposite things.
//
// It is NOT `@hanzo/ui`'s `Progress`, and the reason is that component's own
// first line: "determinate bar; `value` is 0-100". It cannot say "running, and
// I do not know how far", which is the state a run is in most of the time.
// Wrapping it would mean passing 0 for unknown — the exact lie above.

import type { ReactNode } from 'react'
import type { Session, SessionDetail } from '@hanzo/ai'
import { Text, XStack, YStack } from '@hanzo/ui'

/**
 * What a run says about how far it has got.
 *
 * `pct` is ABSENT when unknown — never 0 — and `estimated` says whether the
 * number was derived rather than reported by the run itself, which is a fact a
 * reader is owed before they plan around it.
 */
export interface Progress {
  /** 0–100. Absent means unknown. */
  pct?: number
  /** The stage it is in — the coarse answer. */
  phase?: string
  /** What it is doing inside that stage — the fine one. */
  activity?: string
  /** When the run last said so, RFC3339. */
  at?: string
  /** The percentage was derived, not self-reported. */
  estimated?: boolean
}

/**
 * Read it off a session, whatever the SDK's type currently declares.
 *
 * The narrowing lives HERE and nowhere else — one cast at the boundary, in the
 * one file that knows the shape — so the day `@hanzo/ai` declares the field,
 * this function loses its cast and nothing else in the app changes.
 *
 * Every field is checked rather than trusted: this is a network response, and
 * `pct` in particular is refused unless it is a finite number in range. A NaN
 * reaching a width would render as a bar of no width, which is a zero again.
 */
export function progressOf(run: Session | SessionDetail | null | undefined): Progress | null {
  const held = (run as { progress?: unknown } | null | undefined)?.progress
  if (!held || typeof held !== 'object') return null
  const { pct, phase, activity, at, estimated } = held as Record<string, unknown>
  const out: Progress = {}
  if (typeof pct === 'number' && Number.isFinite(pct) && pct >= 0 && pct <= 100) out.pct = pct
  if (typeof phase === 'string' && phase) out.phase = phase
  if (typeof activity === 'string' && activity) out.activity = activity
  if (typeof at === 'string' && at) out.at = at
  if (estimated === true) out.estimated = true
  // A progress object saying nothing is nothing.
  return out.pct === undefined && !out.phase && !out.activity ? null : out
}

/** The words under the bar: the stage, then what it is doing in it. */
const words = (p: Progress): string =>
  [p.phase, p.activity].filter(Boolean).join(' — ')

/**
 * The bar.
 *
 * `role="progressbar"` with NO `aria-valuenow` is the standard way to say
 * indeterminate, and `aria-busy` says the work is still going. Setting
 * `aria-valuenow={0}` for an unknown percentage is the same lie in the
 * accessibility tree that an empty fill would be on screen.
 */
export function Bar({
  run,
  label = true,
}: {
  run: Session | SessionDetail | null | undefined
  /** Draw the phase and the percentage under the track. */
  label?: boolean
}): ReactNode {
  const p = progressOf(run)
  if (!p) return null

  const said = words(p)
  const known = p.pct !== undefined

  return (
    <YStack
      gap="$1"
      width="100%"
      role="progressbar"
      aria-busy={!known}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p.pct}
      aria-label={said || 'Progress'}
    >
      <XStack
        height={4}
        width="100%"
        rounded="$10"
        bg="$edge"
        overflow="hidden"
      >
        {/* No fill at all when the extent is unknown. The track alone, beside
            the phase, reads as "going" — a sliver at zero reads as "stuck". */}
        {known ? (
          <YStack height={4} width={`${p.pct}%`} rounded="$10" bg="$ink" />
        ) : null}
      </XStack>

      {label && (said || known) ? (
        <XStack gap="$2" items="baseline" minW={0}>
          {said ? (
            <Text fontSize="$1" color="$soft" numberOfLines={1} shrink={1}>
              {said}
            </Text>
          ) : null}
          {known ? (
            // The tilde is the estimate. A derived number printed like a
            // reported one is a claim the run never made.
            <Text fontSize="$1" color="$soft">
              {p.estimated ? '~' : ''}
              {Math.round(p.pct as number)}%
            </Text>
          ) : null}
        </XStack>
      ) : null}
    </YStack>
  )
}
