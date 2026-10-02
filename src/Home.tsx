'use client'

// Home: one question at the top, and what to do next underneath.
//
// THE COMPOSER IS THE PAGE. Everything else is a card, and every card is a real
// affordance reading real cloud data — no placeholder feed, no invented metric,
// and no list that renders unknown as zero.
//
// The field is `@hanzo/ui/chat`'s `Composer`, the same component the browser
// extension's home mounts and the same one `Chat.tsx` and `Work.tsx` already
// use. Its `children` is the documented toolbar slot — "where a surface puts
// its ModelSelector, attachment control or mode chips" — so the source chips go
// THERE and the package needs no change to carry them. The four options above
// it are this surface's, for the same reason: a home decides what it starts.

import { dev } from './lib/host'
import { useEffect, useMemo, useState } from 'react'
import { AtSign, Blocks, Bot, Code2, FolderGit2, Hash, MessageSquare, Plus, UserPlus } from 'lucide-react'
import { useAgents, usePeople, useSessions, useThreads } from '@hanzo/ai/react'
import type { AiClient } from '@hanzo/ai'
import { Composer } from '@hanzo/ui/chat'
import { Crew } from './crew'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { tap } from './lib/tap'
import { Grid } from '@hanzo/ui/grid'
import { useIam, useOrganizations } from '@hanzo/iam/react'
import { hasSession } from './lib/session'
import { useAi } from './lib/ai'
import { useHydrated } from './lib/hydrated'
import { useOpen } from './open'
import { plainly, say } from './failure'
import { Directory } from './Directory'
import { Bar } from './progress'
import { Card, Go, INK, Quiet, Row, SOFT, CHOSEN } from './card'
import { Talk } from './Talk'
import { useMe } from './roster'
import { roomKey, teamKey, useTeamRooms } from './rooms'
import { invite, apps, projects } from './lib/home'
import { BAD } from './lib/mix'

/** What a question can start here. Four, in the order they escalate. */
const MODES = [
  { id: 'chat', label: 'Chat', asks: 'Ask anything' },
  { id: 'dev', label: 'Dev', asks: 'Describe what to build' },
  { id: 'news', label: 'News', asks: 'What happened?' },
  { id: 'research', label: 'Research', asks: 'What should we dig into?' },
] as const

export type Mode = (typeof MODES)[number]['id']

/**
 * Where a grounded answer may look, as the `@source` hints the answer engine
 * already reads (`SearchOptions.sources` in `@hanzo/ai`). Chat and Dev do not
 * search, so the chips are drawn only for the two modes that do — and they live
 * in the composer's footer row, whose height the send control already sets, so
 * switching modes moves nothing.
 */
const SOURCES = ['web', 'news', 'academic', 'github', 'reddit', 'x']

const GROUNDS = (mode: Mode): boolean => mode === 'news' || mode === 'research'

/**
 * Ask, however the host answers.
 *
 * The default sends the question to /chat, which is the one room on this site
 * that reads a question off the address (`?q=`, the name every Hanzo surface
 * takes). A host that already HAS the thread — the chat pane, where this home
 * belongs — passes its own `send` instead and nothing navigates.
 */
export interface HomeProps {
  ask?: (question: string, mode: Mode, sources: string[]) => void
}

/**
 * A ROOM IS READ HERE. Home is the org's room: the rail's channels and direct
 * messages open in this pane (`Talk`), keyed `team:<space>/<id>` in the
 * selection slot and in the address, and the Rooms card below lists them and
 * opens a new one. What other networks carry in stays in the Inbox, under its
 * own key.
 */
