'use client'

// Settings: the sidebar's second level, and the pane it opens in the room.
//
// TWO PARTS, ONE TAXONOMY. `SettingsList` is the rail's list — the shell swaps
// its own rows for these and back. `SettingsPane` is what fills the room while
// a row is chosen. Both read `GROUPS`, so the list can only offer a row the
// pane can draw.
//
// Which row is open is the shell's `showSettings` value and nothing here: a
// pane deep in the tree asks for Channels through the same store, and the rail
// and the room read that one answer.
//
// Every section that has a screen RENDERS IT HERE. Account, billing and usage
// are not links out to hanzo.id, billing.hanzo.ai and platform.hanzo.ai, because
// the surface is already packaged — @hanzo/usage carries the one usage panel
// every Hanzo product renders, @hanzo/iam carries the identity, and lib/plans
// carries the ladder. A row leaves this surface only when what it opens
// genuinely is not here: a legal document, another product's page, or a card
// form, which belongs to the payment host and nowhere else.
//
// The panes that are not yet built say so in one sentence rather than pretending
// to a screen. An honest empty pane is a smaller lie than an invented one.

import { dev } from './lib/host'
import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, ExternalLink } from 'lucide-react'
import {
  Box,
  Button,
  Separator,
  Text,
  XStack,
  YStack,
} from '@hanzo/ui'
import { SidebarItem, SidebarSection } from '@hanzo/ui/chat'
import { tap } from './lib/tap'
import { useIam, useIamIdentity, useOrganizations } from '@hanzo/iam/react'
import { useSignOut } from './lib/signout'
import { useModels } from '@hanzo/ai/react'
import { ModelSelector, RESEARCH } from '@hanzo/ui/models'
import { UsagePanel } from '@hanzo/usage/panel'
import { Catalog, type Tab } from './Directory'
import { useModel } from './model'
import { payPage, planName } from './lib/plans'
import { api } from './lib/api'
import { renewal, useSubscription, useTier } from './lib/tier'
import { sku, spendShown, useLimits } from './lib/limits'
import { Meters } from './meters'
import { Look } from './look'
import { ProviderMark } from './ProviderMark'
import { org, pick } from './lib/session'
import { site } from './where'

/** A choice among a few: a hairline edge and a corner. The fill and the edge's
 *  ink are the call site's, because they say which one is chosen. */
const CHOICE = { rounded: 8, borderWidth: 1, borderStyle: 'solid', cursor: 'pointer' } as const

export type Row = {
  id: string
  label: string
  /**
   * Where the row GOES, for one that leaves this list for the page that owns it.
   *
   * The row is still a button and not an anchor: the rail's contract is one verb
   * per row, and the shell is the only thing that knows how this host moves. So
   * this states the destination and `onPick` performs it.
   */
  href?: string
  /** One sentence, for a pane we have not built a screen for yet. */
  note?: string
}

type Group = { label: string; rows: Row[] }

const GROUPS: Group[] = [
  {
    label: 'Settings',
    rows: [
      { id: 'general', label: 'General' },
      { id: 'account', label: 'Account' },
      { id: 'billing', label: 'Billing' },
      { id: 'usage', label: 'Usage' },
      { id: 'capabilities', label: 'Capabilities', note: 'What a model may reach for on your behalf.' },
      { id: 'privacy', label: 'Privacy', href: site('/legal/privacy') },
      { id: 'dev', label: 'Hanzo Dev', href: dev() },
      { id: 'browser', label: 'Hanzo Browser', href: site('/extension') },
    ],
  },
  {
    label: 'Preferences',
    rows: [
      // DEFAULT MODEL, and the word matters beside Platform's Models: this row
      // chooses which one answers, that one says which ones are served.
      { id: 'model', label: 'Default model' },
      {
        id: 'agent',
        label: 'Personal agent',
        note:
          'The agent that answers as you — its capabilities, its modes, and what it is allowed ' +
          'to do on your behalf. Nothing is bound to this surface yet, so there is nothing here ' +
          'to change; it is listed because this is where it will live.',
      },
    ],
  },
  {
    label: 'Customize',
    rows: [
      { id: 'apps', label: 'Apps' },
      { id: 'channels', label: 'Channels' },
      { id: 'plugins', label: 'Plugins' },
      { id: 'skills', label: 'Skills' },
      { id: 'memory', label: 'Memory', note: 'Nothing is remembered between conversations yet.' },
    ],
  },
  /**
   * THE PLATFORM, from the workspace.
   *
   * Models draws here because `/v1/models` is a call this app already makes, so
   * the pane can state what is actually served rather than describe it. Base,
   * Functions and Realtime have no read this app makes, so each row goes to the
   * page that already documents the product — a row that led to an invented
   * screen would be worse than one that leaves.
   */
  {
    label: 'Platform',
    rows: [
      { id: 'models', label: 'Models' },
      { id: 'base', label: 'Base', href: site('/base') },
      { id: 'functions', label: 'Functions', href: site('/functions') },
      { id: 'realtime', label: 'Realtime', href: site('/realtime') },
      { id: 'keys', label: 'API keys' },
    ],
  },
]

