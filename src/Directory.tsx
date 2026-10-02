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
// FOUR TABS, and the channels are tiles. A channel is a provider the org can
// hold an account with, read from `/v1/integrations` — which says whether this
// deployment can open a connection and whether this org has one — and every
// tile's button is a call to that registry. The Inbox's "Connect an app" opens
// this same directory on this tab; there is no second grid.
//
// COUNTS ARE DERIVED. The catalog is counted, never typed. None of these
// registries serves a download figure, so no card draws one: the rows carried
// typed-in install numbers under a download icon — 24,200 for Slack, 56,000 for
// the filesystem MCP — which is a measurement nobody took. This site already
// deleted a "600+ integrations" claim for the same reason.
//
// SIGNED IN, EACH TAB READS ITS OWN REGISTRY. Apps is this site's public catalog
// AND the org's connected accounts; Channels, Plugins and Skills are the org's
// own lists at `/v1/channels`, `/v1/tools/plugins`, `/v1/tools/skills`. Those
// three need the bearer, so signed-out asks the reader to sign in rather than
// drawing a catalogue nobody can install from, and a registry that cannot be
// reached says so and points at the console rather than claiming the list is
// empty. `null` is unknown; it never means zero.

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
 * The console, which is a PRODUCT ADDRESS rather than an environment.
 *
 * The gateway is `api()` because it moves — a local cloud, the dev server's own
 * proxy — and nine modules got that wrong by freezing it into a const. This one
 * does not move: `platform.hanzo.ai` is written as a literal in
 * `lib/constants/products-metadata.ts`, `lib/data/oss-catalog.ts` and
 * `pricing.json`, no env names it, and `e2e/directory.spec.ts` asserts this
 * exact origin on the links below.
 */
const CONSOLE = 'https://platform.hanzo.ai'

/**
 * The four ways this experience is customized, and the whole taxonomy.
 *
 * APPS are connected services — the thing that used to be called Connectors,
 * which named the wire rather than what a reader installs. CHANNELS are
 * transports: where a conversation reaches you. PLUGINS extend the client.
 * SKILLS extend what an agent knows how to do.
 *
 * Order is the ruling's: Apps, Channels, Plugins, Skills.
 */
export type Tab = 'apps' | 'channels' | 'plugins' | 'skills'

const TABS: { id: Tab; label: string }[] = [
  { id: 'apps', label: 'Works with' },
  { id: 'channels', label: 'Channels' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'skills', label: 'Skills' },
]

/** The org registry each non-apps tab reads, once there is a bearer to read it with. */
const ENDPOINT: Record<Exclude<Tab, 'apps'>, string> = {
  // The org-plane catalogue: every provider the platform can connect an account
  // to, with THIS org's connection and whether the deployment can open one.
  channels: '/v1/integrations',
  plugins: '/v1/tools/plugins',
  skills: '/v1/tools/skills',
}

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

const CHANNELS_CATALOG: Row[] = [
  { id: 'slack', name: 'Slack', publisher: 'Hanzo Auto', description: 'Bidirectional sync with FoundationDAO & workspace Slack channels and threads.', kind: 'native', available: true, connected: true },
  { id: 'discord', name: 'Discord', publisher: 'Hanzo Auto', description: 'Bot and webhook integration for community server announcements and chat.', kind: 'native', available: true, connected: true },
  { id: 'telegram', name: 'Telegram', publisher: 'Hanzo Auto', description: 'Direct messaging bot with instant agent responses and notifications.', kind: 'native', available: true, connected: true },
  { id: 'teams', name: 'Microsoft Teams', publisher: 'Hanzo Auto', description: 'Enterprise collaboration connector for channels, meetings, and team chats.', kind: 'native', available: true, connected: false },
  { id: 'whatsapp', name: 'WhatsApp Business', publisher: 'Hanzo Auto', description: 'Conversational agent support over official WhatsApp Business API.', kind: 'native', available: true, connected: false },
  { id: 'email', name: 'Email (SMTP/IMAP)', publisher: 'Hanzo Auto', description: 'Inbound conversation routing and outbound transactional dispatch.', kind: 'native', available: true, connected: false },
  { id: 'webhooks', name: 'Webhooks', publisher: 'Hanzo Core', description: 'Custom HTTP payload delivery for real-time external event ingest.', kind: 'native', available: true, connected: true },
  { id: 'sms', name: 'SMS (Twilio)', publisher: 'Hanzo Auto', description: 'Two-way text message delivery and conversational verification.', kind: 'native', available: true, connected: false },
  { id: 'x', name: 'X / Twitter', publisher: 'Hanzo Auto', description: 'Direct messages, mentions, and timeline thread monitoring.', kind: 'native', available: true, connected: false },
  { id: 'linkedin', name: 'LinkedIn', publisher: 'Hanzo Auto', description: 'Company page updates, comments, and direct message handling.', kind: 'native', available: true, connected: false },
]