export function Home({ ask }: HomeProps) {
  const [mode, setMode] = useState<Mode>('chat')
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  // Connecting an app happens in the Directory, so the home mounts the
  // Directory rather than linking somewhere that is not it. It is a Dialog —
  // closed, it draws nothing — so a second instance beside the shell's costs a
  // component and no pixels, and there is still ONE directory in the codebase.
  const [directory, setDirectory] = useState(false)
  const { room, openRoom } = useOpen()
  const held = useTeamRooms()

  const here = MODES.find((m) => m.id === mode) ?? MODES[0]
  const grounded = GROUNDS(mode)

  const at = roomKey(room)
  if (at) return <Open at={at} rooms={held} back={() => openRoom(null)} />

  const send = () => {
    const question = draft.trim()
    if (!question) return
    setDraft('')
    const hints = grounded ? picked : []
    if (ask) {
      ask(question, mode, hints)
      return
    }
    // The hints ride IN the question, which is what they are: the engine reads
    // `@news` in the query. Appending them to a chat turn would be noise, so
    // only a grounded mode carries them.
    const q = hints.length ? `${question} ${hints.map((s) => `@${s}`).join(' ')}` : question
    window.location.href = `/chat?q=${encodeURIComponent(q)}`
  }

  return (
    <YStack data-home flex={1} minH={0} width="100%" overflowY="auto" overflowX="hidden">
      <YStack
        width="100%"
        maxW={720}
        mx="auto"
        px="$4"
        pt="$8"
        gap="$4"
        $sm={{ pt: '$10' }}
      >
        <Text
          render="h1"
          fontSize="$8"
          fontWeight="500"
          color={INK}
          text="center"
          $sm={{ fontSize: '$9' }}
        >
          What are we building?
        </Text>

        <XStack justify="center" gap="$1" flexWrap="wrap">
          {MODES.map((one) => (
            <Box
              key={one.id}
              data-tab={one.id}
              render="button"
              onClick={() => setMode(one.id)}
              aria-current={mode === one.id}
              px="$3"
              py="$2"
              rounded="$10"
              bg={mode === one.id ? CHOSEN : 'transparent'}
              hoverStyle={{ bg: '$hover' }}
            >
              <Text
                fontSize="$3"
                fontWeight="500"
                color={mode === one.id ? INK : SOFT}
              >
                {one.label}
              </Text>
            </Box>
          ))}
        </XStack>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          placeholder={here.asks}
          label={here.asks}
          rows={2}
          maxHeight={240}
        >
          {grounded ? (
            <XStack gap="$1" flexWrap="wrap" shrink={1} minW={0}>
              {SOURCES.map((s) => {
                const on = picked.includes(s)
                return (
                  <Box
                    key={s}
                    data-chip={s}
                    render="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((held) => (on ? held.filter((h) => h !== s) : [...held, s]))
                    }
                    px="$2"
                    py="$1"
                    rounded="$10"
                    bg={on ? CHOSEN : 'transparent'}
                    hoverStyle={{ bg: '$hover' }}
                  >
                    <Text fontSize="$2" color={on ? INK : SOFT}>
                      @{s}
                    </Text>
                  </Box>
                )
              })}
            </XStack>
          ) : null}
        </Composer>
        <Crew to="/chat" />
      </YStack>

      {/* The grid is wider than the field, because a field has a reading measure
          and a grid has columns. 880 is three 275px cards; it collapses to two
          and then to one on its own, which is what `Fit` is for. */}
      <YStack
        width="100%"
        maxW={880}
        mx="auto"
        px="$4"
        py="$8"
      >
        <Grid columns={{ min: 260, max: 3 }} gap={12}>
          <Rooms {...held} />
          <Projects />
          <Chats />
          <Next onConnect={() => setDirectory(true)} />
          <Apps onConnect={() => setDirectory(true)} />
          <Team />
          <Build />
        </Grid>
      </YStack>

      <Directory open={directory} onClose={() => setDirectory(false)} />
    </YStack>
  )
}

/**
 * The open room, in place of the question and the cards.
 *
 * The key names a space and an id; the org's list answers which room that is.
 * The ladder is the one every card climbs: the session first, because that is
 * the state that never resolves, then the refusal, then the read, then a key no
 * room answers to — a shared link to a room this reader cannot see.
 */
