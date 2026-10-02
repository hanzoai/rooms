'use client'

// The directory: who is in this org, and who you can put in a room.
//
// IT IS A LIST OF SUBJECTS AND NOTHING ELSE. People, the org's agents, and the
// presets an org can install as one. It holds no conversations, keeps no
// threads, and remembers nothing of its own — the rooms it starts live in the
// thread store with every other conversation, which is `conversations.ts`.
//
// WHAT IT USED TO DO. Four `localStorage` keys: a roster of people it invented,
// a list of agents it invented, a set of `direct_…`/`group_…`/`call_…` threads
// nothing on the platform had ever seen, and an event the sidebar merged them
// in through. Adding a person wrote a row into that store — no invitation, no
// account, nobody told — and the row was gone on the next machine. Pressing
// Call minted a thread whose title began with a telephone and rang nowhere.
//
// EVERY ROW IS NOW A READ, and every control a write:
//   people   GET  /v1/iam/scim/v2/Users?owner=<org>   (`usePeople`)
//   agents   GET  /v1/agents                          (`useCrew`, crew.tsx)
//   presets  GET  /v1/agent/chat/presets              (the catalog, public)
//   invite   POST /v1/iam/invitations                 (`createInvitation`)
//   agent    POST /v1/agents                          (`Hire`, the crew's sheet)
//   room     POST /v1/agents/chat/conversations       (`start`)
//
// THERE IS NO CALL CONTROL, because there is no call. Measured against the
// platform's own contract — 1629 paths in /v1/openapi.json — nothing serves
// signalling, an SFU, a room token or a TURN credential. A button that says
// Call and opens a chat is worse than no button: it reports a thing that did
// not happen. When the estate serves a call, the room it attaches to is the one
// `start` already writes, and this file gains a verb rather than a store.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRooms } from './host'
import { Check, Plus, Search, UserPlus } from 'lucide-react'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { useAi, useModels, usePeople, useThreads } from '@hanzo/ai/react'
import { useIam, useOrganizations } from '@hanzo/iam/react'
import { hasSession } from './lib/session'
import { useHydrated } from './lib/hydrated'
import { ENSO, served } from './lib/ai'
import { createInvitation, inviteLink } from './lib/invite'
import { reach } from './lib/reach'
import { Face } from './cast'
import { Take } from './copy'
import { Hire, useCrew } from './crew'
import { called } from './team'
import { say } from './failure'
import { openThread } from './open'
import { spokenAt, start } from "./conversations"
import type { Member } from "./roster"

/** A preset, as `/v1/agent/chat/presets` publishes one. */
interface Preset {
  id: string
  title?: string
  systemPrompt?: string
}

/**
 * WHAT A ROW IS, whichever list it came from.
 *
 * `name` is the handle the platform knows — an agent's name, a person's login —
 * and `label` is what a reader is shown. They differ for a person and agree for
 * an agent, and keeping both is what lets a row be pressed into a room without
 * the room having to look anybody up again.
 */
interface Entry {
  key: string
  kind: Kind
  name: string
  label: string
  /** The one line under the name: an address, what an agent is for. */
  note: string
  avatar?: string
  emoji?: string
  /** When a conversation last named them, or 0. See `spokenAt`. */
  at: number
}

/**
 * THREE KINDS, and the whole taxonomy.
 *
 * A preset is not a fourth sort of contact: it is an agent this org has not
 * installed yet, so it cannot be spoken to and its one control installs it.
 * "Preset" is the platform's own word for it — the id the chat round accepts in
 * `preset` — and a second word here would be a second thing.
 */
type Kind = 'person' | 'agent' | 'preset'

const TABS: { id: Kind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'person', label: 'People' },
  { id: 'agent', label: 'Agents' },
  { id: 'preset', label: 'Presets' },
]

/** A–Z, or who you spoke to last. Two orders, and both are answerable. */
type Order = 'name' | 'recent'

