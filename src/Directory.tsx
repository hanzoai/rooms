'use client'

// The Catalog: everything installable, in one modal, reachable from Settings and
// from the places that connect something. ONE surface, not two — the settings
// pane and the standalone modal render the same `Catalog` body with a different
// frame around it.
//
// NOT "the Directory". A directory is of PEOPLE — teammates, agents, contacts,
// whoever has been invited or connected — and that is `Contacts`. Two surfaces
// under one word meant "Browse the directory" navigated to the people page and
// then opened this on top of it.
//
// AND THE FIRST TAB IS NOT AN INSTALL LIST. An OpenAI SDK is not an app someone
// installs into Hanzo; it is a client that talks to /v1. That tab says what
// Hanzo WORKS WITH and its rows link to documentation. The other three are the
// org's own lists and their rows install.
//
// TWO KINDS, and no third. A row is an `MCP` server or it is `native` (a
// skill.md, a native plugin, a native connector). The kind is a PROPERTY of the
// row shown as a small badge, never a section boundary and never a second
// install flow — one `+` everywhere, branching internally.
//
// TWO TABS, and the channels are tiles. A channel is a provider the org can
// hold an account with, read from `/v1/integrations` — which says whether this
// deployment can open a connection and whether this org has one — and every
// tile's button is a call to that registry. The Inbox's "Connect an app" opens
// this same directory on this tab; there is no second grid. Skills, plugins and
// connectors are what an agent brings to a run, and they have one home, Dev's
// Customize (@hanzo/build); Settings links there rather than drawing a copy.
//
// COUNTS ARE DERIVED. The catalog is counted, never typed. None of these
// registries serves a download figure, so no card draws one: the rows carried
// typed-in install numbers under a download icon — 24,200 for Slack, 56,000 for
// the filesystem MCP — which is a measurement nobody took. This site already
// deleted a "600+ integrations" claim for the same reason.
//
// SIGNED IN, EACH TAB READS ITS OWN REGISTRY. Apps is this site's public catalog
// AND the org's connected accounts; Channels is the org's own list at
// `/v1/integrations`. That one needs the bearer, so signed-out asks the reader to
// sign in rather than drawing a catalogue nobody can connect from, and a
// registry that cannot be reached says so rather than claiming the list is
// empty. Nothing stands in for an answer: no row is drawn that the registry did
// not send, and none is marked Connected that it did not mark.

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Check, Plus, Search, X } from 'lucide-react'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Text,
  XStack,
  YStack,
} from '@hanzo/ui'
import { Grid } from '@hanzo/ui/grid'
import { useIam } from '@hanzo/iam/react'
import { ProviderMark } from './ProviderMark'
import { say } from './failure'
import { api } from './lib/api'
import { scope } from './lib/session'
import { enter } from './lib/destination'
import { Action } from '@hanzo/ui/marketing'
import { tap } from './lib/tap'
import { GOOD } from './lib/mix'
import { site } from './where'

/**
 * What this directory lists. APPS are what Hanzo works with — the public
 * catalog, each row a page. CHANNELS are transports: where a conversation
 * reaches you. Skills and plugins are Customize's (Settings links there).
 */
export type Tab = 'apps' | 'channels'

const TABS: { id: Tab; label: string }[] = [
  { id: 'apps', label: 'Works with' },
  { id: 'channels', label: 'Channels' },
]

/** The org-plane catalogue: every provider the platform can connect an account to, with THIS org's connection and whether the deployment can open one. */
const CHANNELS = '/v1/integrations'

/** What an installable row is, whichever list it came from. */
interface Row {
  id: string
  name: string
  publisher: string
  description: string
  /** The taxonomy, and the whole of it. */
  kind: 'MCP' | 'native'
  /** Set on a transport/service the org has actually connected. */
  connected?: boolean
  /** A channel: whether THIS deployment holds the provider's app credentials,
   *  which is what decides if Connect can succeed. The registry's own word. */
  available?: boolean
  /** A channel: the connected account's label, as the provider reported it. */
  account?: string
}

