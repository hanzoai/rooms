'use client'

// Support mode: a SuperAdmin steps into any organization to see what it sees.
//
// Everything here is IAM's. The list is IAM's organization list, which answers a
// SuperAdmin every organization and anyone else only their own; the step in and
// the step out are IAM's `assume` and `release`, which answer the operator's own
// token re-scoped and record each step in the organization's audit log
// (lib/auth/session.ts `support`). This file only draws them, and only for the
// person IAM signs as a SuperAdmin (`superAdmin`); nothing here decides who may.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, View, XStack, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { X } from 'lucide-react'
import { useHydrated } from './lib/hydrated'
import { api } from './lib/api'
import { abandon, assumed, bearer, named, support } from './lib/session'
import { BAD, mix } from './lib/mix'

/** The banner rides above the room's sheets, the picker between them. gui carries a `calc()` to the page unchanged;
 *  its types only name custom properties. */
const BANNER = 'calc(var(--z-modal) + 30)' as `var(--${string})`
const DIALOG = 'calc(var(--z-modal) + 20)' as `var(--${string})`
const SCRIM = mix('var(--pure-black)', 28, 'srgb')

const muted = 'var(--muted-foreground)'

/** One organization as IAM's list answers it. */
interface Organization {
  name: string
  displayName?: string
}

/** One page of IAM's organization list and the cursor that continues it. */
interface Page {
  organizations?: Organization[]
  cursor?: string
}

/** A page of IAM's organization list: `q` narrows it, `cursor` continues it. */
async function page(q: string, cursor: string): Promise<Page> {
  const query = new URLSearchParams({ limit: '20' })
  if (q.trim()) query.set('q', q.trim())
  if (cursor) query.set('cursor', cursor)
  const res = await fetch(`${api()}/v1/iam/organizations?${query}`, {
    headers: { Authorization: `Bearer ${bearer() ?? ''}` },
  })
  if (!res.ok) throw new Error(`IAM answered ${res.status}.`)
  return (await res.json()) as Page
}

/**
 * The strip across the top of every page while a SuperAdmin is inside an
 * organization that is not theirs: which one, as whom, and the way out. It reads
 * the token's `assumed` claim, so it is there exactly as long as IAM's re-scoped
 * token is.
 */
export function SupportBanner() {
  const hydrated = useHydrated()
  const [org, setOrg] = useState<string | null>(null)
  const [who, setWho] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    setOrg(assumed())
    setWho(named()?.email || named()?.name || '')
  }, [hydrated])

  if (!org) return null
  // Leaving asks IAM to release. When IAM cannot answer, the way out is the
  // person's own session: the SDK's next refresh assumes nothing.
  const leave = () => {
    setBusy(true)
    support(null).catch(() => abandon())
  }
  return (
    <XStack
      role="status"
      aria-label="Support mode"
      position="fixed"
      t={52}
      l="50%"
      x="-50%"
      maxW="calc(100vw - 32px)"
      z={BANNER}
      items="center"
      justify="center"
      gap={12}
      flexWrap="wrap"
      pt={6}
      pr={8}
      pb={6}
      pl={16}
      rounded={999}
      bg="var(--foreground)"
    >
      <Text fontSize="$2" color="var(--background)">
        Support mode: you are in <strong>{org}</strong>{who ? ` as ${who}` : ''}. IAM records it under your name.
      </Text>
      <Button size="sm" onClick={leave} disabled={busy}>
        {busy ? 'Leaving' : 'Leave'}
      </Button>
    </XStack>
  )
}

/**
 * Every organization, for a SuperAdmin to step into. The list and the search are
 * IAM's, a page at a time; picking one asks IAM to step in.
 */