export function Contacts() {
  const hydrated = useHydrated()
  const { isAuthenticated } = useIam()
  const { currentOrgId } = useOrganizations()
  const signedIn = isAuthenticated || hasSession()

  // A prerender knows neither the reader nor the org, so it draws the heading
  // and waits. Announcing "sign in" before hydration tells a signed-in reader
  // they are signed out for a frame.
  if (!hydrated) return <Alone>&nbsp;</Alone>
  if (!signedIn) return <Alone>Sign in to see who is in your organization.</Alone>
  if (!currentOrgId) return <Alone>This account is not in an organization yet.</Alone>
  return <Roster owner={currentOrgId} />
}

/** The room's one heading, for every state that has nothing to list. */
function Alone({ children }: { children: React.ReactNode }) {
  return (
    <YStack flex={1} items="center" justify="center" p="$6" gap="$3">
      <Text render="h1" fontSize="$4" fontWeight="600" color="$ink">
        Contacts
      </Text>
      <Text fontSize="$3" color="$soft" maxW={420} text="center">
        {children}
      </Text>
    </YStack>
  )
}

/** A read that answered no, said once, above whatever else is on screen. */
function Note({ children }: { children: string }) {
  return (
    <Text fontSize="$2" color="$soft" px="$3" py="$2">
      {children}
    </Text>
  )
}

/**
 * The directory itself.
 *
 * SPLIT OUT because `usePeople` needs an owner and a hook cannot be called
 * conditionally — the same reason Home and Vibe split theirs.
 */