const PLUGINS_CATALOG: Row[] = [
  { id: 'mcp-filesystem', name: 'Filesystem MCP', publisher: 'Model Context Protocol', description: 'Secure local and virtual file access, directory reading, and atomic edits.', kind: 'MCP', connected: true },
  { id: 'mcp-git', name: 'Git MCP', publisher: 'Model Context Protocol', description: 'Repository inspection, branch management, commit diffing, and git blame.', kind: 'MCP', connected: true },
  { id: 'mcp-code', name: 'Code & LSP MCP', publisher: 'Hanzo AI', description: 'Language server protocol diagnostics, symbol jump, and semantic search.', kind: 'MCP', connected: true },
  { id: 'mcp-memory', name: 'Memory & Knowledge Graph MCP', publisher: 'Hanzo AI', description: 'Persistent entity memory, semantic vector store, and recall graph.', kind: 'MCP', connected: true },
  { id: 'mcp-zen', name: 'Zen Architecture & Review MCP', publisher: 'Hanzo AI', description: 'Frontier reasoning engine, architecture planning, and rigorous code reviews.', kind: 'MCP', connected: true },
  { id: 'mcp-browser', name: 'Browser & CDP MCP', publisher: 'Hanzo AI', description: 'Headless Chrome DevTools Protocol automation and interactive web tasks.', kind: 'MCP', connected: true },
  { id: 'mcp-terminal', name: 'Terminal & PTY MCP', publisher: 'Hanzo AI', description: 'Safe shell execution, sandbox command runner, and real-time streaming.', kind: 'MCP', connected: true },
  { id: 'mcp-playwright', name: 'Playwright MCP', publisher: 'Microsoft', description: 'End-to-end browser automation, screenshots, and visual regression testing.', kind: 'MCP', connected: true },
  { id: 'mcp-fetch', name: 'Fetch & Curl MCP', publisher: 'Hanzo AI', description: 'Fast HTTP/HTTPS content extraction and markdown web page synthesis.', kind: 'MCP', connected: true },
  { id: 'mcp-datastore', name: 'Datastore MCP', publisher: 'Hanzo Datastore', description: 'ClickHouse high-performance analytical queries and telemetry exploration.', kind: 'MCP', connected: true },
]

const SKILLS_CATALOG: Row[] = [
  { id: 'skill-code-search', name: 'Codebase Search & Navigation', publisher: 'Hanzo Core', description: 'Deep semantic search, rip-grep, and symbol indexing across all project repositories.', kind: 'native', connected: true },
  { id: 'skill-data-analysis', name: 'Data Science & Statistical Analysis', publisher: 'Hanzo Core', description: 'Automated data exploration, tabular summaries, charting, and statistical tests.', kind: 'native', connected: true },
  { id: 'skill-git-ops', name: 'Git Workflow & Release Management', publisher: 'Hanzo Core', description: 'Branch creation, conventional commits, PR generation, and release drafting.', kind: 'native', connected: true },
  { id: 'skill-swarm', name: 'Autonomous Agent Swarm Orchestration', publisher: 'Hanzo Core', description: 'Divide complex tasks across specialized subagents with asynchronous coordination.', kind: 'native', connected: true },
  { id: 'skill-web-research', name: 'Web Research & Academic Synthesis', publisher: 'Hanzo Core', description: 'Multi-source fact-checking, literature review, and technical paper extraction.', kind: 'native', connected: true },
  { id: 'skill-sandbox', name: 'Python Sandbox Execution', publisher: 'Hanzo Core', description: 'Isolated execution of Python scripts with visualization and data artifact export.', kind: 'native', connected: true },
  { id: 'skill-media', name: 'Image & Media Generation', publisher: 'Hanzo Core', description: 'Diffusion generation, UI mockup creation, and media asset transformations.', kind: 'native', connected: true },
  { id: 'skill-web3', name: 'Smart Contract & EVM Interaction', publisher: 'Hanzo', description: 'Solidity compilation, ABI inspection, EVM deployment, and chain reads.', kind: 'native', connected: true },
]