/**
 * The channels a reader reaches for first, in the order they were asked for.
 * The rest of the registry follows in its own order. A rank, not a filter: a
 * provider the registry publishes is always drawn.
 */
const LEAD = ['tiktok', 'instagram', 'linkedin', 'slack', 'x', 'whatsapp', 'discord', 'telegram', 'facebook', 'teams', 'threads', 'youtube']

/**
 * The published integrations (lib/integrations), as directory rows. Real,
 * public, counted. Loaded when the tab first opens, so a page the rooms frame
 * carries none of the catalogue's guides.
 */
let listing: Promise<Row[]> | null = null
const apps = (): Promise<Row[]> =>
  (listing ??= import('./lib/integrations')
    .then(({ INTEGRATIONS }) =>
      INTEGRATIONS.map((i): Row => ({
        id: i.slug,
        name: i.name,
        publisher: i.creator,
        // The catalog's own sentence, trimmed to the card's two lines.
        description: i.description.split('. ')[0] + '.',
        kind: 'native',
      })),
    )
    .catch(() => []))

/** One title-cased word from a channel id. */
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The channel registry's own shape, as the one Row the card renders. */
function channelsOf(j: unknown): Row[] {
  const o = (j ?? {}) as Record<string, unknown[]>
  const rank = (id: string) => {
    const i = LEAD.indexOf(id)
    return i < 0 ? LEAD.length : i
  }
  return ((o.providers ?? []) as Record<string, unknown>[])
    .map((p) => {
      const link = (p.connection ?? {}) as Record<string, unknown>
      const account = String(link.account ?? link.label ?? '')
      return {
        id: String(p.id),
        name: String(p.name ?? title(String(p.id))),
        // What the registry knows, in the reader's order of interest: who is
        // connected, else whether a connection can be opened here at all.
        publisher: p.connected ? account || 'Connected' : p.available ? String(p.category ?? '') : 'Needs app credentials',
        description: String(p.description ?? ''),
        kind: 'native' as const,
        connected: Boolean(p.connected),
        available: Boolean(p.available),
        account,
      }
    })
    .sort((a, b) => rank(a.id) - rank(b.id))
}

/**
 * A rejection `say()` can read.
 *
 * It ranks a numeric `status` above the prose beside it, precisely so a
 * reworded message cannot change what a room tells a reader — and a `fetch`
 * that rejects with a bare number carries neither. Measured signed out on
 * production: /v1/channels, /v1/tools/plugins and /v1/tools/skills all answer
 * 403 "a validated principal is required", so a refusal is the common case and
 * has to arrive as one rather than as a flat "could not read".
 */
const refusal = (r: Response) => Object.assign(new Error(String(r.status)), { status: r.status })

export function Directory({
  open,
  onClose,
  tab: first = 'apps',
}: {
  open: boolean
  onClose: () => void
  /** The tab the directory opens on. A door that leads to channels opens on them. */
  tab?: Tab
}) {
  const [tab, setTab] = useState<Tab>(first)
  useEffect(() => {
    if (open) setTab(first)
  }, [open, first])

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => (v ? null : onClose())}>
      <DialogContent width="100%" maxW={960} p={0} showCloseButton={false}>
        <XStack items="center" justify="space-between" p="$4" gap="$2">
          <DialogTitle>
            <Text fontSize="$5" fontWeight="500" color="$ink">
              Catalog
            </Text>
          </DialogTitle>
          <Box render={<button type="button" onClick={onClose} aria-label="Close catalog" />} {...tap}>
            <X size={16} aria-hidden />
          </Box>
        </XStack>

        <XStack width="100%" items="stretch" flexWrap="wrap">
          <YStack
            width="100%"
            $sm={{ width: 200, borderRightWidth: 1 }}
            borderColor="$borderColor"
            p="$3"
            gap="$1"
          >
            {TABS.map((t) => (
              <Box
                key={t.id}
                render={<button type="button" onClick={() => setTab(t.id)} aria-current={t.id === tab ? 'true' : undefined} />}
                {...tap}
              >
                <XStack px="$2" py="$2" width="100%">
                  <Text fontSize="$3" color={t.id === tab ? '$ink' : '$soft'}>
                    {t.label}
                  </Text>
                </XStack>
              </Box>
            ))}
          </YStack>

          <YStack flex={1} minW={0} p="$4">
            <Catalog tab={tab} />
          </YStack>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The body. Rendered inside the Directory modal AND inside Settings, which is
 * why it is exported and takes the tab as a prop.
 */