function Roster({ owner }: { owner: string }) {
  const ai = useAi()
  const { router } = useRooms()
  const { people, loading: reading, error: unread } = usePeople({ owner, service: false })
  // `create` and not `ai.agents.create`: the hook's own writer refreshes the
  // list it read, which is what moves an installed preset out of the catalog
  // and into the org's agents without a reload.
  const { agents, create, loading: gathering, error: ungathered } = useCrew()
  // WHAT "RECENTLY" MEANS: the conversations this reader has. It is the same
  // read the sidebar makes, and the only record of who a room was with.
  const { threads } = useThreads()
  // An installed preset needs a model, and `POST /v1/agents` refuses one this
  // deployment does not serve — so it is named against the served catalog by
  // the one function that does that, rather than typed in and hoped for.
  const { models } = useModels()

  // `null` is the catalog unknown; `[]` is a deployment that publishes none.
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [unlisted, setUnlisted] = useState<unknown>(null)
  useEffect(() => {
    const stop = new AbortController()
    ai.http
      .collection<Preset>('presets', {
        method: 'GET',
        path: '/v1/agent/chat/presets',
        signal: stop.signal,
      })
      .then(setPresets)
      .catch((e: unknown) => {
        if (!stop.signal.aborted) setUnlisted(e)
      })
    return () => stop.abort()
  }, [ai])

  const [tab, setTab] = useState<Kind | 'all'>('all')
  const [order, setOrder] = useState<Order>('name')
  const [look, setLook] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [hiring, setHiring] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [wrong, setWrong] = useState<string | null>(null)

  const entries = useMemo<Entry[]>(() => {
    const rows: Entry[] = []
    for (const one of people) {
      const label = one.displayName || one.name
      rows.push({
        key: `person:${one.id}`,
        kind: 'person',
        name: one.name,
        label,
        note: one.email ?? '',
        at: spokenAt(threads, label),
      })
    }
    for (const one of agents) {
      rows.push({
        key: `agent:${one.id}`,
        kind: 'agent',
        name: one.name,
        label: called(one.name),
        note: one.description || one.model || '',
        avatar: one.avatar,
        emoji: one.emoji,
        at: spokenAt(threads, one.name),
      })
    }
    // A preset the org has already installed IS the agent above it. Drawing
    // both would offer to install what is already here.
    for (const one of presets ?? []) {
      if (agents.some((made) => made.name === one.id)) continue
      rows.push({
        key: `preset:${one.id}`,
        kind: 'preset',
        name: one.id,
        label: one.title || one.id,
        note: 'Not installed',
        at: 0,
      })
    }
    return rows
  }, [people, agents, presets, threads])

  const shown = useMemo(() => {
    const q = look.trim().toLowerCase()
    return entries
      .filter((one) => tab === 'all' || one.kind === tab)
      .filter((one) => !q || `${one.label} ${one.name} ${one.note}`.toLowerCase().includes(q))
      .sort((a, b) =>
        order === 'name'
          ? a.label.localeCompare(b.label)
          : b.at - a.at || a.label.localeCompare(b.label),
      )
  }, [entries, tab, look, order])

  const install = useCallback(
    async (one: Entry) => {
      const preset = (presets ?? []).find((p) => p.id === one.name)
      if (!preset || busy) return
      setBusy(one.key)
      setWrong(null)
      try {
        // The list this row leaves and the list it joins are both `useAgents`,
        // so the row moves by itself.
        await create({
          name: preset.id,
          model: served(models, ENSO),
          ...(preset.systemPrompt ? { instructions: preset.systemPrompt } : {}),
          ...(preset.title ? { description: preset.title } : {}),
        })
      } catch (e) {
        setWrong(reach(e))
      } finally {
        setBusy(null)
      }
    },
    [busy, create, models, presets],
  )

  /**
   * INTO A ROOM, by the one call that starts one.
   *
   * One selected is a direct conversation, several is a group, and a group of
   * agents or a mix of both is the same act — nothing here branches on how many
   * or on what kind, because the thread store does not either.
   */
  const enter = useCallback(async () => {
    const members: Member[] = picked
      .map((key) => entries.find((one) => one.key === key))
      .filter((one): one is Entry => Boolean(one))
      .map((one) => ({ id: one.key, name: one.label || one.name, agent: one.kind === 'agent' }))
    if (members.length === 0 || busy) return
    setBusy('room')
    setWrong(null)
    try {
      const id = await start(ai, members)
      // The selection the chat pane reads, and the address a reload lands on.
      openThread(id)
      router.push(`/chat?thread=${encodeURIComponent(id)}`)
    } catch (e) {
      setWrong(reach(e))
    } finally {
      setBusy(null)
    }
  }, [ai, busy, entries, picked, router])

  const waiting = (reading && people.length === 0) || (gathering && agents.length === 0)

  return (
    <YStack flex={1} minH={0}>
      <XStack
        height={48}
        shrink={0}
        items="center"
        gap="$2"
        px="$3"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <Text render="h1" flex={1} fontSize="$3" fontWeight="600" color="$ink" numberOfLines={1}>
          Contacts
        </Text>
        <Control onPress={() => setInviting(true)} icon={<UserPlus size={13} aria-hidden />}>
          Invite
        </Control>
        <Control onPress={() => setHiring(true)} icon={<Plus size={13} aria-hidden />}>
          New agent
        </Control>
      </XStack>

      <XStack
        shrink={0}
        items="center"
        gap="$2"
        px="$3"
        py="$2"
        borderBottomWidth={1}
        borderColor="$borderColor"
        flexWrap="wrap"
      >
        <XStack
          items="center"
          gap="$1.5"
          flex={1}
          minW={160}
          px="$2"
          borderWidth={1}
          borderColor="$borderColor"
          rounded="$3"
        >
          <Search size={13} aria-hidden />
          <Text
            render={<input value={look} onChange={(e) => setLook(e.target.value)} placeholder="Search" aria-label="Search contacts" />}
            flex={1}
            minW={0}
            bg="transparent"
            borderWidth={0}
            outlineStyle="none"
            color="inherit"
            fontSize="$2"
            px={0}
            py={6}
          />
        </XStack>
        {TABS.map((one) => (
          <Pill key={one.id} on={tab === one.id} onPress={() => setTab(one.id)}>
            {one.label}
          </Pill>
        ))}
        {/* WHICH KIND and IN WHAT ORDER are two questions, and the pills that
            ask them are the same shape — so a rule stands between the groups.
            Without it the row reads as six settings of one thing. */}
        <Box width={1} height={18} bg="$borderColor" />
        {/* TWO ORDERS, BOTH TRUE. A–Z is the name; Recent is the last
            conversation that named them, which is the only activity the thread
            store records about a contact. */}
        <Pill on={order === 'name'} onPress={() => setOrder('name')}>
          A–Z
        </Pill>
        <Pill on={order === 'recent'} onPress={() => setOrder('recent')}>
          Recent
        </Pill>
      </XStack>

      {unread ? <Note>{say(unread, 'your organization')}</Note> : null}
      {ungathered ? <Note>{say(ungathered, "this org's agents")}</Note> : null}
      {unlisted ? <Note>{say(unlisted, 'the agent presets')}</Note> : null}
      {wrong ? <Note>{wrong}</Note> : null}

      <YStack flex={1} minH={0} overflow="scroll">
        {waiting && shown.length === 0 ? (
          <Note>Reading your directory.</Note>
        ) : shown.length === 0 ? (
          <Note>
            {look.trim()
              ? `Nobody here matches “${look.trim()}”.`
              : tab === 'agent'
                ? 'No agents yet. New agent writes one.'
                : tab === 'preset'
                  ? 'Every preset this deployment publishes is installed.'
                  : 'Nobody else in this organization yet. Invite sends the link.'}
          </Note>
        ) : (
          shown.map((one) => (
            <Row
              key={one.key}
              one={one}
              on={picked.includes(one.key)}
              busy={busy === one.key}
              onPress={() =>
                one.kind === 'preset'
                  ? void install(one)
                  : setPicked((was) =>
                      was.includes(one.key)
                        ? was.filter((k) => k !== one.key)
                        : [...was, one.key],
                    )
              }
            />
          ))
        )}
      </YStack>

      {picked.length > 0 ? (
        <XStack
          shrink={0}
          items="center"
          gap="$2"
          p="$3"
          borderTopWidth={1}
          borderColor="$borderColor"
        >
          <Text flex={1} fontSize="$2" color="$soft" numberOfLines={1}>
            {picked.length === 1 ? '1 selected' : `${picked.length} selected`}
          </Text>
          <Control onPress={() => setPicked([])}>Clear</Control>
          <Control onPress={() => void enter()} strong>
            {busy === 'room' ? 'Opening…' : 'Start conversation'}
          </Control>
        </XStack>
      ) : null}

      {inviting ? <Invite owner={owner} onClose={() => setInviting(false)} /> : null}
      {hiring ? <Hire onClose={() => setHiring(false)} onMade={() => setHiring(false)} /> : null}
    </YStack>
  )
}

