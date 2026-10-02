/**
 * What the home reads, and the two reads `@hanzo/ai` publishes no hook for.
 *
 * Sessions, agents, threads and people all have hooks — the home uses those and
 * adds nothing. Projects and connected apps do not, so they go through the
 * client's own transport (`client.http`, which the SDK exposes for exactly
 * this) rather than a second fetch stack with a second answer about who the
 * bearer is.
 *
 * EVERY READER ANSWERS `null` FOR UNKNOWN. An empty array is a fact — the org
 * has none — and a failed or unmade request is not that fact. Collapsing the
 * two is how a card comes to say "0 projects" about a question nobody asked.
 */

import type { AiClient } from '@hanzo/ai'
import { site } from '../host'

/** A site the org has deployed. */
export interface Project {
  slug: string
  name?: string
  /** Where it serves, when it is serving. */
  liveUrl?: string
  /** Unix seconds. */
  updatedAt?: number
}

/** A service the org can connect, and whether it has. */
export interface App {
  id: string
  name: string
  connected?: boolean
}

/**
 * Where a teammate is invited.
 *
 * IAM owns invitations and `@hanzo/iam` publishes no method that sends one, so
 * the invite LEAVES this surface for hanzo.id's own org members page rather
 * than this site growing an invite backend of its own. `Shell.tsx` states the
 * same address privately; it should read this one.
 */
/**
 * WHERE A TEAMMATE IS ACTUALLY ADDED.
 *
 * It pointed at the account settings of the identity service, which is a
 * different question with a similar name: that page is where a person edits
 * THEMSELVES, so pressing Invite people took you off this site and showed you
 * your own settings. This page issues the invitation — it mints the single-use
 * code, files it against the org, and hands back the link to send — so the
 * control and its verb are the same thing again.
 *
 * A PATH, not a URL. It is a page of this app, so it is reached the way every
 * other page of this app is, and the three doors that offer it (the empty
 * room's tile, the Create menu, the sidebar's row) all read this one line.
 */
export const invite = (): string => site('/account/organization')

/** The org's projects, newest first. */
export async function projects(client: AiClient, signal?: AbortSignal): Promise<Project[]> {
  const rows = await client.http.json<Project[]>({ path: '/v1/projects', signal })
  if (!Array.isArray(rows)) return []
  return [...rows].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

/**
 * Every app the platform can connect, carrying whether this org has.
 *
 * The route answers the whole catalogue — connected and not — so the caller
 * counts rather than being told a number.
 */
export async function apps(client: AiClient, signal?: AbortSignal): Promise<App[]> {
  const out = await client.http.json<{ providers?: App[] }>({ path: '/v1/integrations', signal })
  return out?.providers ?? []
}