/** Every row, flat — what the pane looks a chosen id up in. */
const ROWS: Row[] = GROUPS.flatMap((g) => g.rows)

/** The row Settings opens on when nothing has asked for another. */
export const FIRST = ROWS[0].id

/**
 * The rail's second level: every settings row, grouped.
 *
 * It renders `SidebarItem` rather than a shape of its own so a settings row and
 * a room row are the same row — the list under it changes, the column does not.
 *
 * `aria-current="true"` is stated rather than left to `active`, which publishes
 * `page`. A settings row is the current item in a set, not the current page;
 * the address never moves.
 */
export function SettingsList({
  active,
  filter,
  onPick,
  onBack,
}: {
  /** The open row's id. */
  active: string
  /** The rail's own filter, narrowing these rows the way it narrows the rooms. */
  filter: string
  /** Chosen. The shell decides what a row with an `href` does. */
  onPick: (row: Row) => void
  /** Back to the rooms. */
  onBack: () => void
}) {
  const q = filter.trim().toLowerCase()
  const groups = q
    ? GROUPS.map((g) => ({ ...g, rows: g.rows.filter((r) => r.label.toLowerCase().includes(q)) })).filter(
        (g) => g.rows.length > 0,
      )
    : GROUPS

  return (
    <>
      <SidebarItem icon={<ArrowLeft size={15} aria-hidden />} onPress={onBack}>
        Workspace
      </SidebarItem>
      {q && groups.length === 0 ? (
        <Text px="$3" py="$2" fontSize="$2" color="$quiet">
          No matches for “{filter.trim()}”.
        </Text>
      ) : null}
      {groups.map((g) => (
        <SidebarSection key={g.label} label={g.label}>
          {g.rows.map((r) => (
            <SidebarItem
              key={r.id}
              // The arrow says this row LEAVES. Without it a row that navigates
              // away and one that draws a pane in place look identical until
              // pressed.
              icon={r.href ? <ArrowUpRight size={13} aria-hidden /> : undefined}
              active={r.id === active}
              aria-current={r.id === active ? 'true' : undefined}
              onPress={() => onPick(r)}
            >
              {r.label}
            </SidebarItem>
          ))}
        </SidebarSection>
      ))}
    </>
  )
}

/**
 * The room, while a settings row is open.
 *
 * It scrolls itself, the way the column beside a room does: `main` gives its
 * child a floor and no overflow, so a pane that did not would push the whole
 * shell down the page.
 */
export function SettingsPane({ id }: { id: string }) {
  const row = ROWS.find((r) => r.id === id)

  return (
    <YStack flex={1} minH={0} overflowY="auto" overflowX="hidden">
      <YStack p="$5" gap="$4" maxW={860}>
        <Text fontSize="$6" fontWeight="600" color="$ink">
          {row?.label ?? 'Settings'}
        </Text>
        <Pane id={id} note={row?.note} />
      </YStack>
    </YStack>
  )
}

/** One pane. */
function Pane({ id, note }: { id: string; note?: string }) {
  if (id === 'apps' || id === 'channels' || id === 'plugins' || id === 'skills') {
    return <Catalog tab={id as Tab} />
  }
  if (id === 'general') return <Look />
  if (id === 'account') return <Account />
  if (id === 'billing') return <Billing />
  if (id === 'usage') return <Usage meters />
  if (id === 'keys') return <Keys />
  if (id === 'model') return <Model />
  if (id === 'models') return <Served />
  if (id === 'agent') return <AgentSettings />
  if (id === 'capabilities') return <Capabilities />
  if (id === 'memory') return <MemorySettings />

  return (
    <Text fontSize="$3" color="$soft">
      {note ?? 'Nothing to configure here yet.'}
    </Text>
  )
}