/** One row: a face, a name, a line about them, and what pressing it does. */
function Row({
  one,
  on,
  busy,
  onPress,
}: {
  one: Entry
  on: boolean
  busy: boolean
  onPress: () => void
}) {
  return (
    <Box
      render="button"
      onClick={onPress}
      aria-label={one.label}
      aria-pressed={one.kind === 'preset' ? undefined : on}
      width="100%"
      display="block"
      cursor="pointer"
      borderWidth={0}
      borderBottomWidth={1}
      borderBottomColor="var(--borderColor, var(--white-08))"
      bg={on ? 'var(--raised, var(--white-06))' : 'transparent'}
    >
      <XStack gap="$3" items="center" p="$3">
        <Face src={one.avatar} emoji={one.emoji} name={one.name} size={32} />
        {/* A `<button>` centres its text; a row reads left. */}
        <YStack flex={1} minW={0}>
          <Text fontSize="$2" color="$ink" numberOfLines={1} text="left">
            {one.label}
          </Text>
          {one.note ? (
            <Text fontSize="$1" color="$soft" numberOfLines={1} text="left">
              {one.note}
            </Text>
          ) : null}
        </YStack>
        {one.kind === 'preset' ? (
          <Text fontSize="$2" color="$soft">
            {busy ? 'Installing…' : 'Install'}
          </Text>
        ) : on ? (
          <Check size={14} aria-hidden />
        ) : null}
      </XStack>
    </Box>
  )
}