export function Catalog({ tab }: { tab: Tab }) {
  const { isAuthenticated, accessToken } = useIam()
  const [query, setQuery] = useState('')
  // null until the list is read: unknown is never drawn as empty.
  const [rows, setRows] = useState<Row[] | null>(null)
  const [wrong, setWrong] = useState<unknown>(null)
  // Bumped when a card changed a connection, or a failed read is asked again,
  // so the registry is read again and the card shows what it now holds.
  const [turn, setTurn] = useState(0)
  const label = TABS.find((t) => t.id === tab)?.label ?? tab
  const signed = isAuthenticated && Boolean(accessToken)

  useEffect(() => {
    let live = true
    setRows(null)
    setWrong(null)
    const auth = signed ? scope() : null

    // Apps is this site's own public catalog — real for everyone. Signed in, we
    // also mark which providers the org has actually connected, from the one
    // read that names them.
    if (tab === 'apps') {
      apps().then((list) => {
        if (live) setRows(list)
      })
      if (auth) {
        Promise.all([
          apps(),
          fetch(`${api()}/v1/integrations/connectors`, { headers: auth }).then((r) => (r.ok ? r.json() : null)),
        ])
          .then(([list, j]) => {
            if (!live || !j?.connectors) return
            const on = new Set((j.connectors as Record<string, unknown>[]).map((c) => String(c.provider)))
            setRows(list.map((a) => (on.has(a.id) ? { ...a, connected: true } : a)))
          })
          .catch(() => {})
      }
      return () => {
        live = false
      }
    }

    if (!auth) return
    fetch(`${api()}${CHANNELS}`, { headers: auth })
      .then((r) => {
        if (!r.ok) throw refusal(r)
        return r.json()
      })
      .then((j) => live && setRows(channelsOf(j)))
      .catch((e: unknown) => live && setWrong(e))
    return () => {
      live = false
    }
  }, [tab, signed, turn]) // eslint-disable-line react-hooks/exhaustive-deps -- scope() reads the same token

  // A connection finishes in the provider's own tab. Coming back to this one is
  // the moment to ask the registry again.
  useEffect(() => {
    if (tab !== 'channels') return
    const back = () => {
      if (document.visibilityState === 'visible') setTurn((n) => n + 1)
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [tab])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
  }, [rows, query])

  const quiet = (text: string, action?: React.ReactNode) => (
    <YStack gap="$3" py="$4" items="flex-start">
      <Text fontSize="$3" color="$soft">
        {text}
      </Text>
      {action}
    </YStack>
  )

  return (
    <YStack gap="$4">
      <XStack items="center" gap="$2" flexWrap="wrap">
        <XStack items="center" gap="$2" flex={1} minW={180}>
          <Search size={14} aria-hidden />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label.toLowerCase()}`}
            flex={1}
          />
        </XStack>
      </XStack>

      {tab === 'channels' && !signed ? (
        quiet(
          'Sign in to see the channels your organization can connect.',
          <Action render="button" onPress={() => enter()} $touchable={{ minH: 44, minW: 44 }}>
            Sign in
          </Action>,
        )
      ) : wrong ? (
        quiet(
          say(wrong, 'the channels'),
          <Action render="button" onPress={() => setTurn((n) => n + 1)} $touchable={{ minH: 44, minW: 44 }}>
            Try again
          </Action>,
        )
      ) : rows === null ? (
        quiet(`Loading ${label.toLowerCase()}…`)
      ) : shown.length > 0 ? (
        <>
          <Text fontSize="$3" color="$soft">
            {shown.length} {shown.length === 1 ? 'result' : 'results'}
          </Text>
          <YStack maxH={380} overflowY="auto" overflowX="hidden" pr="$1" width="100%">
            <Grid columns={tab === 'channels' ? { min: 168, max: 4 } : { min: 240, max: 2 }} gap={12}>
              {shown.map((r) =>
                tab === 'channels' ? (
                  <Channel key={r.id} row={r} onChange={() => setTurn((n) => n + 1)} />
                ) : (
                  <RowCard key={r.id} row={r} tab={tab} />
                ),
              )}
            </Grid>
          </YStack>
        </>
      ) : (
        quiet(query ? `Nothing matches “${query}”.` : tab === 'channels' ? 'No channel can be connected here yet.' : 'Nothing is listed yet.')
      )}
    </YStack>
  )
}

function RowCard({ row, tab }: { row: Row; tab: Tab }) {
  const { isAuthenticated } = useIam()

  /** Hand a channel to the gateway's OAuth and let it say what happened. */
  const connect = () => {
    if (!isAuthenticated) {
      enter()
      return
    }
    // Same-tab origin for the return leg: the reader lands back on the site
    // they started from rather than on production from a preview build.
    const back = encodeURIComponent(`${window.location.origin}/inbox`)
    window.open(
      `${api()}/v1/channels/${encodeURIComponent(row.id)}/oauth/authorize?redirect_uri=${back}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  // Apps open the page this site serves. Only a channel has a flow of its own,
  // and only that one is a button.
  const href = site(`/integrations/${row.id}`)
  return (
    <YStack
      gap="$2"
      p="$3"
      borderWidth={1}
      borderColor="$borderColor"
      rounded="$3"
      height="100%"
      bg="$raised"
    >
      <XStack items="center" gap="$2">
        <ProviderMark org={row.id.replace(/-sdk$/, '')} size={20} />
        <YStack flex={1} minW={0}>
          <Text fontSize="$3" fontWeight="500" color="$ink" numberOfLines={1}>
            {row.name}
          </Text>
          <Text fontSize="$2" color="$soft" numberOfLines={1}>
            {row.publisher}
          </Text>
        </YStack>
        {/* CONNECTED IS THE REGISTRY'S WORD, never this card's. The badge was
            local state that the press set true the instant it opened the OAuth
            tab — before any grant, and the authorize route answers 404 on
            production — and for plugins and skills it toggled with no request
            sent at all. A row went green having connected nothing. */}
        {row.connected ? (
          <XStack items="center" gap="$1" px="$2" py="$1" rounded="$2" bg="$hover">
            <Check size={12} color={GOOD} aria-hidden />
            <Text fontSize="$1" color={GOOD} fontWeight="600">
              Connected
            </Text>
          </XStack>
        ) : tab === 'channels' ? (
          <Box
            render="button"
            onClick={connect}
            aria-label={`Connect ${row.name}`}
            px="$2"
            py="$1"
            rounded="$2"
            borderWidth={1}
            borderColor="$borderColor"
            bg="var(--white-05)"
            hoverStyle={{ bg: '$hover' }}
            cursor="pointer"
          >
            <Text fontSize="$1" color="$color" fontWeight="600">
              Connect
            </Text>
          </Box>
        ) : (
          /* A LINK, because it goes somewhere. It was a button calling
             `location.href`, which cost the row its middle click, its hover
             preview and its accessible name — and `e2e/directory.spec.ts` reads
             every Apps row by that name to prove it points at a page this site
             really serves. */
          <Box
            render={<a href={href} target={tab === 'apps' ? undefined : '_blank'} rel="noreferrer" aria-label={`Open ${row.name}`} />}
            {...tap}
          >
            <XStack
              items="center"
              gap="$1"
              px="$2"
              py="$1"
              rounded="$2"
              borderWidth={1}
              borderColor="$borderColor"
              bg="var(--white-05)"
              hoverStyle={{ bg: '$hover' }}
            >
              <Text fontSize="$1" color="$color" fontWeight="600">
                {tab === 'apps' ? 'Docs' : 'Install'}
              </Text>
              <ArrowUpRight size={11} aria-hidden />
            </XStack>
          </Box>
        )}
      </XStack>

      <Text fontSize="$2" color="$soft" numberOfLines={2} flex={1}>
        {row.description}
      </Text>

      {/* THE KIND, AND NOTHING BESIDE IT. A download icon and a figure sat here;
          the figure came from the array above rather than from any registry,
          and none of the four serves one to put in its place. */}
      <XStack items="center" pt="$1">
        <Text fontFamily="$mono" fontVariant={['tabular-nums']} fontSize="$1" color="$soft">
          {row.kind}
        </Text>
      </XStack>
    </YStack>
  )
}