/** One default in one place; agents may still bring their own model. */
function Model() {
  const { models: served } = useModels()
  // Hanzo models alone, as the composer's picker offers them (`sku`).
  const models = useMemo(() => served.filter((m) => sku(m.id)), [served])
  const [model, choose] = useModel()

  return (
    <YStack gap="$3" maxW={420}>
      <Text fontSize="$3" color="$soft">
        Used for new chats. An agent with its own model keeps that choice.
      </Text>
      <XStack self="flex-start">
        <ModelSelector models={[...models, ...RESEARCH]} value={model} onChange={choose} size="sm" />
      </XStack>
      <YStack gap="$2" mt="$2">
        {models
          .filter((m) => !m.id.includes('openrouter'))
          .slice(0, 8)
          .map((m) => {
            const isSel = model === m.id
            const p = m.id.startsWith('zen') ? 'zen' : 'enso'
            return (
              <Box
                key={m.id}
                render="button"
                onClick={() => choose(m.id)}
                px="$3"
                py="$2"
                rounded="$2"
                borderWidth={1}
                borderColor={isSel ? '$ink' : '$borderColor'}
                bg={isSel ? '$raised' : 'transparent'}
                hoverStyle={{ bg: '$hover' }}
                cursor="pointer"
              >
                <XStack items="center" gap="$2.5">
                  <ProviderMark provider={p} size={16} />
                  <Text fontSize="$2" fontWeight="600" color="$ink" flex={1}>
                    {m.id}
                  </Text>
                  {isSel ? (
                    <Text fontSize="$1" color="$soft">
                      Active
                    </Text>
                  ) : null}
                </XStack>
              </Box>
            )
          })}
      </YStack>
    </YStack>
  )
}

/**
 * WHAT THE GATEWAY SERVES, read from the same `/v1/models` the rooms read.
 *
 * Counted, never typed: the catalog moves without this file, so a number written
 * here is wrong by the next deploy. An empty answer says the account reaches
 * nothing rather than drawing a zero, and the mark comes from the model's own
 * id so a family wears the logo of the lab that makes it.
 */
function Served() {
  const { models, loading, error } = useModels()

  if (loading) {
    return <Text fontSize="$3" color="$soft">Reading the catalog.</Text>
  }
  if (error) {
    return <Text fontSize="$3" color="$soft">The catalog did not answer: {error.message}</Text>
  }
  if (models.length === 0) {
    return (
      <Text fontSize="$3" color="$soft">
        No model answers on this account. Sign in to reach the ones your org opens.
      </Text>
    )
  }

  return (
    <YStack gap="$3">
      <Text fontSize="$3" color="$soft">
        {models.length} models answer at /v1/models on this account.
      </Text>
      <YStack>
        {models.map((m) => (
          <XStack
            key={m.id}
            items="center"
            gap="$2.5"
            py="$2"
            borderBottomWidth={1}
            borderColor="$borderColor"
          >
            <ProviderMark model={m.id} org={m.owned_by} size={16} ink />
            <Text fontSize="$2" color="$ink" flex={1}>{m.id}</Text>
            {m.owned_by ? <Text fontSize="$1" color="$soft">{m.owned_by}</Text> : null}
          </XStack>
        ))}
      </YStack>
      <XStack>
        <Box render={<a href={site('/models')} />} {...tap}>
          <XStack items="center" gap="$2" py="$2">
            <Text fontSize="$3" color="$ink">Browse the model catalog</Text>
            <ArrowUpRight size={13} aria-hidden />
          </XStack>
        </Box>
      </XStack>
    </YStack>
  )
}