function Open({
  at,
  rooms,
  back,
}: {
  at: { space: string; id: string }
  rooms: ReturnType<typeof useTeamRooms>
  back: () => void
}) {
  const { isAuthenticated, isLoading } = useIam()
  const found = rooms.rooms?.find((one) => one.space === at.space && one.id === at.id)
  if (found) return <Talk key={teamKey(found)} room={found} />
  const reading = isLoading || (isAuthenticated && rooms.rooms === null && !rooms.wrong)
  const line = reading
    ? 'Reading the room.'
    : !isAuthenticated
      ? 'Sign in to read this room.'
      : rooms.wrong
        ? say(rooms.wrong, 'this room')
        : 'That room is not here.'
  return (
    <YStack flex={1} items="center" justify="center" p="$6" gap="$3">
      <Text fontSize="$3" color={SOFT}>
        {line}
      </Text>
      {reading ? null : (
        <Box render="button" onClick={back} {...tap}>
          <Text fontSize="$2" fontWeight="500" color={INK}>
            Back to home
          </Text>
        </Box>
      )}
    </YStack>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   The cards. Each one owns its own read, so a card that cannot answer says so
   on its own rather than emptying the grid.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The org's rooms, and the way to open one.
 *
 * The list is the read the rail makes (`useTeamRooms`), so the two cannot
 * disagree about what the org has. A new room is posted with the reader as its
 * first member — the platform adds nobody on its own — in the space of the
 * org's first room, which is the space an org with one has; an org with none
 * leaves it unsaid. The row the platform answers with is opened at once.
 */
function Rooms({ rooms, wrong, open }: ReturnType<typeof useTeamRooms>) {
  const { openRoom } = useOpen()
  const me = useMe()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [opening, setOpening] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  const make = async () => {
    const wanted = name.trim()
    if (!wanted || opening || !me) return
    setOpening(true)
    setRefused(null)
    try {
      const made = await open({ name: wanted, space: rooms?.[0]?.space, members: [me] })
      setName('')
      setNaming(false)
      openRoom(teamKey(made))
    } catch (e) {
      setRefused(plainly(e, 'this room'))
    } finally {
      setOpening(false)
    }
  }

  return (
    <Card kind="rooms" icon={<Hash size={14} aria-hidden />} title="Rooms">
      {rooms === null ? (
        <Waiting wrong={wrong} subject="your rooms" />
      ) : rooms.length === 0 ? (
        <Quiet>No rooms yet. Open one and the conversation has somewhere to live.</Quiet>
      ) : (
        <YStack gap="$1">
          {rooms.slice(0, 6).map((one) => (
            <Row
              key={teamKey(one)}
              icon={one.direct ? <AtSign size={12} aria-hidden /> : <Hash size={12} aria-hidden />}
              onPress={() => openRoom(teamKey(one))}
            >
              {one.name || 'Direct message'}
            </Row>
          ))}
        </YStack>
      )}
      {!me ? null : naming ? (
        <YStack gap="$1">
          <XStack gap="$1" items="center">
            <Text
              render={
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void make()
                    if (e.key === 'Escape') setNaming(false)
                  }}
                  placeholder="Name"
                  aria-label="Room name"
                  autoFocus
                />
              }
              flex={1}
              minW={0}
              bg="transparent"
              borderWidth={1}
              borderColor="var(--border)"
              rounded={6}
              px={8}
              py={6}
              color="inherit"
              fontSize="$2"
            />
            <Box
              render="button"
              onClick={() => void make()}
              aria-disabled={opening}
              opacity={opening ? 0.5 : 1}
              px="$2"
              py="$1.5"
              rounded="$2"
              borderWidth={1}
              borderColor="$borderColor"
              hoverStyle={{ bg: '$hover' }}
            >
              <Text fontSize="$2" fontWeight="500" color={INK}>
                Open it
              </Text>
            </Box>
          </XStack>
          {refused ? (
            <Text fontSize="$2" color={BAD}>
              {refused}
            </Text>
          ) : null}
        </YStack>
      ) : (
        <Row icon={<Plus size={12} aria-hidden />} onPress={() => setNaming(true)}>
          New room
        </Row>
      )}
    </Card>
  )
}

/**
 * A read the SDK has no hook for.
 *
 * `null` while the answer is not in — including when the request failed, which
 * is the case a `[]` would misreport as "the org has none".
 *
 * The reader is passed by REFERENCE (`lib/home.ts`'s own functions), not built
 * in the caller, so the effect's dependency is honest and it runs once per
 * client rather than once per render.
 */