export function SupportPicker({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Organization[]>([])
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [stepping, setStepping] = useState<string | null>(null)
  // Only the newest read lands: a search typed while a page is in flight
  // supersedes it, so a slow answer to an old query never overwrites the new one.
  const asked = useRef(0)

  const load = useCallback(async (query: string, from: string) => {
    const mine = ++asked.current
    setLoading(true)
    setRefused(null)
    try {
      const next = await page(query, from)
      if (mine !== asked.current) return
      setRows((had) => {
        // IAM's cursor is a position, so an org created mid-walk can shift a row
        // across a page edge; each org is kept once.
        const all = from ? [...had, ...(next.organizations ?? [])] : next.organizations ?? []
        return all.filter((o, i) => all.findIndex((x) => x.name === o.name) === i)
      })
      setCursor(next.cursor ?? '')
    } catch (e) {
      if (mine === asked.current) setRefused(e instanceof Error ? e.message : 'The list did not load.')
    } finally {
      if (mine === asked.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => void load(q, ''), 250)
    return () => clearTimeout(id)
  }, [q, load])

  const enter = (org: string) => {
    setStepping(org)
    setRefused(null)
    support(org).catch((e: unknown) => {
      setRefused(e instanceof Error ? e.message : 'IAM did not step in.')
      setStepping(null)
    })
  }

  return (
    <YStack
      role="dialog"
      aria-modal
      aria-label="All organizations"
      onKeyDown={(e) => {
        // gui types the native event; on the web it is the DOM's, which carries the key.
        if ('key' in e && e.key === 'Escape') onClose()
      }}
      position="fixed"
      inset={0}
      z={DIALOG}
      bg={SCRIM}
      overflowY="auto"
      py="6vh"
      px={16}
      onClick={onClose}
    >
      <YStack
        onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxW={560}
        mx="auto"
        bg="var(--background)"
        rounded={16}
        pt={24}
        px={24}
        pb={16}
      >
        <XStack items="flex-start" justify="space-between" gap={12}>
          <YStack shrink={1} minW="auto">
            <Text render="h2" fontSize="$7" fontWeight="500" color="var(--text-primary)">
              All organizations
            </Text>
            <Text render="p" mt={6} fontSize="$3" color={muted} lineHeight={21}>
              Support mode. Step into any organization to see its chats, agents and billing as it does. IAM records every step under your name.
            </Text>
          </YStack>
          <Button variant="ghost" size="icon-sm" mr={-8} onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden />
          </Button>
        </XStack>
        <Text
          render={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an organization" aria-label="Find an organization" autoFocus />}
          width="100%"
          mt={16}
          fontSize="$3"
          px={12}
          py={10}
          rounded={10}
          borderWidth={1}
          borderColor="var(--border)"
          bg="var(--background)"
          color="var(--foreground)"
        />
        <View role="list" aria-label="Organizations" mt={10} display="grid" gap={2}>
          {rows.map((o) => (
            <XStack
              key={o.name}
              render="button"
              role="listitem"
              onClick={() => enter(o.name)}
              disabled={stepping !== null}
              items="baseline"
              justify="space-between"
              gap={12}
              width="100%"
              px={12}
              py={10}
              rounded={10}
              borderWidth={0}
              bg="transparent"
              cursor="pointer"
            >
              <Text fontSize="$3" fontWeight="500" color="var(--foreground)" text="left">
                {o.displayName || o.name}
              </Text>
              <Text fontSize="$2" color={muted} text="left">
                {stepping === o.name ? 'Stepping in' : o.name}
              </Text>
            </XStack>
          ))}
          {!loading && rows.length === 0 && !refused ? (
            <Text render="p" mx={12} my={8} fontSize="$3" color={muted}>
              No organization matches.
            </Text>
          ) : null}
        </View>
        {refused ? (
          <Text render="p" mx={12} my={8} fontSize="$3" color={BAD}>
            {refused}
          </Text>
        ) : null}
        {cursor ? (
          <Button self="flex-start" mt={8} onClick={() => void load(q, cursor)} disabled={loading}>
            {loading ? 'Loading' : 'More'}
          </Button>
        ) : null}
      </YStack>
    </YStack>
  )
}
