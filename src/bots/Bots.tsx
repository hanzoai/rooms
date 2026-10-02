'use client'

// The Bots Room.
//
// Bots are autonomous workers for your organization: each has a model,
// instructions, tools, and a record of everything it has accomplished.
//
// In live mode, this connects directly to your organization's bots and sessions.
// When visiting without an account, an interactive Example Workspace lets you
// explore how bots use computers to automate sales, triage inboxes, and review code.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Monitor, Plus, Search, Send, Trash2 } from 'lucide-react'
import { useIam } from '@hanzo/iam/react'
import type { Agent, AgentDetail, AgentRun, Model, Session } from '@hanzo/ai'
import { useAi, ENSO } from '../lib/ai'
import { say } from '../failure'
import { Input, Text, XStack, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { Lights } from './Lights'
import { Face } from './face'
import { Runtime } from './runtime'
import { DIM, FAINT, GROUND, INK, LINE, RAISED, SURFACE } from './ink'
import { BARE, BOXED, CARD, CLIP, GHOST, LABEL, NOTE, TAB } from './kit'
import { ALWAYS, ONCE, launch, sessions, steer } from './api'

/** How long ago, in the words a roster row has space for. */
function when(iso?: string): string {
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const days = Math.floor((Date.now() - t.getTime()) / 86_400_000)
  if (days === 0) return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return t.toLocaleDateString([], { weekday: 'short' })
  return t.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** What a run cost, from the fields the run actually recorded. */
function cost(r: AgentRun): string {
  const tokens = (r.promptTokens ?? 0) + (r.completionTokens ?? 0)
  return [r.model, r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '', tokens ? `${tokens} tokens` : '']
    .filter(Boolean)
    .join(' · ')
}

/** When something happened, as a number to sort by. */
const at = (iso?: string): number => {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? 0 : t
}

/** A session the platform still considers open. Only these can be steered:
 *  the route takes a command for a finished session and records it against a
 *  log nothing is reading, so a control on one is a control over nothing. */
const open = (s: Session) => s.status === 'running' || s.status === 'paused'

interface Turn {
  id: string
  at: number
  who: 'you' | 'bot'
  text: string
  note?: string
  failed?: boolean
}

/** A Bot's recorded runs as the turns they were. */
function turns(detail: AgentDetail | null): Turn[] {
  return (detail?.recentRuns ?? []).flatMap((r) => {
    const when = at(r.createdAt)
    const out: Turn[] = []
    if (r.input) out.push({ id: `${r.id}-in`, at: when, who: 'you', text: r.input })
    out.push({
      id: `${r.id}-out`,
      at: when + 1,
      who: 'bot',
      text: r.error || r.output || 'This run recorded no output.',
      note: cost(r),
      failed: Boolean(r.error),
    })
    return out
  })
}

const EXAMPLE_BOTS: Agent[] = [
  {
    id: 'bot-sales-outbound',
    avatar: '/bots/sales-outbound.png',
    name: 'Sales Outbound',
    description: 'Prospecting, lead qualification, and cold outreach',
    model: 'claude-3-5-sonnet',
    executionMode: ALWAYS,
    schedule: '0 9 * * 1-5',
    updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 'bot-chief',
    avatar: '/bots/chief.png',
    name: 'Chief',
    description: 'Executive briefing, team updates, and orchestration',
    model: 'claude-3-5-sonnet',
    executionMode: ALWAYS,
    schedule: '0 8 * * *',
    updatedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'bot-inbox-manager',
    avatar: '/bots/inbox-manager.png',
    name: 'Inbox Manager',
    description: 'Triage email, draft responses, and surface urgent items',
    model: 'claude-3-5-sonnet',
    executionMode: ALWAYS,
    schedule: '*/15 * * * *',
    updatedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: 'bot-code-reviewer',
    name: 'Code Reviewer',
    description: 'Analyze pull requests, check test suites, and style',
    model: 'claude-3-5-sonnet',
    executionMode: ONCE,
    updatedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: 'bot-research-analyst',
    name: 'Research Analyst',
    description: 'Track industry trends, competitive moves, and filings',
    model: 'claude-3-5-sonnet',
    executionMode: ONCE,
    updatedAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
  },
]

interface ComputerAction {
  title: string
  status: string
  summary: string
  tasks: string[]
}

const EXAMPLE_ACTIONS: Record<string, ComputerAction> = {
  'Sales Outbound': {
    title: 'Computer',
    status: 'Done',
    summary: 'Reviewed 52 new outbound leads across target accounts. Qualified 18 high-fit profiles and prepared tailored email drafts.',
    tasks: [
      'Verified domain deliverability and prospect contact records',
      'Extracted buyer intent signals from company milestones',
      'Queued 18 personalized emails for Armand’s review',
    ],
  },
  'Chief': {
    title: 'Computer',
    status: 'Done',
    summary: 'Compiled morning briefing, synced calendar events, and highlighted team priorities.',
    tasks: [
      'Aggregated GitHub pull requests and release milestones',
      'Organized 3 priority decisions for today',
      'Synchronized executive calendar and shared prep notes',
    ],
  },
  'Inbox Manager': {
    title: 'Computer',
    status: 'Done',
    summary: 'Triaged 34 unread messages, flagged 4 urgent requests, and drafted replies for approval.',
    tasks: [
      'Categorized incoming inquiries by priority and topic',
      'Drafted context-aware responses citing knowledge base docs',
      'Scheduled followup reminders for unresolved partner threads',
    ],
  },
  'Code Reviewer': {
    title: 'Computer',
    status: 'Done',
    summary: 'Analyzed pull request #142 for architectural consistency, security considerations, and edge cases.',
    tasks: [
      'Verified zero memory leaks and confirmed strict typing',
      'Validated test suite passes across all target environments',
      'Posted inline review suggestions for error handling',
    ],
  },
  'Research Analyst': {
    title: 'Computer',
    status: 'Done',
    summary: 'Indexed frontier model benchmarks, competitive releases, and performance telemetry.',
    tasks: [
      'Indexed latest release notes and technical benchmarks',
      'Created comparative capability matrix',
      'Generated summary digest for the engineering team',
    ],
  },
}

export function Bots() {
  const { client, ready } = useAi()
  const { user, isAuthenticated } = useIam()

  // A client EXISTS signed out — `useAi` hands back an anonymous one so the
  // free chat lane works — so holding one is not proof of a reader. Every read
  // below is org-scoped and answers 403 without a session, so this is the gate.
  const live = Boolean(client && isAuthenticated && ready)

  const [roster, setRoster] = useState<Agent[]>([])
  const [rosterFailed, setRosterFailed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState('')
  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [own, setOwn] = useState<Session[]>([])
  const [draft, setDraft] = useState('')
  const [trialTurns, setTrialTurns] = useState<Turn[]>([])
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [pane, setPane] = useState(false)
  const [making, setMaking] = useState(false)
  const [cron, setCron] = useState('')

  const read = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      setRoster(await client.agents.list())
      setRosterFailed(null)
    } catch (e) {
      setRosterFailed(say(e, 'this org’s bots'))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (live) void read()
  }, [live, read])

  // In live mode, use platform roster. When exploring as a visitor, show example workspace bots.
  const activeRoster = useMemo(() => {
    if (live && roster.length > 0) return roster
    if (!live) return EXAMPLE_BOTS
    return roster
  }, [live, roster])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activeRoster
    return activeRoster.filter((b) => b.name.toLowerCase().includes(q) || (b.description ?? '').toLowerCase().includes(q))
  }, [activeRoster, query])

  const bot = useMemo(
    () => activeRoster.find((b) => b.name === picked) ?? shown[0] ?? activeRoster[0] ?? null,
    [activeRoster, shown, picked],
  )

  // Its record and its work, re-read after anything this room does to it —
  // the platform's answer is the only account of what happened.
  const refresh = useCallback(async () => {
    if (!client || !bot) return
    const [d, s] = await Promise.allSettled([client.agents.get(bot.name), sessions(client, bot.name)])
    if (d.status === 'fulfilled') setDetail(d.value)
    setOwn(s.status === 'fulfilled' ? s.value : [])
  }, [client, bot])

  useEffect(() => {
    if (!client || !bot) {
      setDetail(null)
      setOwn([])
      return
    }
    const stop = new AbortController()
    setCron(bot.schedule ?? '')
    client.agents
      .get(bot.name, { signal: stop.signal })
      .then(setDetail)
      .catch(() => {
        if (!stop.signal.aborted) setDetail(null)
      })
    // No limit of its own. The route has no per-agent filter, so the page it
    // answers is the ORG's and the narrowing happens after — ask for twenty
    // and a bot whose work is older than the org's twenty newest sessions
    // reads as having none.
    sessions(client, bot.name, undefined, stop.signal)
      .then(setOwn)
      .catch(() => setOwn([]))
    return () => stop.abort()
  }, [client, bot])

  // ONE STREAM, IN THE ORDER IT HAPPENED. A run and a session are two records
  // of the same Bot working, so they are read together and sorted by the clock
  // the platform put on them — newest at the bottom, where a reader who has
  // just asked for something is looking.
  const computerAction = bot ? EXAMPLE_ACTIONS[bot.name] ?? null : null

  const stream = useMemo(() => {
    if (!live) {
      return trialTurns.map((t) => ({ at: t.at, key: t.id, turn: t, session: null as Session | null }))
    }
    return [
      ...turns(detail).map((t) => ({ at: t.at, key: t.id, turn: t, session: null as Session | null })),
      ...own.map((s) => ({ at: at(s.updatedAt || s.startedAt || s.createdAt), key: s.id, turn: null as Turn | null, session: s })),
    ].sort((a, b) => a.at - b.at)
  }, [live, detail, own, trialTurns])

  const always = bot?.executionMode === ALWAYS

  // Newest last means the newest is off-screen on a Bot with any history, so
  // the stream opens where a reader is looking rather than at its oldest run.
  const foot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' })
  }, [stream])

  /** One task, run now. */
  const run = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault()
      const input = draft.trim()
      if (!bot || !input || running) return

      if (!live) {
        setDraft('')
        const userTurn: Turn = { id: `trial-${Date.now()}-in`, at: Date.now(), who: 'you', text: input }
        setTrialTurns((prev) => [...prev, userTurn])
        setTimeout(() => {
          const botTurn: Turn = {
            id: `trial-${Date.now()}-out`,
            at: Date.now(),
            who: 'bot',
            text: `Received: "${input}". Running on ${bot.model} with computer tools enabled. Sign in to your organization to deploy bots into production.`,
            note: `${bot.model} · 0.8s · 142 tokens`,
          }
          setTrialTurns((prev) => [...prev, botTurn])
        }, 400)
        return
      }

      if (!client) return
      setRunning(true)
      setFailed(null)
      try {
        await client.agents.run(bot.name, input)
        setDraft('')
        await refresh()
      } catch (err) {
        setFailed(err instanceof Error ? err.message : String(err))
      } finally {
        setRunning(false)
      }
    },
    [live, client, bot, draft, running, refresh],
  )

  /** Stays up, or runs when asked. The platform REFUSES long-running without a
   *  cron — measured, 400 naming the field — so the cron is asked for beside
   *  the switch rather than guessed at here. */
  const keepUp = useCallback(async () => {
    if (!client || !bot) return
    setFailed(null)
    try {
      const saved = always
        ? await client.agents.update(bot.name, { executionMode: ONCE })
        : await client.agents.update(bot.name, { executionMode: ALWAYS, schedule: cron.trim() })
      setRoster((r) => r.map((b) => (b.name === saved.name ? saved : b)))
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e))
    }
  }, [client, bot, always, cron])

  const retire = useCallback(async () => {
    if (!client || !bot) return
    setFailed(null)
    try {
      await client.agents.delete(bot.name)
      setPicked('')
      await read()
    } catch (e) {
      setFailed(say(e, 'this bot', 'save'))
    }
  }, [client, bot, read])

  return (
    // The roster beside the bot from a laptop. Below one the pane is too narrow
    // for both, so they are two screens side by side, swiped between and
    // snapped to.
    <XStack
      width="100%"
      height="100%"
      overflow="hidden"
      bg={GROUND}
      $max-lg={{ overflowX: 'auto', overflowY: 'hidden' }}
      // gui types no scroll-snap prop; `$platform-web` carries it as an atomic class.
      $platform-web={{ scrollSnapType: 'x mandatory' }}
    >
      <YStack
        width={280}
        minW={280}
        height="100%"
        bg={GROUND}
        borderRightWidth={1}
        borderColor={LINE}
        $max-lg={{ width: '85%', maxW: 320 }}
        $platform-web={{ scrollSnapAlign: 'start' }}
      >
        <XStack pt={16} px={18} pb={12} items="center" justify="space-between">
          <Lights />
          <XStack
            {...GHOST}
            {...{ title: live ? 'New bot' : 'Sign in to keep a bot' }}
            onClick={() => setMaking((m) => !m)}
            aria-label="New bot"
            aria-expanded={making}
            disabled={!live}
            opacity={live ? 1 : 0.4}
          >
            <Plus size={18} color={DIM} />
          </XStack>
        </XStack>

        {making && live ? (
          <Hire
            onDone={async (made) => {
              setMaking(false)
              setPicked(made.name)
              await read()
            }}
            onCancel={() => setMaking(false)}
          />
        ) : null}

        <YStack px={14} pb={12}>
          <XStack items="center" gap={8} bg={SURFACE} borderWidth={1} borderColor={LINE} rounded={8} px={12} py={8}>
            <Search size={14} color={DIM} aria-hidden />
            <Input
              {...BARE}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search bots"
              fontSize="$2"
              flex={1}
              minW={0}
            />
          </XStack>
        </YStack>

        <YStack data-hz="roster" flex={1} overflowY="auto" px={10} gap={2}>
          {live && rosterFailed ? (
            <Text {...NOTE}>{rosterFailed}</Text>
          ) : live && loading && roster.length === 0 ? (
            <Text {...NOTE}>Reading the roster…</Text>
          ) : live && shown.length === 0 ? (
            <Text {...NOTE}>{roster.length === 0 ? 'This org keeps no bots yet.' : 'No bot matches that.'}</Text>
          ) : null}

          {shown.map((b) => {
            const on = bot?.name === b.name
            return (
              <XStack
                key={b.id || b.name}
                render="button"
                {...{ type: 'button' }}
                data-hz="bot"
                data-name={b.name}
                aria-current={on}
                onClick={() => setPicked(b.name)}
                items="center"
                gap={12}
                px={12}
                py={10}
                rounded={10}
                bg={on ? SURFACE : 'transparent'}
                borderWidth={0}
                cursor="pointer"
                width="100%"
              >
                <Face bot={b} size={36} />
                <YStack flex={1} minW={0}>
                  <XStack items="center" justify="space-between" gap={8}>
                    <Text fontSize="$2" fontWeight="600" color={on ? INK : DIM}>{b.name}</Text>
                    <Text fontSize="$1" color={FAINT} whiteSpace="nowrap">{when(b.updatedAt)}</Text>
                  </XStack>
                  <Text {...CLIP} fontSize="$2" color={DIM} text="left">
                    {b.description || `${b.model}${b.runs ? ` · ${b.runs} runs` : ''}`}
                  </Text>
                </YStack>
              </XStack>
            )
          })}
        </YStack>

        <XStack px={16} py={14} borderTopWidth={1} borderColor={LINE} items="center" gap={12}>
          <Text
            aria-hidden
            display="flex"
            width={32}
            height={32}
            shrink={0}
            rounded={9999}
            bg={SURFACE}
            borderWidth={1}
            borderColor={LINE}
            items="center"
            justify="center"
            fontSize="$2"
            fontWeight="600"
            color={DIM}
          >
            {(user?.name || (live ? '·' : 'Armand Segall')).trim().charAt(0).toUpperCase()}
          </Text>
          <YStack flex={1} minW={0}>
            <Text fontSize="$2" fontWeight="600" color={INK}>
              {user?.name || (live ? 'Signed in' : 'Armand Segall')}
            </Text>
            <Text {...CLIP} fontSize="$1" color={FAINT}>
              {user?.email || (live ? 'Active Workspace' : 'armand@example.com · Example Workspace')}
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <YStack
        flex={1}
        minW={0}
        height="100%"
        position="relative"
        bg={GROUND}
        $max-lg={{ width: '100%', minW: '100%', shrink: 0, overflowX: 'hidden' }}
        $platform-web={{ scrollSnapAlign: 'start' }}
      >
        <XStack height={60} borderBottomWidth={1} borderColor={LINE} items="center" justify="space-between" px={16} gap={12}>
          {/* THE NAMING CLUSTER GIVES WAY, THE CONTROLS DO NOT. A flex item
              defaults to min-width: auto and refuses to shrink under its own
              content, so at 390px this row pushed its controls off the side —
              where `overflow-x: clip` makes them unreachable. */}
          <XStack items="center" gap={10} minW={0} shrink={1}>
            {bot ? <Face bot={bot} size={28} /> : null}
            <YStack minW={0} shrink={1}>
              <Text {...CLIP} data-hz="head" fontSize="$3" fontWeight="600" color={INK}>
                {bot?.name || 'No bot'}
              </Text>
              <Text {...CLIP} data-hz="mode" fontSize="$1" color={FAINT}>
                {bot ? `${bot.model} · ${bot.executionMode || ONCE}${bot.schedule ? ` · ${bot.schedule}` : ''}` : ''}
              </Text>
            </YStack>
          </XStack>

          {bot ? (
            <XStack items="center" gap={8} shrink={0}>
              {/* The cron the platform requires to keep a Bot up, asked for
                  where the switch is. Long-running without one is a 400. */}
              {!always ? (
                <Input
                  {...BOXED}
                  data-hz="cron"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="0 * * * *"
                  aria-label="Schedule, as a 5-field cron"
                  width={104}
                  fontSize="$1"
                />
              ) : null}
              <Button
                size="sm"
                variant={always ? 'primary' : 'default'}
                rounded={999}
                title={always ? 'Run only when asked' : 'Keep this bot up on a schedule'}
                data-hz="always"
                onClick={keepUp}
                aria-pressed={always}
              >
                24/7
              </Button>
              {/* A session is the row every runner hangs its activity off — the
                  CLI's outer agent, hanzo.bot, this room. Opening one from here
                  registers it; a machine attaching to it is a separate act, and
                  until one does, a command sent to it comes back `forwarded:
                  false` and the card says so. */}
              <Button
                size="sm"
                variant="primary"
                title="Open a session for this bot"
                data-hz="open"
                onClick={async () => {
                  if (!client || !bot) return
                  setFailed(null)
                  try {
                    await launch(client, bot.name, `${bot.name} session`)
                    await refresh()
                  } catch (e) {
                    setFailed(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                Open a session
              </Button>
              <XStack
                {...GHOST}
                {...{ title: 'What this bot has' }}
                data-hz="runtime"
                onClick={() => setPane((p) => !p)}
                aria-label="Runtime"
                aria-pressed={pane}
                bg={pane ? SURFACE : 'transparent'}
              >
                <Monitor size={18} color={pane ? INK : DIM} />
              </XStack>
              <XStack {...GHOST} {...{ title: 'Retire' }} data-hz="retire" onClick={retire} aria-label={`Retire ${bot.name}`}>
                <Trash2 size={16} color={DIM} />
              </XStack>
            </XStack>
          ) : null}
        </XStack>

        <XStack flex={1} minH={0}>
          <YStack flex={1} minW={0} overflow="hidden">
            <YStack data-hz="stream" flex={1} overflowY="auto" px={32} py={24} gap={16}>
              {!bot ? (
                <Text {...NOTE}>
                  {live
                    ? 'Nothing is kept yet. A bot is a model, a standing instruction and a record of what it has done — press + to keep one.'
                    : 'Select a bot to begin.'}
                </Text>
              ) : null}

              {bot && detail?.instructions ? (
                <YStack {...CARD}>
                  <Text {...LABEL}>Standing instruction</Text>
                  <Text render="p" fontSize="$2" lineHeight="1.3rem" color={DIM} whiteSpace="pre-wrap">
                    {detail.instructions}
                  </Text>
                </YStack>
              ) : null}

              {computerAction ? (
                <YStack {...CARD} data-hz="computer-card">
                  <XStack items="center" justify="space-between">
                    <XStack items="center" gap={8}>
                      <Monitor size={15} color={INK} />
                      <Text fontSize="$2" fontWeight="600" color={INK}>{computerAction.title}</Text>
                    </XStack>
                    {/* Greyscale, like every other chip here: this file's own
                        rule is that status is said in words, and the green said
                        nothing the word beside it did not — while being the one
                        thing on the card unreadable on a light page. */}
                    <Text
                      display="inline-flex"
                      items="center"
                      px={8}
                      py={2}
                      rounded={999}
                      fontSize="$1"
                      fontWeight="600"
                      bg={SURFACE}
                      color={DIM}
                      borderWidth={1}
                      borderColor={LINE}
                    >
                      {computerAction.status}
                    </Text>
                  </XStack>
                  <Text render="p" fontSize="$2" lineHeight="1.26rem" color={INK}>
                    {computerAction.summary}
                  </Text>
                  <YStack gap={5} mt={4}>
                    {computerAction.tasks.map((task, idx) => (
                      <XStack key={idx} items="center" gap={8}>
                        <YStack width={4} height={4} shrink={0} rounded={9999} bg={FAINT} />
                        <Text fontSize="$2" color={DIM}>{task}</Text>
                      </XStack>
                    ))}
                  </YStack>
                </YStack>
              ) : null}

              {bot && stream.length === 0 && !computerAction ? (
                <Text {...NOTE}>Nothing has been run yet. Ask for something below and the run is recorded here.</Text>
              ) : null}

              {stream.map(({ key, turn, session }) =>
                session ? (
                  <Live key={key} session={session} onChange={refresh} />
                ) : turn ? (
                  <Text
                    key={key}
                    render="div"
                    data-hz={turn.who === 'you' ? 'asked' : 'answered'}
                    self={turn.who === 'you' ? 'flex-end' : 'flex-start'}
                    maxW={620}
                    rounded={14}
                    px={16}
                    py={12}
                    fontSize="$3"
                    lineHeight="1.35625rem"
                    whiteSpace="pre-wrap"
                    bg={turn.who === 'you' ? SURFACE : RAISED}
                    borderWidth={1}
                    borderColor={LINE}
                    color={turn.failed ? DIM : INK}
                  >
                    {turn.text}
                    {turn.note ? (
                      <Text display="block" mt={6} fontSize="$1" lineHeight="1.0656rem" color={FAINT}>
                        {turn.failed ? `failed · ${turn.note}` : turn.note}
                      </Text>
                    ) : null}
                  </Text>
                ) : null,
              )}
              <div ref={foot} />
            </YStack>

            <YStack pt={16} px={32} pb={24}>
              {failed ? <Text {...NOTE} px={0} pt={0} pb={8}>{failed}</Text> : null}
              <XStack
                render="form"
                {...{ onSubmit: run }}
                items="center"
                gap={12}
                bg={SURFACE}
                borderWidth={1}
                borderColor={LINE}
                rounded={26}
                pt={6}
                pr={8}
                pb={6}
                pl={16}
              >
                <Input
                  {...BARE}
                  data-hz="ask"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={bot ? `Message ${bot.name}` : 'Message bot...'}
                  aria-label="Task"
                  disabled={!bot || running}
                  flex={1}
                  fontSize="$3"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="icon"
                  rounded={9999}
                  title="Run this task"
                  data-hz="run"
                  disabled={!bot || running || !draft.trim()}
                  aria-label="Run this task"
                >
                  <Send size={16} />
                </Button>
              </XStack>
              <Text render="p" mt={8} fontSize="$1" color={FAINT}>
                {running
                  ? 'Running. The recorded run appears above when the platform answers.'
                  : bot
                    ? `Runs on ${bot.model}, recorded against ${bot.name}.`
                    : ''}
              </Text>
            </YStack>
          </YStack>

          {pane && bot ? <Runtime bot={bot} /> : null}
        </XStack>
      </YStack>
    </XStack>
  )
}

/**
 * One session of this Bot's, and — while it is still open — the three things
 * the route lets you say to it.
 *
 * A FINISHED SESSION HAS NO CONTROLS. The route accepts a command for one and
 * records it against a log nothing is reading, so drawing Pause beside a run
 * that ended an hour ago is a control over nothing.
 *
 * `forwarded` is the platform's own word for whether a runner was listening: a
 * command is always RECORDED, and only sometimes delivered. Saying which is the
 * difference between a control and a button that appears to work.
 */
function Live({ session, onChange }: { session: Session; onChange: () => void | Promise<void> }) {
  const { client } = useAi()
  const [said, setSaid] = useState<string | null>(null)

  const command = async (verb: 'pause' | 'resume' | 'stop') => {
    if (!client) return
    try {
      const r = await steer(client, session.id, verb)
      setSaid(r.forwarded ? `${verb} delivered` : `${verb} recorded — no runner is attached to this session`)
      await onChange()
    } catch (e) {
      setSaid(say(e, 'this session', 'save'))
    }
  }

  return (
    <YStack {...CARD} data-hz="session" data-status={session.status}>
      <XStack items="baseline" justify="space-between" gap={8}>
        <Text fontSize="$2" fontWeight="600" color={INK}>{session.title || 'Session'}</Text>
        <Text fontSize="$1" color={FAINT}>
          {session.status} · {session.events ?? 0} turns
        </Text>
      </XStack>
      {session.lastEvent?.preview ? (
        <Text {...CLIP} render="p" fontSize="$1" lineHeight="1.03125rem" fontFamily="$mono" color={FAINT}>
          {session.lastEvent.preview}
        </Text>
      ) : null}
      {open(session) ? (
        <XStack gap={6}>
          <Text {...TAB} data-hz="pause" onClick={() => command('pause')}>Pause</Text>
          <Text {...TAB} data-hz="resume" onClick={() => command('resume')}>Resume</Text>
          <Text {...TAB} data-hz="stop" onClick={() => command('stop')}>Stop</Text>
        </XStack>
      ) : null}
      {said ? <Text render="p" fontSize="$1" color={FAINT}>{said}</Text> : null}
    </YStack>
  )
}

/**
 * Keeping a Bot.
 *
 * The model is checked against the gateway's served catalogue at create time,
 * so the field OFFERS that catalogue rather than a name this file invented: a
 * model this deployment cannot serve is refused with a 400 naming it, and the
 * platform's own sentence is what a reader is shown.
 */
function Hire({ onDone, onCancel }: { onDone: (a: Agent) => void | Promise<void>; onCancel: () => void }) {
  const { client } = useAi()
  const [name, setName] = useState('')
  const [model, setModel] = useState(ENSO)
  const [about, setAbout] = useState('')
  const [orders, setOrders] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [served, setServed] = useState<Model[]>([])

  useEffect(() => {
    if (!client) return
    const stop = new AbortController()
    client.models
      .list({ signal: stop.signal })
      .then(setServed)
      .catch(() => setServed([]))
    return () => stop.abort()
  }, [client])

  return (
    <YStack
      render="form"
      {...{
        onSubmit: async (e: React.FormEvent) => {
          e.preventDefault()
          if (!client || busy || !name.trim()) return
          setBusy(true)
          setFailed(null)
          try {
            await onDone(
              await client.agents.create({
                name: name.trim(),
                model: model.trim() || ENSO,
                description: about.trim(),
                instructions: orders.trim(),
              }),
            )
          } catch (err) {
            setFailed(err instanceof Error ? err.message : String(err))
          } finally {
            setBusy(false)
          }
        },
      }}
      data-hz="hire"
      mx={10}
      mb={10}
      p={12}
      gap={8}
      bg={RAISED}
      borderWidth={1}
      borderColor={LINE}
      rounded={10}
    >
      <Input {...BOXED} data-hz="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Bot name" autoFocus />
      <Input {...BOXED} data-hz="model" list="bot-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" aria-label="Model" />
      <datalist id="bot-models">
        {served.map((m) => (
          <option key={m.id} value={m.id} />
        ))}
      </datalist>
      <Input {...BOXED} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="What it is for" aria-label="Description" />
      <Input {...BOXED} render="textarea" rows={2} value={orders} onChange={(e) => setOrders(e.target.value)} placeholder="Standing instruction" aria-label="Standing instruction" />
      {failed ? <Text data-hz="hire-failed" fontSize="$1" color={DIM}>{failed}</Text> : null}
      <XStack gap={6}>
        <Button type="submit" variant="primary" size="sm" data-hz="keep" disabled={busy || !name.trim()} flex={1}>
          {busy ? 'Keeping…' : 'Keep'}
        </Button>
        <Button size="sm" onClick={onCancel} flex={1}>
          Cancel
        </Button>
      </XStack>
    </YStack>
  )
}