/** Who is signed in, and where they can act. */
function Account() {
  const identity = useIamIdentity()
  const { isAuthenticated } = useIam()
  const logout = useSignOut()
  const { organizations, currentOrgId, currentRole, switchOrg } = useOrganizations()

  if (!isAuthenticated || !identity) {
    return <Text fontSize="$3" color="$soft">Sign in to see your account.</Text>
  }

  return (
    <YStack gap="$4">
      <XStack items="center" gap="$3">
        <YStack
          width={44}
          height={44}
          rounded={22}
          bg="$borderColor"
          items="center"
          justify="center"
        >
          <Text fontSize="$3" color="$ink">{identity.initials}</Text>
        </YStack>
        <YStack gap="$1" flex={1} minW={0}>
          <Text fontSize="$4" color="$ink">{identity.name}</Text>
          {identity.email ? <Text fontSize="$2" color="$soft">{identity.email}</Text> : null}
        </YStack>
      </XStack>

      <Separator />

      <YStack gap="$2">
        <Text fontSize="$2" color="$soft">Organizations</Text>
        {organizations.length === 0 ? (
          <Text fontSize="$3" color="$soft">You are not a member of an organization.</Text>
        ) : (
          organizations.map((o) => {
            const here = o.name === currentOrgId
            return (
              <Box render={<button type="button" />} key={o.name} onClick={() => { pick(o.name); switchOrg(o.name) }} {...tap}>
                <XStack items="center" justify="space-between" py="$2" width="100%" gap="$2">
                  <Text fontSize="$3" color={here ? '$ink' : '$soft'}>{o.displayName || o.name}</Text>
                  {here && currentRole ? <Text fontSize="$2" color="$soft">{currentRole}</Text> : null}
                </XStack>
              </Box>
            )
          })
        )}
      </YStack>

      <Separator />

      <XStack>
        <Button size="sm" onClick={() => logout()}>Sign out</Button>
      </XStack>
    </YStack>
  )
}

/** The plan, and the one control that has to leave. */
function Billing() {
  const { isAuthenticated } = useIam()
  const { tier } = useTier(isAuthenticated, org())
  const sub = useSubscription(isAuthenticated, org())
  // WHAT THE CUSTOMER BOUGHT, and its term: a plan is a subscription with usage
  // limits, so its line is the price and the renewal, never a balance.
  const plan = tier ? planName(tier.plan) || tier.tier.displayName || tier.tier.name : null
  return (
    <YStack gap="$4">
      <Text fontSize="$3" color="$soft">
        What this account is billed for, and what it has spent.
      </Text>
      {plan ? (
        <Text fontSize="$4" color="$ink">
          {sub ? `${plan} · ${renewal(sub)}` : plan}
        </Text>
      ) : null}
      <Usage sections={{ overview: true, chart: false, categories: true, breakdown: true, activity: false }} title="Spend" />
      <Separator />
      <YStack gap="$2">
        <Text fontSize="$2" color="$soft">Payment</Text>
        <Text fontSize="$3" color="$soft">
          A card is entered on the payment host and nowhere else, so this is the one
          control here that opens another surface.
        </Text>
        <XStack>
          <Box render={<a href={payPage()} target="_blank" rel="noreferrer" />} {...tap}>
            <XStack items="center" gap="$2" py="$2">
              <Text fontSize="$3" color="$ink">Manage plan and payment method</Text>
              <ExternalLink size={13} aria-hidden />
            </XStack>
          </Box>
        </XStack>
      </YStack>
    </YStack>
  )
}

/**
 * The one usage panel every Hanzo product renders, reading as this account — for a
 * reader with no plan. A plan holder's usage is the plan's shares (`meters` draws
 * them where usage is the subject), never money (spendShown).
 */
function Usage({ sections, title, meters = false }: { sections?: Record<string, boolean>; title?: string; meters?: boolean }) {
  const { accessToken, isAuthenticated } = useIam()
  const read = useLimits(isAuthenticated, org())

  if (!isAuthenticated || !accessToken) {
    return <Text fontSize="$3" color="$soft">Sign in to see your usage.</Text>
  }
  if (read.limits?.plan) return meters ? <Meters limits={read.limits} large /> : null
  if (!spendShown(read)) return null
  // The address is read HERE rather than at import: the panel sends the bearer
  // with every read, and a credentialed read to an absolute address from a page
  // the gateway does not admit dies in preflight — which drew this panel as an
  // account that had spent nothing.
  return <UsagePanel baseUrl={api()} token={accessToken} sections={sections} title={title} upgrade={payPage()} />
}

