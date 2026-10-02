'use client'

// The two writes the `+` menu makes.
//
// SEPARATE FROM `tools.ts` BECAUSE READING AND WRITING ARE DIFFERENT JOBS: the
// lists are cached for the document and shared by every menu that opens, and a
// write is a one-shot with an answer the caller acts on. Braiding them would
// put a cache invalidation inside a button press.
//
// BOTH SHAPES ARE THE PUBLISHED ONES, read off `/v1/openapi.json` rather than
// guessed: activation takes `{activate,deactivate}` arrays and answers with the
// resulting `enabled` set, and a device sign-in answers with the code to show
// and the page to show it at. Neither invents a field.

import { bearer, scope } from './lib/session'
import { api } from './lib/api'

/**
 * A call that carries the session, or refuses before it is made.
 *
 * NO TOKEN IS A REFUSAL, NOT AN ANONYMOUS ATTEMPT. Both of these routes are
 * org-scoped and answer "a validated principal is required"; sending anyway
 * spends a round trip to be told what we already knew, and returns a 403 the
 * caller then has to translate back into "sign in".
 */
async function ask<T>(path: string, body: unknown): Promise<T> {
  const token = bearer()
  if (!token) throw new Error('Sign in to change this.')
  const r = await fetch(`${api()}${path}`, {
    method: path.endsWith('/activation') ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', ...scope() },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw Object.assign(new Error(`${r.status}`), { status: r.status })
  return (await r.json()) as T
}

/**
 * Switches one skill on or off for the caller's org and project, and answers
 * with the whole resulting set.
 *
 * THE ANSWER IS THE SET, NOT AN ACKNOWLEDGEMENT, which is why the caller
 * replaces its state with what comes back rather than flipping its own flag: an
 * activation that was refused, clamped, or changed by somebody else in another
 * tab is visible in the reply and invisible in an optimistic toggle.
 */
export async function activate(name: string, on: boolean): Promise<string[]> {
  const done = await ask<{ enabled?: string[] }>(
    '/v1/tools/activation',
    on ? { activate: [name] } : { deactivate: [name] },
  )
  return done.enabled ?? []
}

/** What a device sign-in needs from the reader. */
export interface Device {
  /** The short code they type at {@link Device.verifyUrl}. */
  userCode: string
  verifyUrl: string
  /** The id this flow is polled with, which the pane does not do — see below. */
  flow: string
}

/**
 * Begins a device sign-in for one provider.
 *
 * THE PANE STARTS IT AND DOES NOT WATCH IT. Polling belongs where the result is
 * used — the connector appears in the Directory's own list, which reads
 * `/v1/integrations/connectors` — and a menu that closes the moment the reader
 * leaves for the provider's page has nowhere to put a result anyway. Starting
 * the flow, showing the code and opening the page is the whole of this control's
 * job; `flow` is returned so a surface that does want to watch has the id.
 */
export async function startDevice(provider: string): Promise<Device> {
  const begun = await ask<Partial<Device>>(
    `/v1/integrations/connectors/${encodeURIComponent(provider)}/device`,
    {},
  )
  if (!begun.userCode || !begun.verifyUrl) throw new Error('This service did not start a sign-in.')
  return { userCode: begun.userCode, verifyUrl: begun.verifyUrl, flow: begun.flow ?? '' }
}
