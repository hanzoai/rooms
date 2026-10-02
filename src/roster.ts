'use client'

// Who is in the org, by account — the ONE place an author becomes a name.
//
// A message carries the team account that wrote it and nothing else: for a
// person that is their IAM user id (the OIDC `sub`, which team's account id
// equals), for an agent the user id the platform minted for it and publishes on
// `/v1/team/bots`. Two reads, one list, so the transcript, the roster column and
// the mention chips cannot disagree about what to call anybody.

import { useEffect, useState } from 'react'
import { useIam, useOrganizations } from '@hanzo/iam/react'
import { useAi } from './lib/ai'

/** One member of the org: a person, or an agent standing in the rooms. */
export interface Member {
  /** The account a message names as its author. */
  id: string
  name: string
  /** A saved picture, as a data URI. People only; an agent wears initials. */
  avatar?: string
  agent: boolean
}

/**
 * The org's members, or null while unknown.
 *
 * Needs a session and an org: both reads are org-scoped and answer 403 without
 * one. A service account carries no id and can author nothing, so it is not a
 * member here.
 */
export function useRoster(): { members: Member[] | null; wrong: unknown } {
  const { client } = useAi()
  const { isAuthenticated } = useIam()
  const { currentOrgId } = useOrganizations()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [wrong, setWrong] = useState<unknown>(null)

  useEffect(() => {
    if (!client || !isAuthenticated || !currentOrgId) return
    let live = true
    const stop = new AbortController()
    const { signal } = stop
    Promise.all([
      client.http.json<{
        users?: { id?: string; name: string; displayName?: string; avatar?: string }[]
      }>({ path: '/v1/iam/users', query: { owner: currentOrgId }, signal }),
      client.http.json<{ bots?: { id: string; name: string; userId: string; active: boolean }[] }>({
        path: '/v1/team/bots',
        signal,
      }),
    ])
      .then(([people, bots]) => {
        if (!live) return
        setMembers([
          ...(people.users ?? []).flatMap((one) =>
            one.id
              ? [{ id: one.id, name: one.displayName || one.name, avatar: one.avatar || undefined, agent: false }]
              : [],
          ),
          ...(bots.bots ?? []).map((one) => ({ id: one.userId, name: one.name, agent: true })),
        ])
      })
      .catch((e: unknown) => {
        if (live) setWrong(e)
      })
    return () => {
      live = false
      stop.abort()
    }
  }, [client, isAuthenticated, currentOrgId])

  return { members, wrong }
}

/** The member an author id names, or undefined for one the roster lacks. */
export const memberOf = (members: Member[] | null, id: string): Member | undefined =>
  members?.find((one) => one.id === id)

/**
 * The reader's own account, from the userinfo the session holds. OIDC names it
 * `sub`, and team's account id is that same uuid — so it is the id a room's
 * members list and a message's author carry for this reader.
 */
export function useMe(): string | null {
  const { user } = useIam()
  const sub = (user as { sub?: unknown } | null)?.sub
  return typeof sub === 'string' && sub ? sub : null
}