/** Keys are minted and revoked through the console, which holds the one issuer. */
function Keys() {
  return (
    <YStack gap="$2">
      <Text fontSize="$3" color="$soft">
        A key is shown once, at the moment it is minted. That happens where the
        issuer lives.
      </Text>
      <XStack>
        <Box render={<a href="https://platform.hanzo.ai/api-keys" target="_blank" rel="noreferrer" />} {...tap}>
          <XStack items="center" gap="$2" py="$2">
            <Text fontSize="$3" color="$ink">Manage API keys</Text>
            <ExternalLink size={13} aria-hidden />
          </XStack>
        </Box>
      </XStack>
    </YStack>
  )
}

const HISTORICAL_PERSONAS = [
  { id: 'architect', name: 'Software Architect', role: 'Full-stack & systems design' },
  { id: 'satoshi', name: 'Satoshi Nakamoto', role: 'Distributed cryptography & consensus' },
  { id: 'turing', name: 'Alan Turing', role: 'Algorithmic logic & formal verification' },
  { id: 'ada', name: 'Ada Lovelace', role: 'Computational precision & analysis' },
  { id: 'davinci', name: 'Leonardo da Vinci', role: 'Polymathic engineering & design' },
]

function AgentSettings() {
  const [instructions, setInstructions] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('hanzo.agent.instructions') || 'You are an autonomous AI software engineer at Hanzo. Think step-by-step and write robust code.'
  })
  const [persona, setPersona] = useState(() => {
    if (typeof window === 'undefined') return 'architect'
    return localStorage.getItem('hanzo.agent.persona') || 'architect'
  })
  const [autonomy, setAutonomy] = useState<'supervised' | 'autonomous'>(() => {
    if (typeof window === 'undefined') return 'autonomous'
    return (localStorage.getItem('hanzo.agent.autonomy') as any) || 'autonomous'
  })
  const [saved, setSaved] = useState(false)

  const save = () => {
    localStorage.setItem('hanzo.agent.instructions', instructions)
    localStorage.setItem('hanzo.agent.persona', persona)
    localStorage.setItem('hanzo.agent.autonomy', autonomy)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <YStack gap="$4" maxW={480}>
      <Text fontSize="$3" color="$soft">
        Nothing is bound to this surface yet — when you bind a personal agent, its persona, tools and memory live here rather than in a shared team.
      </Text>
      <YStack gap="$1.5">
        <Text fontSize="$3" fontWeight="600" color="$ink">Persona & Historical Character</Text>
        <Text fontSize="$2" color="$soft">
          Pick an intellectual archetype for agent reasoning and tone.
        </Text>
        <XStack flexWrap="wrap" gap="$2" pt="$1">
          {HISTORICAL_PERSONAS.map((p) => {
            const active = persona === p.id
            return (
              <Box
                render={<button type="button" />}
                key={p.id}
                {...tap}
                onClick={() => setPersona(p.id)}
                {...CHOICE}
                bg={active ? 'var(--edge, var(--white-14))' : 'transparent'}
                borderColor={active ? 'var(--borderColor, var(--white-22))' : 'var(--white-08)'}
                py={6}
                px={12}
              >
                <Text fontSize="$2" fontWeight={active ? '600' : '400'} color={active ? '$ink' : '$soft'}>
                  {p.name}
                </Text>
              </Box>
            )
          })}
        </XStack>
      </YStack>

      <Separator />

      <YStack gap="$1.5">
        <Text fontSize="$3" fontWeight="600" color="$ink">System Prompt Instructions</Text>
        <Text fontSize="$2" color="$soft">
          Custom system directions prepended to all coding and research runs.
        </Text>
        <Text
          render={<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} />}
          width="100%"
          bg="var(--panel, color-mix(in srgb, var(--pure-black) 30%, transparent))"
          color="inherit"
          borderWidth={1}
          borderColor="var(--borderColor, var(--white-15))"
          rounded={8}
          p={10}
          fontSize="$2"
          fontFamily="$mono"
        />
      </YStack>

      <Separator />

      <YStack gap="$1.5">
        <Text fontSize="$3" fontWeight="600" color="$ink">Autonomy & Permissions</Text>
        <XStack gap="$2">
          <Box
            render={<button type="button" />}
            {...tap}
            onClick={() => setAutonomy('autonomous')}
            {...CHOICE}
            flex={1}
            p={10}
            bg={autonomy === 'autonomous' ? 'var(--edge, var(--white-14))' : 'transparent'}
            borderColor={autonomy === 'autonomous' ? 'var(--borderColor, var(--white-22))' : 'var(--white-08)'}
          >
            <Text fontSize="$2" fontWeight="600" color="$ink">Autonomous</Text>
            <Text fontSize="$1" color="$soft">Executes tools & writes code without interrupting.</Text>
          </Box>
          <Box
            render={<button type="button" />}
            {...tap}
            onClick={() => setAutonomy('supervised')}
            {...CHOICE}
            flex={1}
            p={10}
            bg={autonomy === 'supervised' ? 'var(--edge, var(--white-14))' : 'transparent'}
            borderColor={autonomy === 'supervised' ? 'var(--borderColor, var(--white-22))' : 'var(--white-08)'}
          >
            <Text fontSize="$2" fontWeight="600" color="$ink">Supervised</Text>
            <Text fontSize="$1" color="$soft">Requests confirmation before file writes and commands.</Text>
          </Box>
        </XStack>
      </YStack>

      <XStack self="flex-start" pt="$2">
        <Button size="sm" onClick={save}>
          {saved ? 'Saved' : 'Save agent preferences'}
        </Button>
      </XStack>
    </YStack>
  )
}