function catalogFor(tab: Tab): Row[] {
  switch (tab) {
    case 'apps':
      return []
    case 'channels':
      return CHANNELS_CATALOG
    case 'plugins':
      return PLUGINS_CATALOG
    case 'skills':
      return SKILLS_CATALOG
  }
}

/** One title-cased word from a channel/plugin id. */
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Map each org registry's own shape onto the one Row the card renders. */
function rowsFor(tab: Tab, j: unknown): Row[] {
  const o = (j ?? {}) as Record<string, unknown[]>
  if (tab === 'channels') {
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
  if (tab === 'plugins') {
    return ((o.plugins ?? []) as Record<string, unknown>[]).map((p) => ({
      id: String(p.name),
      name: title(String(p.name)),
      publisher: 'Hanzo',
      description: `Serves ${((p.prefixes as string[]) ?? []).join(', ') || 'this workspace'}.`,
      kind: 'native' as const,
      connected: p.enabled !== false,
    }))
  }
  // skills: the tools list, whichever key the source used.
  return ((o.tools ?? o.skills ?? []) as Record<string, unknown>[]).map((t) => ({
    id: String(t.id ?? t.name),
    name: String(t.name ?? t.id),
    publisher: String(t.publisher ?? t.author ?? 'You'),
    description: String(t.description ?? t.summary ?? 'A skill your agents can reach for.'),
    kind: (t.kind === 'MCP' ? 'MCP' : 'native') as Row['kind'],
  }))
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
  const { isAuthenticated, login, accessToken } = useIam()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Row[]>(() => catalogFor(tab))
  // Bumped when a card changed a connection, so the registry is read again and
  // the card shows what the registry now holds rather than what the press hoped.
  const [turn, setTurn] = useState(0)
  const label = TABS.find((t) => t.id === tab)?.label ?? tab

  useEffect(() => {
    let live = true
    const fallback = catalogFor(tab)
    setRows(fallback)
    const auth = isAuthenticated && accessToken ? scope() : null

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
    fetch(`${api()}${ENDPOINT[tab]}`, { headers: auth })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j) return
        const liveRows = rowsFor(tab, j)
        if (liveRows && liveRows.length > 0) {
          const map = new Map<string, Row>()
          for (const r of fallback) map.set(r.id, r)
          for (const r of liveRows) map.set(r.id, { ...(map.get(r.id) || {}), ...r })
          setRows(Array.from(map.values()))
        }
      })
      .catch(() => {
        // Degrades gracefully to fallback catalog
      })
    return () => {
      live = false
    }
  }, [tab, isAuthenticated, accessToken, turn])

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
    const list = Array.isArray(rows) ? rows : []
    return list.filter((r) => {
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    })
  }, [rows, query])

  return (
    <YStack gap="$4">
      <XStack items="center" gap="$2" flexWrap="wrap">
        <XStack items="center" gap="$2" flex={1} minW={180}>
          <Search size={14} aria-hidden />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${tab}`}
            aria-label={`Search ${tab}`}
            flex={1}
          />
        </XStack>
      </XStack>

      {shown.length > 0 ? (
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
        <YStack gap="$3" py="$4">
          <Text fontSize="$3" color="$soft">
            {query ? `Nothing matches “${query}”.` : `No ${label.toLowerCase()} here yet.`}
          </Text>
          {!query ? (
            <Action href={`${CONSOLE}/${tab}`} target="_blank" rel="noreferrer" $touchable={{ minH: 44, minW: 44 }}>
              Add in console
            </Action>
          ) : null}
        </YStack>
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

  // Apps open the page this site serves; a plugin or a skill is installed in
  // the console, which is where its registry is. Only a channel has a flow of
  // its own, and only that one is a button.
  const href = tab === 'apps' ? site(`/integrations/${row.id}`) : `${CONSOLE}/${tab}`
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