function useRead<T>(
  read: (client: AiClient, signal: AbortSignal) => Promise<T>,
): { held: T | null; wrong: unknown } {
  const { client } = useAi()
  const [held, setHeld] = useState<T | null>(null)
  // WHY THERE IS NOTHING, kept rather than swallowed. `null` alone says only
  // that no answer is held, which is equally true of a request still in flight
  // and one that came back no — and a card cannot choose its sentence without
  // knowing which.
  const [wrong, setWrong] = useState<unknown>(null)
  useEffect(() => {
    if (!client) return
    const stop = new AbortController()
    void read(client, stop.signal)
      .then((got) => {
        if (!stop.signal.aborted) setHeld(got)
      })
      .catch((e: unknown) => {
        if (!stop.signal.aborted) setWrong(e)
      })
    return () => stop.abort()
  }, [client, read])
  return { held, wrong }
}

/**
 * WHAT A CARD SAYS BEFORE IT HAS ANYTHING.
 *
 * Three states wore one word. "Reading." is true only while an answer is on its
 * way — a reader with no session will never be sent one, and a store that
 * refused has already answered. Measured on production: Projects, Apps and Team
 * all still said "Reading." twelve seconds after load, to a visitor nobody was
 * ever going to answer.
 *
 * The session is asked FIRST, because that is the state that never resolves.
 */
function Waiting({ wrong, subject }: { wrong?: unknown; subject: string }) {
  const { isAuthenticated } = useIam()
  const signedIn = isAuthenticated || hasSession()
  if (!signedIn) return <Quiet>Sign in to see {subject}.</Quiet>
  if (wrong) return <Quiet>{say(wrong, subject)}</Quiet>
  return <Quiet>Reading.</Quiet>
}

const useProjects = () => useRead(projects)
const useApps = () => useRead(apps)

function Projects() {
  const { held, wrong } = useProjects()
  return (
    <Card kind="projects" icon={<FolderGit2 size={14} aria-hidden />} title="Projects">
      {held === null ? (
        <Waiting wrong={wrong} subject="your projects" />
      ) : held.length === 0 ? (
        <Quiet>Nothing deployed yet.</Quiet>
      ) : (
        <YStack gap="$1">
          {/* Linked only where it is SERVING. This site publishes no
              `/projects/<slug>` page, so a name with nowhere to go is a name. */}
          {held.slice(0, 3).map((p) => (
            <Row key={p.slug} href={p.liveUrl}>
              {p.name || p.slug}
            </Row>
          ))}
        </YStack>
      )}
      <Go href={dev()}>Ship one</Go>
    </Card>
  )
}

function Chats() {
  const { threads, loading } = useThreads()
  const { open } = useOpen()
  return (
    <Card kind="chats" icon={<MessageSquare size={14} aria-hidden />} title="Chats">
      {loading && threads.length === 0 ? (
        <Waiting subject="your chats" />
      ) : threads.length === 0 ? (
        <Quiet>No chats yet.</Quiet>
      ) : (
        <YStack gap="$1">
          {threads.slice(0, 3).map((t) => (
            <Row key={t.id} onPress={() => open(t.id)}>
              {t.title || 'Untitled'}
            </Row>
          ))}
        </YStack>
      )}
    </Card>
  )
}

/**
 * What is going, then what to do next.
 *
 * Both halves are DERIVED — every line is a fact this page measured, and it
 * names the fact rather than a recommendation nobody can check. A running run
 * carries its own bar; see `progress.tsx` for why that bar is usually invisible
 * today.
 */