/**
 * WHAT A RUN MAY REACH FOR — the four capabilities, described and not measured.
 *
 * Each row used to carry a badge reading "Enabled", and the MCP row read
 * "Active (:8080/mcp)". Nothing asked. No call stands behind any of the four,
 * so the badges said "on" for a reader whose run had none of it, and the port
 * was one developer's machine printed on everybody's settings pane. A green
 * light nobody wired is worse than no light: it is read as a check that passed.
 *
 * These are facts about the PRODUCT — what a run is allowed to do — which is
 * what this pane is for. Whether a given run got them is a fact about that run,
 * and the run is where it belongs.
 */
function Capabilities() {
  return (
    <YStack gap="$3" maxW={480}>
      <Text fontSize="$3" color="$soft">
        What models and agent swarms are granted access to during tasks.
      </Text>
      <YStack gap="$2" pt="$1">
        {[
          { title: 'Filesystem (Read / Write)', desc: 'Create, modify, and delete workspace files in the target repository.' },
          { title: 'Shell & Terminal Exec', desc: 'Execute build, test, and shell commands in isolated sandbox VMs.' },
          { title: 'Live Web & Search', desc: 'Query internet search APIs and fetch web documentation.' },
          { title: 'MCP Protocol Server', desc: 'Expose local and remote tools via Model Context Protocol at /mcp.' },
        ].map((cap) => (
          <YStack key={cap.title} gap="$0.5" p="$2.5" rounded="$3" borderWidth={1} borderColor="$borderColor">
            <Text fontSize="$3" fontWeight="600" color="$ink">{cap.title}</Text>
            <Text fontSize="$2" color="$soft">{cap.desc}</Text>
          </YStack>
        ))}
      </YStack>
    </YStack>
  )
}

function MemorySettings() {
  const [cleared, setCleared] = useState(false)

  const clearMemory = () => {
    localStorage.removeItem('hanzo.chat.history')
    setCleared(true)
    setTimeout(() => setCleared(false), 2000)
  }

  return (
    <YStack gap="$3" maxW={480}>
      <Text fontSize="$3" color="$soft">
        Semantic memory and conversation recall across sessions.
      </Text>
      {/* Described, not measured — the badge here read "Active (pgvector)" for
          an index nothing had asked about, and named the store it is kept in,
          which is the estate talking to itself. The button below is the one
          thing on this pane that acts, and it acts on this browser. */}
      <YStack gap="$0.5" p="$2.5" rounded="$3" borderWidth={1} borderColor="$borderColor">
        <Text fontSize="$3" fontWeight="600" color="$ink">Semantic Vector Index</Text>
        <Text fontSize="$2" color="$soft">Automatically indexes past workspace sessions into vector memory.</Text>
      </YStack>
      <XStack self="flex-start" pt="$2">
        <Button size="sm" variant="outline" onClick={clearMemory}>
          {cleared ? 'Memory cleared' : 'Clear local memory cache'}
        </Button>
      </XStack>
    </YStack>
  )
}
