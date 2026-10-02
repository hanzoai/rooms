'use client'

// WHAT ARRIVED, IN ONE LIST.
//
// The messages other networks carry in (`/v1/channels/inbox`, read by
// `@hanzo/ai`'s `useInbox`), as the Inbox lists them. A room of this platform
// is not an arrival: it is a place the org talks in, read and answered on
// /home (`rooms.ts`), and each kind keeps its own reader because a thread you
// REPLY to and a room you POST into are not the same act.
//
// `key` is the ONE id the workspace selects by, and it names its own source:
// `net:<channel> <roomId>` here, `team:<space>/<id>` for a room. Prefixed
// rather than hashed, because a key a person can read in a URL is one they can
// report in a bug, and a lookup that misses is a bug rather than a category.

import { useMemo } from 'react'
import { useInbox } from '@hanzo/ai/react'
import type { AiClient, Thread } from '@hanzo/ai'
import type { Member } from './roster'
import { roster } from './cast'

/** What to call a member in a room. The roster carries one name; this is it. */
const label = (m: Member): string => m.name

/** "Ada", "Ada and Mel", "Ada, Mel and Sam". */
const named = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** An arrival room, as `@hanzo/ai` groups one. Named so this file can speak of
 *  it without every caller importing the hook's return type. */
type Arrival = ReturnType<typeof useInbox>['rooms'][number]

/** One conversation another network carries. */
export interface Conversation {
  key: string
  /** What to call it in a list. */
  title: string
  /** The network it arrived on. */
  channel: string
  /** Unix MILLIseconds of the last thing said. The arrival plane stamps
   *  SECONDS, and this is the one place that is reconciled. */
  lastAt: number
  /** The last thing said, on one line. */
  preview: string
  arrival: Arrival
}

/** The key for an arrival. `useInbox` already keys a room; this qualifies it. */
export const netKey = (arrival: Arrival): string => `net:${arrival.key}`

/**
 * Every conversation this reader has been sent, newest first.
 *
 * The read already runs in this workspace; this shapes it rather than fetching
 * anything of its own, so the list costs no request that was not already made.
 */
export function useConversations(): {
  conversations: Conversation[]
  loading: boolean
  reload: () => void
} {
  const { rooms: arrivals, loading, reload } = useInbox({ limit: 100 })

  const conversations = useMemo(
    () =>
      arrivals
        .map((arrival) => ({
          key: netKey(arrival),
          // The handle we hold, which is the only thing that tells two senders
          // on one network apart. See Inbox's `speaker`.
          title: arrival.last.sender ? `@${arrival.last.sender}` : arrival.channel,
          channel: arrival.channel,
          lastAt: arrival.lastAt * 1000,
          preview: arrival.last.text,
          arrival,
        }))
        // Newest first, then by title, so two identical reads order the same.
        .sort((a, b) => b.lastAt - a.lastAt || a.title.localeCompare(b.title)),
    [arrivals],
  )

  return { conversations, loading, reload }
}

/** The conversation with that key, or null for none open. */
export function conversationOf(all: Conversation[], key: string | null): Conversation | null {
  return key ? (all.find((one) => one.key === key) ?? null) : null
}

// ── Starting one, and when one last named someone ──────────────────────────
//
// These came across the rewrite of how rooms are READ, because they are not
// about reading: `start` opens a conversation with people the directory picked,
// and `spokenAt` says when one last named a person, which is how the directory
// sorts. `Member` belongs to the roster now, so they take it from there.

export const opening = (members: Member[]): string => `With ${named(members.map(label))}`

/**
 * Writes the room and answers its id.
 *
 * The agents in it go in AHEAD of the opening line as the roster turn
 * (cast.tsx `roster`), which is how a conversation keeps who is in it: /chat
 * seats that room when the thread opens and reads each agent's brief fresh.
 * One agent, several, people, or a mix: all open by this one call.
 */
export async function start(ai: AiClient, members: Member[]): Promise<string> {
  if (members.length === 0) throw new Error('A conversation needs somebody in it.')
  const agents = members.filter((one) => one.agent).map((one) => one.name)
  const id = await ai.threads.record([
    ...(agents.length ? [{ role: 'system', content: roster(agents) }] : []),
    { role: 'user', content: opening(members) },
  ])
  // `record` answers "" where the body carried no id, which is a write that did
  // not happen — never a room to open.
  if (!id) throw new Error('The conversation store answered without an id.')
  return id
}

/**
 * When a conversation last named them, in unix milliseconds, or 0 for never.
 *
 * The title is the only place a member is written down, so this is what
 * "recently" can honestly mean about a contact. The day a thread carries its
 * members, this reads them instead.
 */
export function spokenAt(threads: Thread[], label: string): number {
  let last = 0
  for (const one of threads) {
    if (!one.title?.includes(label)) continue
    const at = one.updatedAt ? new Date(one.updatedAt).getTime() : 0
    if (at > last) last = at
  }
  return last
}