function Next({ onConnect }: { onConnect: () => void }) {
  const { sessions } = useSessions({ limit: 100 })
  const { agents } = useAgents()
  const { held } = useProjects()
  const { held: connected } = useApps()

  const safeSessions = Array.isArray(sessions) ? sessions : []
  const safeAgents = Array.isArray(agents) ? agents : []

  const running = useMemo(() => safeSessions.filter((s) => s && s.status === 'running'), [safeSessions])

  const rows = useMemo(() => {
    const out: { key: string; say: string; href?: string; press?: boolean }[] = []
    const failed = safeSessions.filter((s) => s && s.status === 'error').length
    if (failed) out.push({ key: 'failed', say: `${failed} failed`, href: '/work' })
    if (safeAgents.length === 0) out.push({ key: 'agent', say: 'Hire your first agent', href: '/work' })
    if (held?.length === 0) out.push({ key: 'ship', say: 'Ship your first project', href: dev() })
    if (connected && Array.isArray(connected) && !connected.some((a) => a?.connected))
      out.push({ key: 'connect', say: 'Connect an app', press: true })
    return out
  }, [safeSessions, safeAgents, held, connected])

  return (
    <Card kind="next" icon={<Bot size={14} aria-hidden />} title="Next">
      {running.length ? (
        <YStack gap="$2">
          {running.slice(0, 2).map((s) => (
            <YStack key={s.id} gap="$1">
              <Row href="/work">{s.title || s.agent || 'Run'}</Row>
              <Bar run={s} label={false} />
            </YStack>
          ))}
        </YStack>
      ) : null}

      {rows.length === 0 && running.length === 0 ? (
        <Quiet>Nothing needs you.</Quiet>
      ) : (
        <YStack gap="$1">
          {rows.slice(0, 3).map((r) => (
            <Row key={r.key} href={r.href} onPress={r.press ? onConnect : undefined}>
              {r.say}
            </Row>
          ))}
        </YStack>
      )}
    </Card>
  )
}

/**
 * The apps the org has connected.
 *
 * A connected provider has no page on this site — `/integrations/<slug>` is the
 * SDK guide catalogue (openai-sdk, langchain, cursor …) and shares no ids with
 * the cloud's connectors — so a name here is a name, and the ACTION opens the
 * Directory, which is where connecting actually happens.
 */
function Apps({ onConnect }: { onConnect: () => void }) {
  const { held, wrong } = useApps()
  const on = held?.filter((a) => a.connected) ?? []
  return (
    <Card kind="apps" icon={<Blocks size={14} aria-hidden />} title="Apps">
      {held === null ? (
        <Waiting wrong={wrong} subject="connected apps" />
      ) : on.length === 0 ? (
        <Quiet>Nothing connected.</Quiet>
      ) : (
        <YStack gap="$1">
          {on.slice(0, 3).map((a) => (
            <Row key={a.id}>{a.name}</Row>
          ))}
        </YStack>
      )}
      <Go onPress={onConnect}>Connect</Go>
    </Card>
  )
}

/**
 * THE ONE CARD A PRERENDER CANNOT DRAW.
 *
 * Every other read here starts empty on the server AND on the first client
 * render, so the two agree and hydration is quiet. `useOrganizations` does not:
 * it resolves the org from the SDK synchronously, so the client's first render
 * already knows the reader and the server's never did — a TEXT mismatch, which
 * React answers by throwing the whole tree away and re-rendering it.
 *
 * `useHydrated` is false on the server and false on that first client render,
 * so both draw the same line and the real answer arrives on the render
 * hydration was going to perform anyway.
 */
function Team() {
  const hydrated = useHydrated()
  const { currentOrgId } = useOrganizations()
  if (!hydrated || !currentOrgId) {
    return (
      <Card kind="team" icon={<UserPlus size={14} aria-hidden />} title="Team">
        {/* No org is not a read in flight. Hydration settles in a frame; a
            visitor without one is in this branch for as long as they stay. */}
        <Waiting subject="your team" />
        <Go href={invite()}>Invite</Go>
      </Card>
    )
  }
  return <Mates owner={currentOrgId} />
}

/** The org's people. Split out because `usePeople` needs an owner and a hook
 *  cannot be called conditionally. */
function Mates({ owner }: { owner: string }) {
  const { people, loading } = usePeople({ owner, service: false })
  return (
    <Card kind="team" icon={<UserPlus size={14} aria-hidden />} title="Team">
      {loading && people.length === 0 ? (
        <Waiting subject="your team" />
      ) : people.length < 2 ? (
        <Quiet>Just you.</Quiet>
      ) : (
        <Quiet>{people.length} people</Quiet>
      )}
      <Go href={invite()}>Invite</Go>
    </Card>
  )
}

function Build() {
  return (
    <Card kind="build" icon={<Code2 size={14} aria-hidden />} title="Build">
      <Quiet>Hanzo Dev writes it, runs it, ships it.</Quiet>
      <Go href={dev()}>Open Dev</Go>
    </Card>
  )
}