/**
 * One channel: a provider the org can hold an account with.
 *
 * Three verbs and each one is a call. Connect asks the registry to open the
 * provider's consent — it answers the authorize URL, which opens in its own tab
 * so the reader lands back here — and a provider this deployment holds no app
 * credentials for is drawn without a Connect, saying so, because the registry
 * said so. A connected channel can take another account or be disconnected,
 * and what the card shows afterwards is what the registry answers on the next
 * read, never what the press assumed.
 */
function Channel({ row, onChange }: { row: Row; onChange: () => void }) {
  const { isAuthenticated, accessToken } = useIam()
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState<unknown>(null)

  const post = async (verb: 'connect' | 'disconnect') => {
    if (!isAuthenticated || !accessToken) {
      enter()
      return
    }
    setBusy(true)
    setWrong(null)
    try {
      const r = await fetch(`${api()}/v1/integrations/${encodeURIComponent(row.id)}/${verb}`, {
        method: 'POST',
        headers: { ...scope(), 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!r.ok) throw refusal(r)
      const j = (await r.json()) as { authorizeUrl?: string }
      if (j.authorizeUrl) window.open(j.authorizeUrl, '_blank', 'noopener,noreferrer')
      onChange()
    } catch (e) {
      setWrong(e)
    } finally {
      setBusy(false)
    }
  }

  const action = (label: string, verb: 'connect' | 'disconnect', icon?: React.ReactNode) => (
    <Box
      render="button"
      onClick={() => void post(verb)}
      aria-label={`${label} ${row.name}`}
      aria-disabled={busy}
      px="$3"
      py="$1.5"
      rounded="$3"
      borderWidth={1}
      borderColor="$borderColor"
      hoverStyle={{ bg: '$hover' }}
      opacity={busy ? 0.5 : 1}
      display="flex"
      items="center"
      gap="$1"
    >
      {icon}
      <Text fontSize="$2" color="$ink" fontWeight="500">
        {label}
      </Text>
    </Box>
  )

  return (
    <YStack
      items="center"
      gap="$2"
      p="$4"
      borderWidth={1}
      borderColor="$borderColor"
      rounded="$4"
      bg="$raised"
    >
      {row.connected ? (
        <XStack self="flex-start" items="center" gap="$1" aria-label="Connected">
          <Box width={6} height={6} rounded={3} bg="$ink" />
          <Text fontSize="$1" color="$soft">
            Connected
          </Text>
        </XStack>
      ) : null}
      <YStack items="center" gap="$2" pt={row.connected ? 0 : '$3'}>
        <ProviderMark org={row.id} size={40} />
        <Text fontSize="$3" fontWeight="500" color="$ink" text="center" numberOfLines={1}>
          {row.name}
        </Text>
        <Text fontSize="$1" color="$soft" text="center" numberOfLines={1}>
          {row.publisher}
        </Text>
      </YStack>
      <XStack gap="$1.5" items="center" justify="center" flexWrap="wrap">
        {row.connected ? (
          <>
            {action('Disconnect', 'disconnect')}
            {row.available ? action('Add', 'connect', <Plus size={12} aria-hidden />) : null}
          </>
        ) : row.available ? (
          action('Connect', 'connect')
        ) : null}
      </XStack>
      {wrong ? (
        <Text fontSize="$1" color="$soft" text="center">
          {say(wrong, row.name)}
        </Text>
      ) : null}
    </YStack>
  )
}