/** A named control. One shape for every button in this room. */
function Control({
  children,
  onPress,
  icon,
  strong,
}: {
  children: React.ReactNode
  onPress: () => void
  icon?: React.ReactNode
  strong?: boolean
}) {
  return (
    <Box
      render="button"
      onClick={onPress}
      px="$3"
      py="$2"
      rounded="$3"
      borderWidth={strong ? 0 : 1}
      borderColor="$borderColor"
      bg={strong ? '$ink' : 'transparent'}
      hoverStyle={{ bg: strong ? '$ink' : '$hover' }}
      cursor="pointer"
    >
      <XStack items="center" gap="$1.5">
        {icon}
        <Text fontSize="$2" color={strong ? '$background' : '$ink'} fontWeight={strong ? '600' : undefined} numberOfLines={1}>
          {children}
        </Text>
      </XStack>
    </Box>
  )
}

/** A switch that is on or off — a tab, an order. Same shape, so they read alike. */
function Pill({
  children,
  on,
  onPress,
}: {
  children: React.ReactNode
  on: boolean
  onPress: () => void
}) {
  return (
    <Box
      render="button"
      onClick={onPress}
      aria-pressed={on}
      px="$2.5"
      py="$1.5"
      rounded="$3"
      borderWidth={1}
      borderColor={on ? '$ink' : '$borderColor'}
      hoverStyle={{ bg: '$hover' }}
      cursor="pointer"
    >
      <Text fontSize="$2" color={on ? '$ink' : '$soft'} numberOfLines={1}>
        {children}
      </Text>
    </Box>
  )
}

/**
 * ADDING A PERSON IS AN INVITATION, and it is the only honest shape for it.
 *
 * The other way in is `POST /v1/iam/users`, which takes the password the person
 * will sign in with — so adding a colleague would mean choosing their
 * credential and then telling it to them. An invitation is a code they redeem
 * on hanzo.id under a password only they ever see.
 *
 * The link is the deliverable. Nothing here sends mail: no route on the
 * platform mails an invitation, so this hands over the address instead of
 * claiming to have sent one.
 */
function Invite({ owner, onClose }: { owner: string; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState<string | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const make = async () => {
    if (busy) return
    setBusy(true)
    setWrong(null)
    try {
      const invitation = await createInvitation(owner, email.trim() || undefined)
      setLink(inviteLink(invitation.owner, invitation.code))
    } catch (e) {
      setWrong(reach(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box
      position="fixed"
      inset={0}
      z="var(--z-modal)"
      display="flex"
      items="center"
      justify="center"
      p="$4"
      bg="$sunken"
      onClick={(e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <YStack
        role="dialog"
        aria-label="Invite"
        width="100%"
        maxW={440}
        gap="$3"
        p="$5"
        rounded="$6"
        borderWidth={1}
        borderColor="$borderColor"
        bg="$background"
      >
        <Text fontSize="$5" fontWeight="600" color="$ink">
          Invite
        </Text>
        {link ? (
          <>
            <Text fontSize="$2" color="$soft">
              This link joins {owner}. It redeems once.
            </Text>
            <XStack items="center" gap="$2">
              <Text flex={1} fontSize="$2" color="$ink" numberOfLines={1}>
                {link}
              </Text>
              <Take text={link} says="the invitation link" label="Copy" />
            </XStack>
          </>
        ) : (
          <>
            <Text
              render={
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void make()
                  }}
                  placeholder="Their email — or leave it open to anyone with the link"
                  aria-label="Email"
                  autoFocus
                />
              }
              width="100%"
              bg="transparent"
              borderWidth={1}
              borderColor="var(--border)"
              rounded="var(--radius-md)"
              px={10}
              py={8}
              outlineStyle="none"
              color="inherit"
              fontSize="$2"
            />
            {wrong ? (
              <Text fontSize="$2" color="$soft">
                {wrong}
              </Text>
            ) : null}
          </>
        )}
        <XStack justify="flex-end" gap="$2">
          <Control onPress={onClose}>{link ? 'Done' : 'Cancel'}</Control>
          {link ? null : (
            <Control onPress={() => void make()} strong>
              {busy ? 'Making…' : 'Make a link'}
            </Control>
          )}
        </XStack>
      </YStack>
    </Box>
  )
}
