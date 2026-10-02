'use client'

// Board: the org's work, and the day beside it.
//
// NAMED BOARD, NOT TASKS, and the rename is the point rather than a tidy-up.
// `/v1/tasks` is Hanzo Tasks — the durable execution engine, ten thousand
// workflow runs deep — and this room is a board of forge issues. Two different
// things wearing one word is how somebody comes to believe the board IS the
// engine, and asks why their cards are not replayable. Tasks keeps the word it
// earned; this is the Board.
//
// A CARD IS A FORGE ISSUE. `/v1/todo` says so itself — "the column is a LABEL on
// the forge, so the board and the forge web UI are the same object seen twice:
// relabelling in either moves the card in both" — so this surface keeps no work
// of its own. Everything drawn here is a row somebody could also have moved from
// the forge, and everything written here is a row they will find there.
//
// TWO READINGS OF ONE SET OF CARDS, and one of them is up at a time: the board
// by column, the planner by date. The room opens on the board, which is what it
// is called. There is no inbox pane: the workspace already has one, and a second
// would be two places for the same arriving thing.
//
// WHAT A CARD CAN CARRY is what the store holds — a title, a description, a
// column, a priority, an assignee, labels, a start and a due date. Checklists
// ride in the description as markdown task items, which is not a workaround but
// the way a forge issue has always spelled one, so a step ticked here is ticked
// in the forge and a step written there arrives here. Covers and file
// attachments have nowhere to live yet, so they are not drawn.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAgents, usePeople } from '@hanzo/ai/react'
import { Box, Text, View, XStack, YStack } from '@hanzo/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hanzo/ui'
import { useIam, useOrganizations } from '@hanzo/iam/react'
import {
  Calendar,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ListChecks,
  ListFilter,
  SquareTerminal,
  Plus,
  Tag,
  UserPlus,
  X,
} from 'lucide-react'
import { useOpen } from './open'
import { useAi } from './lib/ai'
import { Face } from './cast'
import { say } from './failure'
import {
  AGENT_QUEUE,
  AGENT_WORKFLOW,
  reads,
  runOf,
  start as startRun,
  type Run,
} from './lib/durable'
import {
  COLUMNS,
  PRIORITIES,
  addStep,
  board as readBoard,
  claim,
  edit,
  open as openCard,
  projects as readProjects,
  sift,
  steps,
  tick,
  type Card,
  type Sift,
} from './lib/todo'
import { BAD } from './lib/mix'

const DAY = 86400

/** A pane with nothing in it yet, centred, saying which nothing it is. */
function Empty({ children }: { children: ReactNode }) {
  return (
    <YStack flex={1} items="center" justify="center" p="$6" gap="$2">
      <Text render="h1" fontSize="$6" fontWeight="600" color="var(--foreground)">
        Board
      </Text>
      <Text fontSize="$3" color="$soft" text="center">
        {children}
      </Text>
    </YStack>
  )
}

/** A quiet control that says its verb. */
function Act({
  icon: Icon,
  label,
  on,
  onPress,
}: {
  icon?: typeof Tag
  label: string
  on?: boolean
  onPress: () => void
}) {
  return (
    <Box
      render="button"
      onClick={onPress}
      // A control whose only account of itself is a background colour says
      // nothing to a reader who is not looking at it.
      aria-pressed={on}
      px="$2.5"
      py="$1.5"
      rounded="$2"
      bg={on ? '$raised' : 'transparent'}
      borderWidth={1}
      borderColor={on ? '$borderColor' : 'transparent'}
      hoverStyle={{ bg: '$hover' }}
    >
      <XStack items="center" gap="$1.5">
        {Icon ? <Icon size={13} aria-hidden /> : null}
        <Text fontSize="$1" color="$ink">
          {label}
        </Text>
      </XStack>
    </Box>
  )
}

/** A label: a neutral badge, so a board reads by its words, not a hue per name. */
function Label({ name }: { name: string }) {
  return (
    <XStack px="$2" py="$0.5" rounded="$2" bg="$hover" borderWidth={1} borderColor="$borderColor">
      <Text fontSize="$1" color="$soft" numberOfLines={1}>
        {name}
      </Text>
    </XStack>
  )
}

/** A date, as a person says it. */
function when(unix?: number): string {
  if (!unix) return ''
  const at = new Date(unix * 1000)
  const now = new Date()
  const same = at.getFullYear() === now.getFullYear()
  return at.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(same ? {} : { year: 'numeric' }),
  })
}

/**
 * WHAT A DAY IS CALLED, from where it sits relative to now.
 *
 * "Saturday" is the right name for a day three weeks out and the wrong one for
 * the day you are standing in — a reader looking at the planner already knows
 * what today is, and being told the weekday makes them work out whether that IS
 * today. The three days a person has a word for get that word; the rest get the
 * weekday, and one outside this week gets its date too, because "Tuesday" stops
 * being an answer once there is more than one of them in view.
 */
function dayName(day: Date, now = new Date()): string {
  const at = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((at(day) - at(now)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  const weekday = day.toLocaleDateString(undefined, { weekday: 'long' })
  if (days > 1 && days < 7) return weekday
  return `${weekday} ${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

/** The value a date input wants, from unix seconds. */
const asInput = (unix?: number) =>
  unix ? new Date(unix * 1000).toISOString().slice(0, 10) : ''

// ── the card ────────────────────────────────────────────────────────────────

/**
 * ONE CARD on the board.
 *
 * Everything on it is a field the row already carries, so a board of fifty
 * costs the one read that drew it. The checklist count is the description's own
 * task items — the same ones the forge renders.
 */
function Tile({
  card,
  who,
  onOpen,
}: {
  card: Card
  who?: { avatar?: string; emoji?: string; name: string }
  onOpen: () => void
}) {
  const list = steps(card.description)
  const done = list.filter((s) => s.done).length
  const late = card.dueAt ? card.dueAt * 1000 < Date.now() : false
  return (
    <View
      render={<div draggable />}
      onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/plain', `${card.projectKey}#${card.number}`)}
      display="block"
      cursor="grab"
    >
      <Box
        render="button"
        onClick={onOpen}
        width="100%"
        p="$3"
        gap="$2"
        rounded="$3"
        borderWidth={1}
        borderColor="$borderColor"
        bg="$raised"
        hoverStyle={{ borderColor: '$ink' }}
      >
        <YStack gap="$2" width="100%">
          {card.labels.length > 0 ? (
            <XStack gap="$1" flexWrap="wrap">
              {card.labels.slice(0, 4).map((l) => (
                <Label key={l} name={l} />
              ))}
            </XStack>
          ) : null}

          <Text fontSize="$2" color="$ink" numberOfLines={3} text="left">
            {card.title}
          </Text>

          <XStack items="center" gap="$2" flexWrap="wrap">
            {card.dueAt ? (
              <XStack items="center" gap="$1">
                <CalendarClock size={12} aria-hidden />
                <Text fontSize="$1" color={late ? BAD : '$soft'}>
                  {when(card.dueAt)}
                </Text>
              </XStack>
            ) : null}
            {list.length > 0 ? (
              <XStack items="center" gap="$1">
                <ListChecks size={12} aria-hidden />
                <Text fontSize="$1" color={done === list.length ? '$ink' : '$soft'}>
                  {done}/{list.length}
                </Text>
              </XStack>
            ) : null}
            {card.priority && card.priority !== 'none' ? (
              <Text fontSize="$1" color="$soft">
                {card.priority}
              </Text>
            ) : null}
            <YStack flex={1} />
            {card.assignee ? (
              <Face
                src={who?.avatar}
                emoji={who?.emoji}
                name={who?.name ?? card.assignee}
                size={20}
              />
            ) : null}
          </XStack>
        </YStack>
      </Box>
    </View>
  )
}

// ── the card, opened ────────────────────────────────────────────────────────

/**
 * THE CARD IN FULL, over the board.
 *
 * Each panel writes one thing and re-reads, so nothing here holds a second copy
 * of the card that could disagree with the store. The controls that have no
 * field behind them — a cover, a file — are absent rather than drawn and inert.
 */
function Detail({
  card,
  people,
  agents,
  onClose,
  onSaved,
}: {
  card: Card
  people: { id: string; name: string; label: string; avatar?: string; emoji?: string; agent: boolean }[]
  agents: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { client } = useAi()
  const [panel, setPanel] = useState<'labels' | 'dates' | 'members' | null>(null)
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.description ?? '')
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState<string | null>(null)
  const [step, setStep] = useState('')

  /**
   * THE DURABLE RUN this card's work is doing, if it was ever handed over.
   *
   * The board and the engine stay two stores; the workflow's NAME is the join,
   * so this asks the engine directly rather than reading a column the card
   * would have to keep in step. A card that was never started answers null,
   * which the engine spells as an empty chain.
   */
  const [run, setRun] = useState<Run | null>(null)
  const [starting, setStarting] = useState(false)
  useEffect(() => {
    if (!client) return
    let live = true
    const stop = new AbortController()
    void runOf(client, card.projectKey, card.number, stop.signal)
      .then((r) => live && setRun(r))
      // The engine being unreachable is not this card's failure to report; the
      // run simply is not known, which is what null already means.
      .catch(() => live && setRun(null))
    return () => {
      live = false
      stop.abort()
    }
  }, [client, card.projectKey, card.number])

  // WHAT THE STORE CALLS FINISHED. The column IS the status, so a card in the
  // done column and a card marked done are one fact — reading it here rather
  // than keeping a second flag is what keeps the circle and the column from
  // ever disagreeing.
  const finished = (card.status ?? '').toLowerCase() === 'done'

  const list = steps(body)
  const done = list.filter((s) => s.done).length
  const pct = list.length ? Math.round((done / list.length) * 100) : 0
  const who = people.find((p) => p.name === card.assignee)

  const save = useCallback(
    async (patch: Parameters<typeof edit>[3]) => {
      if (!client) return
      setBusy(true)
      setWrong(null)
      try {
        await edit(client, card.projectKey, card.number, patch)
        onSaved()
      } catch (e) {
        setWrong(e instanceof Error ? e.message : 'The change was refused')
      } finally {
        setBusy(false)
      }
    },
    [client, card.projectKey, card.number, onSaved],
  )

  // TICKING A STEP REWRITES ITS LINE, and only its line — the description is
  // the reader's prose as well as the checklist, so a save that reformatted it
  // would eat what they wrote around the boxes.
  const flip = (line: number, next: boolean) => {
    const written = tick(body, line, next)
    setBody(written)
    void save({ description: written })
  }

  return (
    <YStack
      position="absolute"
      t={0}
      r={0}
      b={0}
      width={560}
      maxW="100%"
      bg="$panel"
      borderLeftWidth={1}
      borderColor="$borderColor"
      z="var(--z-sheet)"
    >
      <XStack
        items="center"
        gap="$2"
        px="$4"
        py="$3"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <Text fontSize="$1" color="$soft" flex={1} numberOfLines={1}>
          {card.identifier}
        </Text>
        <Box render="button" onClick={onClose} p="$1" rounded="$2" aria-label="Close">
          <X size={16} aria-hidden />
        </Box>
      </XStack>

      <YStack flex={1} minH={0} overflowY="auto" overflowX="hidden" p="$4" gap="$4">
        {/* DONE, BESIDE THE NAME OF THE THING.
            Closing a card meant finding the column control and moving it, which
            is the right gesture for "where does this belong" and a long way
            round for "this is finished". The circle is the one act a card is
            most often opened to perform, so it sits against the title the way
            it does on every board of this shape — filled when the work is done,
            and pressing it again reopens.

            `status` is what the store calls it and the one PATCH accepts, so
            this writes the same field the column does. A card marked done here
            is done on the forge, and one closed on the forge is filled here. */}
        <XStack items="center" gap="$2">
          <Box
            render="button"
            onClick={() => void save({ status: finished ? 'todo' : 'done' })}
            aria-label={finished ? 'Reopen this card' : 'Mark this card done'}
            aria-pressed={finished}
            width={22}
            height={22}
            shrink={0}
            rounded={9999}
            borderWidth={finished ? 0 : 1.5}
            borderColor="$soft"
            bg={finished ? '$ink' : 'transparent'}
            items="center"
            justify="center"
            hoverStyle={{ borderColor: '$ink' }}
          >
            {finished ? <Check size={13} color="var(--background)" aria-hidden /> : null}
          </Box>

          {/* THE TITLE IS THE FIELD, so renaming is typing in it and leaving. */}
          <Text
            render={
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== card.title && void save({ title: title.trim() })}
                aria-label="Card title"
              />
            }
            flex={1}
            minW={0}
            bg="transparent"
            borderWidth={0}
            outlineStyle="none"
            color="inherit"
            fontSize="$7"
            fontWeight="600"
            textDecorationLine={finished ? 'line-through' : 'none'}
          />
        </XStack>

        <XStack gap="$1.5" flexWrap="wrap">
          <Act icon={Tag} label="Labels" on={panel === 'labels'} onPress={() => setPanel(panel === 'labels' ? null : 'labels')} />
          <Act icon={Calendar} label="Dates" on={panel === 'dates'} onPress={() => setPanel(panel === 'dates' ? null : 'dates')} />
          <Act icon={UserPlus} label="Members" on={panel === 'members'} onPress={() => setPanel(panel === 'members' ? null : 'members')} />
        </XStack>

        {panel === 'labels' ? (
          <YStack gap="$2" p="$3" rounded="$3" borderWidth={1} borderColor="$borderColor">
            <Text fontSize="$2" fontWeight="600" color="$ink">
              Labels
            </Text>
            {card.labels.length > 0 ? (
              <XStack gap="$1" flexWrap="wrap">
                {card.labels.map((l) => (
                  <Label key={l} name={l} />
                ))}
              </XStack>
            ) : (
              <Text fontSize="$1" color="$soft">
                None yet.
              </Text>
            )}
            {/* THE COLOUR IS THE NAME'S, derived rather than stored, so the same
                label is the same colour everywhere and nothing can drift. */}
            <Text fontSize="$1" color="$soft">
              A label is a word on the forge issue, and its colour comes from the
              word — so it reads the same here and there. Labels are added on the
              forge; this board does not write them yet.
            </Text>
          </YStack>
        ) : null}

        {panel === 'dates' ? (
          <YStack gap="$2" p="$3" rounded="$3" borderWidth={1} borderColor="$borderColor">
            <Text fontSize="$2" fontWeight="600" color="$ink">
              Dates
            </Text>
            <XStack gap="$3" flexWrap="wrap">
              <YStack gap="$1">
                <Text fontSize="$1" color="$soft">
                  Start
                </Text>
                <Text render={<input type="date" value={asInput(card.startAt)} readOnly />} {...DATE} />
              </YStack>
              <YStack gap="$1">
                <Text fontSize="$1" color="$soft">
                  Due
                </Text>
                <Text render={<input type="date" value={asInput(card.dueAt)} readOnly />} {...DATE} />
              </YStack>
            </XStack>
            {/* SAID PLAINLY rather than drawn as a control that writes nowhere.
                A forge issue has no deadline of its own — the store takes the
                due date from the issue's MILESTONE — so a per-card date needs a
                decision about milestones before it can be written from here. */}
            <Text fontSize="$1" color="$soft">
              A card&apos;s dates come from its forge milestone, which is why they
              read here and cannot yet be set here.
            </Text>
          </YStack>
        ) : null}

        {panel === 'members' ? (
          <YStack gap="$2" p="$3" rounded="$3" borderWidth={1} borderColor="$borderColor">
            <Text fontSize="$2" fontWeight="600" color="$ink">
              Members
            </Text>
            {/* PEOPLE AND AGENTS IN ONE LIST, because the store keeps ONE
                assignee and does not ask which kind of worker it is. Handing a
                card to an agent is the same act as handing it to a person.
                Pressing the one who already holds it takes it back off them. */}
            {people.length === 0 ? (
              <Text fontSize="$1" color="$soft">
                Nobody to assign yet.
              </Text>
            ) : (
              people.map((p) => (
                <Box
                  key={p.id}
                  render="button"
                  onClick={() => void save({ assignee: card.assignee === p.name ? '' : p.name })}
                  width="100%"
                  p="$2"
                  rounded="$2"
                  hoverStyle={{ bg: '$hover' }}
                >
                  <XStack items="center" gap="$2">
                    <Face src={p.avatar} emoji={p.emoji} name={p.label} size={22} />
                    <Text fontSize="$2" color="$ink" flex={1} numberOfLines={1}>
                      {p.label}
                    </Text>
                    {p.agent ? (
                      <Text fontSize="$1" color="$soft">
                        agent
                      </Text>
                    ) : null}
                    {card.assignee === p.name ? <Check size={14} aria-hidden /> : null}
                  </XStack>
                </Box>
              ))
            )}
            <Box
              render="button"
              onClick={() => {
                if (!client || busy) return
                setBusy(true)
                void claim(client, card.projectKey, card.number)
                  .then(onSaved)
                  .catch((e: Error) => setWrong(e.message))
                  .finally(() => setBusy(false))
              }}
              p="$2"
              rounded="$2"
              borderWidth={1}
              borderColor="$borderColor"
              hoverStyle={{ bg: '$hover' }}
            >
              <Text fontSize="$1" color="$ink">
                Take it myself
              </Text>
            </Box>
          </YStack>
        ) : null}

        {/* DESCRIPTION */}
        <YStack gap="$2">
          <Text fontSize="$2" fontWeight="600" color="$ink">
            Description
          </Text>
          <Text
            render={
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => body !== (card.description ?? '') && void save({ description: body })}
                placeholder="What is this card about?"
                rows={5}
              />
            }
            width="100%"
            bg="transparent"
            borderWidth={1}
            borderColor="var(--border)"
            rounded={8}
            p={10}
            outlineStyle="none"
            color="inherit"
            fontSize="$2"
          />
        </YStack>

        {/* CHECKLIST */}
        <YStack gap="$2">
          <XStack items="center" gap="$2">
            <Text fontSize="$2" fontWeight="600" color="$ink" flex={1}>
              Checklist
            </Text>
            {list.length > 0 ? (
              <Text fontSize="$1" color="$soft">
                {pct}%
              </Text>
            ) : null}
          </XStack>

          {list.length > 0 ? (
            <YStack height={4} rounded={9999} bg="$hover" overflow="hidden">
              <YStack width={`${pct}%`} height={4} bg="$ink" />
            </YStack>
          ) : null}

          {list.map((s) => (
            <XStack key={s.line} items="center" gap="$2">
              <input
                type="checkbox"
                checked={s.done}
                onChange={(e) => flip(s.line, e.target.checked)}
                aria-label={s.text}
              />
              <Text
                fontSize="$2"
                color={s.done ? '$soft' : '$ink'}
                textDecorationLine={s.done ? 'line-through' : 'none'}
                flex={1}
              >
                {s.text}
              </Text>
            </XStack>
          ))}

          <XStack gap="$2">
            <Text
              render={
                <input
                  value={step}
                  onChange={(e) => setStep(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || !step.trim()) return
                    const written = addStep(body, step)
                    setBody(written)
                    setStep('')
                    void save({ description: written })
                  }}
                  placeholder="Add an item"
                />
              }
              flex={1}
              bg="transparent"
              borderWidth={1}
              borderColor="var(--border)"
              rounded={6}
              px={8}
              py={6}
              outlineStyle="none"
              color="inherit"
              fontSize="$2"
            />
          </XStack>
        </YStack>

        {/* WHERE IT IS, and what it is worth. */}
        <XStack gap="$3" flexWrap="wrap">
          <YStack gap="$1">
            <Text fontSize="$1" color="$soft">
              Column
            </Text>
            <Select value={card.status} onValueChange={(v) => void save({ status: v })}>
              <SelectTrigger aria-label="Column" width={160}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </YStack>
          <YStack gap="$1">
            <Text fontSize="$1" color="$soft">
              Priority
            </Text>
            <Select value={card.priority || 'none'} onValueChange={(v) => void save({ priority: v })}>
              <SelectTrigger aria-label="Priority" width={160}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </YStack>
        </XStack>

        {/* HANDING THE WORK OVER. A card says what should be done; the engine
            runs it durably — event-sourced, replayable, surviving a crash — and
            the two stay separate stores joined by the run's name. This is the
            seam, and it is the whole of it: no card state is copied into the
            engine and no run state is copied onto the card. */}
        <YStack gap="$2" pt="$2" borderTopWidth={1} borderColor="$borderColor">
          <Text fontSize="$2" fontWeight="600" color="$ink">
            Durable run
          </Text>
          {run ? (
            <XStack items="center" gap="$2" flexWrap="wrap">
              <Text fontSize="$2" color="$ink">
                {reads(run.status)}
              </Text>
              <Text fontSize="$1" color="$soft" numberOfLines={1}>
                {run.workflowId}
              </Text>
              {run.historyLength ? (
                <Text fontSize="$1" color="$soft">
                  {run.historyLength} events
                </Text>
              ) : null}
            </XStack>
          ) : (
            <XStack items="center" gap="$2" flexWrap="wrap">
              <Text fontSize="$1" color="$soft" flex={1}>
                {card.assignee
                  ? `${card.assignee} holds this. Hand the work to the engine and it survives a crash.`
                  : 'Nobody holds this yet — it can still be run, and the run is durable either way.'}
              </Text>
              <Box
                render="button"
                onClick={() => {
                  if (!client || starting) return
                  setStarting(true)
                  setWrong(null)
                  void startRun(client, card.projectKey, card.number, {
                    title: card.title,
                    queue: AGENT_QUEUE,
                    type: AGENT_WORKFLOW,
                  })
                    .then(setRun)
                    .catch((e: Error) => setWrong(e.message))
                    .finally(() => setStarting(false))
                }}
                px="$2.5"
                py="$1.5"
                rounded="$2"
                borderWidth={1}
                borderColor="$borderColor"
                hoverStyle={{ bg: '$hover' }}
              >
                <Text fontSize="$1" color="$ink">
                  {starting ? 'Handing over…' : 'Run it'}
                </Text>
              </Box>
            </XStack>
          )}
        </YStack>

        {who ? (
          <XStack items="center" gap="$2">
            <Face src={who.avatar} emoji={who.emoji} name={who.label} size={22} />
            <Text fontSize="$2" color="$soft">
              {who.label} has this one.
            </Text>
          </XStack>
        ) : null}

        {wrong ? (
          <Text fontSize="$1" color={BAD} numberOfLines={3}>
            {wrong}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  )
}

/** A date the sheet shows and does not yet write. */
const DATE = {
  bg: 'transparent',
  color: 'inherit',
  fontSize: '$2',
  borderWidth: 1,
  borderColor: 'var(--border)',
  rounded: 6,
  px: 8,
  py: 6,
  minW: 150,
} as const

// ── the planner ─────────────────────────────────────────────────────────────

/**
 * THE DAY, beside the board.
 *
 * It draws the cards that are DUE on the day shown, against the hours — so the
 * question it answers is "what is landing today", which is the one a board of
 * columns cannot answer. A card with a due date but no hour sits at the top of
 * the day rather than being placed at an hour nobody chose.
 */
function Planner({ cards, onOpen }: { cards: Card[]; onOpen: (c: Card) => void }) {
  const [offset, setOffset] = useState(0)
  const day = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    d.setHours(0, 0, 0, 0)
    return d
  }, [offset])

  const start = Math.floor(day.getTime() / 1000)
  const due = cards.filter((c) => c.dueAt && c.dueAt >= start && c.dueAt < start + DAY)

  return (
    // THE PLANNER IS A VIEW, NOT A SIDEBAR. It is one of two ways to read the
    // same cards — by the day they are due, or by the column they sit in — and a
    // reader wants one of those at a time. Beside the board it was a 320px strip
    // that fit no phone and crowded every laptop; the control that opens it
    // reads as a switch, so it is one.
    <YStack flex={1} minW={0} minH={0}>
      <XStack
        items="center"
        gap="$2"
        px="$3"
        py="$3"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <Calendar size={14} aria-hidden />
        <Text fontSize="$2" fontWeight="600" color="$ink" flex={1}>
          {day.toLocaleDateString(undefined, { month: 'long' })}
        </Text>
        <Box render="button" onClick={() => setOffset((n) => n - 1)} p="$1" rounded="$2" aria-label="Previous day">
          <ChevronLeft size={14} aria-hidden />
        </Box>
        <Box
          render="button"
          onClick={() => setOffset(0)}
          px="$2"
          py="$1"
          rounded="$2"
          borderWidth={1}
          borderColor="$borderColor"
        >
          <Text fontSize="$1" color="$ink">
            Today
          </Text>
        </Box>
        <Box render="button" onClick={() => setOffset((n) => n + 1)} p="$1" rounded="$2" aria-label="Next day">
          <ChevronRight size={14} aria-hidden />
        </Box>
      </XStack>

      <YStack items="center" py="$2" gap="$1">
        <Text fontSize="$1" color="$soft">
          {dayName(day)}
        </Text>
        <Text fontSize="$4" fontWeight="600" color="$ink">
          {day.getDate()}
        </Text>
      </YStack>

      <YStack flex={1} minH={0} overflowY="auto" overflowX="hidden">
        {due.length > 0 ? (
          <YStack p="$3" gap="$2">
            <Text fontSize="$1" color="$soft">
              Due today
            </Text>
            {due.map((c) => (
              <Box
                key={c.id}
                render="button"
                onClick={() => onOpen(c)}
                width="100%"
                p="$2.5"
                rounded="$3"
                borderWidth={1}
                borderColor="$borderColor"
                bg="$raised"
                hoverStyle={{ borderColor: '$ink' }}
              >
                <Text fontSize="$2" color="$ink" numberOfLines={2} text="left">
                  {c.title}
                </Text>
              </Box>
            ))}
          </YStack>
        ) : null}

        {/* THE HOURS, so the day reads as a day and not as a list. */}
        {Array.from({ length: 12 }, (_, i) => i + 8).map((hour) => (
          <XStack key={hour} height={56} borderTopWidth={1} borderColor="$borderColor">
            <YStack width={54} pt="$1" pl="$3">
              <Text fontSize="$1" color="$soft">
                {hour % 12 === 0 ? 12 : hour % 12} {hour < 12 ? 'am' : 'pm'}
              </Text>
            </YStack>
          </XStack>
        ))}
      </YStack>
    </YStack>
  )
}

// ── the board ───────────────────────────────────────────────────────────────

function Column({
  column,
  cards,
  people,
  onDrop,
  onOpen,
  onAdd,
  loading,
}: {
  column: (typeof COLUMNS)[number]
  cards: Card[]
  people: { name: string; label: string; avatar?: string; emoji?: string }[]
  onDrop: (ref: string, status: string) => void
  onOpen: (c: Card) => void
  /** Answers whether the card landed; the composer keeps the text if it did not. */
  onAdd: (status: string, title: string) => Promise<boolean>
  /** The first read has not answered yet, so the count is not yet a fact. */
  loading?: boolean
}) {
  const [over, setOver] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  return (
    <XStack
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault()
        setOver(false)
        const ref = e.dataTransfer.getData('text/plain')
        if (ref) onDrop(ref, column.id)
      }}
    >
      <YStack
        width={300}
        gap="$2"
        p="$2"
        rounded="$3"
        borderWidth={1}
        borderColor={over ? '$ink' : '$borderColor'}
        bg="$hover"
        maxH="100%"
      >
        <XStack items="baseline" gap="$2" px="$2" pt="$1">
          <Text fontSize="$2" fontWeight="600" color="$ink" flex={1}>
            {column.label}
          </Text>
          <Text fontSize="$1" color="$soft">
            {loading ? '' : cards.length}
          </Text>
        </XStack>

        <YStack gap="$2" overflowY="auto" overflowX="hidden" shrink={1}>
          {cards.map((c) => (
            <Tile
              key={c.id}
              card={c}
              who={people.find((p) => p.name === c.assignee)}
              onOpen={() => onOpen(c)}
            />
          ))}
        </YStack>

        {adding ? (
          <YStack gap="$2">
            <Text
              render={
                <textarea
                  value={title}
                  autoFocus
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setAdding(false)
                      setTitle('')
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      const said = title.trim()
                      if (!said) return
                      // THE TEXT SURVIVES A REFUSAL. Clearing before the answer is
                      // how a failed save costs somebody the sentence they wrote.
                      void onAdd(column.id, said).then((landed) => {
                        if (!landed) return
                        setTitle('')
                        setAdding(false)
                      })
                    }
                  }}
                  placeholder="What needs doing?"
                  rows={2}
                />
              }
              // design's base sheet makes every textarea resizable; gui types no `resize`.
              $platform-web={{ resize: 'none' }}
              width="100%"
              bg="var(--surface-card)"
              borderWidth={1}
              borderColor="var(--border)"
              rounded={8}
              p={8}
              outlineStyle="none"
              color="inherit"
              fontSize="$2"
            />
          </YStack>
        ) : (
          <Box
            render="button"
            onClick={() => setAdding(true)}
            width="100%"
            p="$2"
            rounded="$2"
            // THE WHOLE ROW LIGHTS, not the words — it is a full-width target and
            // a fill is what says so. The tint sits above the column's own
            // ground so the row reads as raised rather than merely tinted.
            hoverStyle={{ bg: '$raised' }}
          >
            <XStack items="center" gap="$1.5">
              <Plus size={13} aria-hidden />
              <Text fontSize="$1" color="$soft">
                Add a card
              </Text>
            </XStack>
          </Box>
        )}
      </YStack>
    </XStack>
  )
}

/** One narrowing, as a box a reader ticks. */
function Tick({
  on,
  label,
  onPress,
}: {
  on: boolean
  label: ReactNode
  onPress: () => void
}) {
  return (
    <Box
      render="button"
      onClick={onPress}
      width="100%"
      px="$2"
      py="$1.5"
      rounded="$2"
      hoverStyle={{ bg: '$hover' }}
    >
      <XStack items="center" gap="$2">
        <YStack
          width={14}
          height={14}
          rounded={3}
          borderWidth={1}
          borderColor={on ? '$ink' : '$borderColor'}
          bg={on ? '$ink' : 'transparent'}
          items="center"
          justify="center"
          shrink={0}
        >
          {on ? <Check size={10} color="var(--background)" aria-hidden /> : null}
        </YStack>
        {typeof label === 'string' ? (
          <Text fontSize="$2" color="$ink" numberOfLines={1}>
            {label}
          </Text>
        ) : (
          label
        )}
      </XStack>
    </Box>
  )
}

/**
 * THE FILTER, and it is what makes this board auditable.
 *
 * "Who did this" is the question a board of cards cannot answer by looking, and
 * it is the one an org actually asks once agents work alongside people. The
 * store answers it two ways at once — a row carries the `source` it was filed
 * from and the `assignee` holding it — so "by an agent" means either, and this
 * panel says so rather than picking one and being quietly wrong about the other.
 *
 * Every facet here is settled from a card the board already read. There is no
 * narrowing that needs a second request, and none that needs a field the store
 * does not keep.
 */
function Filter({
  want,
  labels,
  onWant,
  onClose,
}: {
  want: Sift
  labels: string[]
  onWant: (next: Sift) => void
  onClose: () => void
}) {
  const set = (patch: Partial<Sift>) => onWant({ ...want, ...patch })
  const flipLabel = (l: string) => {
    const held = want.labels ?? []
    set({ labels: held.includes(l) ? held.filter((x) => x !== l) : [...held, l] })
  }
  const Head = ({ children }: { children: ReactNode }) => (
    <Text fontSize="$1" color="$soft" px="$2" pt="$2">
      {children}
    </Text>
  )

  return (
    <YStack
      position="absolute"
      t={52}
      r={12}
      width={300}
      maxH={560}
      overflowY="auto" overflowX="hidden"
      p="$2"
      gap="$0.5"
      rounded="$4"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$panel"
      z="var(--z-dock)"
    >
      <XStack items="center" px="$2" py="$1">
        <Text fontSize="$2" fontWeight="600" color="$ink" flex={1}>
          Filter
        </Text>
        <Box render="button" onClick={onClose} p="$1" rounded="$2" aria-label="Close filter">
          <X size={14} aria-hidden />
        </Box>
      </XStack>

      <Tick on={want.holder === 'none'} label="Nobody has it" onPress={() => set({ holder: want.holder === 'none' ? undefined : 'none' })} />
      <Tick on={want.holder === 'me'} label="Mine" onPress={() => set({ holder: want.holder === 'me' ? undefined : 'me' })} />

      <Head>Who did the work</Head>
      <Tick on={want.by === 'person'} label="A person" onPress={() => set({ by: want.by === 'person' ? undefined : 'person' })} />
      <Tick on={want.by === 'agent'} label="An agent" onPress={() => set({ by: want.by === 'agent' ? undefined : 'agent' })} />

      <Head>Card status</Head>
      <Tick on={want.state === 'done'} label="Finished" onPress={() => set({ state: want.state === 'done' ? undefined : 'done' })} />
      <Tick on={want.state === 'open'} label="Still open" onPress={() => set({ state: want.state === 'open' ? undefined : 'open' })} />

      <Head>Due date</Head>
      {([['none', 'No dates'], ['late', 'Overdue'], ['day', 'Due in the next day'], ['week', 'Due in the next week'], ['month', 'Due in the next month']] as const).map(
        ([id, label]) => (
          <Tick key={id} on={want.due === id} label={label} onPress={() => set({ due: want.due === id ? undefined : id })} />
        ),
      )}

      {labels.length > 0 ? (
        <>
          <Head>Labels</Head>
          {labels.map((l) => (
            <Tick key={l} on={(want.labels ?? []).includes(l)} label={<Label name={l} />} onPress={() => flipLabel(l)} />
          ))}
        </>
      ) : null}

      <Head>Activity</Head>
      {([[7, 'Moved in the last week'], [14, 'Moved in the last two weeks'], [28, 'Moved in the last four weeks']] as const).map(
        ([days, label]) => (
          <Tick key={days} on={want.active === days} label={label} onPress={() => set({ active: want.active === days ? undefined : days })} />
        ),
      )}

      <Box
        render="button"
        onClick={() => onWant({})}
        width="100%"
        mt="$2"
        p="$2"
        rounded="$2"
        borderWidth={1}
        borderColor="$borderColor"
        hoverStyle={{ bg: '$hover' }}
      >
        <Text fontSize="$1" color="$ink">
          Clear
        </Text>
      </Box>
    </YStack>
  )
}

// ── the room ────────────────────────────────────────────────────────────────

/** Said when a write has no board to write to. It is the same event whichever
 *  write asked, so it is one sentence rather than two wordings of one. */
const NOWHERE = 'No project answered, so there is nowhere to file this card.'

function Cards() {
  const { client } = useAi()
  const { user } = useIam()
  const { currentOrgId } = useOrganizations()
  // WHO I AM on the forge, which is the name a card's assignee is spelled with.
  const me = user?.name
  const { agents } = useAgents()
  const { people: humans } = usePeople({ owner: currentOrgId ?? '', service: false })

  const [cards, setCards] = useState<Card[] | null>(null)
  const [key, setKey] = useState<string>('')
  const [keys, setKeys] = useState<string[]>([])
  const [refused, setRefused] = useState<string | null>(null)
  // ONE STATE FOR TWO READINGS OF THE SAME CARDS. Two booleans — one per view
  // — is how a room ends up showing neither or both, and the foot ended up
  // lighting Board while the planner was the thing on screen.
  const { aside, showAside } = useOpen()
  const [view, setView] = useState<'board' | 'planner'>('board')
  const [opened, setOpened] = useState<Card | null>(null)
  const [want, setWant] = useState<Sift>({})
  const [filtering, setFiltering] = useState(false)
  const [nonce, bump] = useState(0)

  // WHO CAN HAVE A CARD: the org's people and its agents, in one list, because
  // the store keeps one assignee and does not ask which kind of worker it is.
  const roster = useMemo(
    () => [
      ...humans.map((p) => ({
        id: p.id,
        name: p.name,
        label: p.displayName || p.name,
        agent: false as const,
      })),
      ...agents.map((a) => ({
        id: a.id,
        name: a.name,
        label: a.name,
        avatar: a.avatar,
        emoji: a.emoji,
        agent: true as const,
      })),
    ],
    [humans, agents],
  )

  useEffect(() => {
    let live = true
    const stop = new AbortController()
    void readProjects(client, stop.signal)
      .then((ps) => {
        if (!live) return
        const ks = ps.map((p) => p.key).filter(Boolean)
        setKeys(ks)
        setKey((k) => k || ks[0] || '')
      })
      .catch(() => {})
    void readBoard(client, key ? { key } : {}, stop.signal)
      .then((rows) => live && (setCards(rows), setRefused(null)))
      .catch((e: Error) => live && (setCards([]), setRefused(say(e, 'this board'))))
    return () => {
      live = false
      stop.abort()
    }
  }, [client, key, nonce])

  // THE AGENT NAMES, so "an agent did this" can be answered about a card whose
  // source says `team` but whose holder is a bot — which is what a person filing
  // work and handing it over actually looks like.
  const bots = useMemo(() => new Set(agents.map((a) => a.name)), [agents])
  const labels = useMemo(
    () => [...new Set((cards ?? []).flatMap((c) => c.labels))].sort(),
    [cards],
  )
  const shown = useMemo(() => sift(cards ?? [], want, me, bots), [cards, want, me, bots])
  const narrowed = Object.values(want).some((v) => (Array.isArray(v) ? v.length : v !== undefined))

  const filed = useMemo(() => {
    const out = new Map<string, Card[]>()
    for (const c of shown) {
      const held = out.get(c.status)
      if (held) held.push(c)
      else out.set(c.status, [c])
    }
    return out
  }, [shown])

  const move = useCallback(
    (ref: string, status: string) => {
      const [k, n] = ref.split('#')
      // THE CARD'S OWN REF FIRST, then the board on screen, then the first one
      // the store named — and nothing after that. The chain used to end
      // `|| currentOrgId || 'hanzo'`, which files a write against a board whose
      // owner nobody established: an org id is not a project key, and `hanzo` is
      // somebody's real board. A write with no name to write under is refused.
      const targetKey = k || key || keys[0]
      if (!n) return
      if (!targetKey) return setRefused(NOWHERE)
      void edit(client, targetKey, Number(n), { status })
        .then(() => bump((x) => x + 1))
        .catch((e: Error) => setRefused(say(e, 'this card', 'save')))
    },
    [client, key, keys],
  )

  /**
   * Files a card, and ANSWERS WHETHER IT LANDED.
   */
  const add = useCallback(
    async (status: string, title: string): Promise<boolean> => {
      const targetKey = key || keys[0]
      if (!targetKey) {
        setRefused(NOWHERE)
        return false
      }
      try {
        await openCard(client, targetKey, { title, status })
        setRefused(null)
        if (!key) {
          setKey(targetKey)
          setKeys((prev) => (prev.includes(targetKey) ? prev : [...prev, targetKey]))
        }
        bump((x) => x + 1)
        return true
      } catch (e) {
        setRefused(say(e, 'this card', 'save'))
        return false
      }
    },
    [client, key, keys],
  )

  return (
    <YStack flex={1} minH={0} position="relative">
      <XStack
        height={52}
        shrink={0}
        items="center"
        gap="$3"
        px="$3"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <Text render="h1" fontSize="$4" fontWeight="600" color="$ink" numberOfLines={1}>
          Board
        </Text>
        <Select value={key || 'all'} onValueChange={setKey}>
          <SelectTrigger aria-label="Board" width={140} $sm={{ width: 100 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem key="all" value="all">
              All Boards
            </SelectItem>
            {keys.map((k) => (
              <SelectItem key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <YStack flex={1} />
        {cards ? (
          <Text fontSize="$1" color="$soft" display="none" $md={{ display: 'flex' }}>
            {narrowed ? `${shown.length} of ${cards.length}` : `${cards.length} cards`}
          </Text>
        ) : null}
        <Act
          icon={ListFilter}
          label="Filter"
          on={filtering || narrowed}
          onPress={() => setFiltering((v) => !v)}
        />
        <XStack display="none" $md={{ display: 'flex' }}>
          <Act
            icon={SquareTerminal}
            label="Tabs & Shell"
            on={Boolean(aside)}
            onPress={() => showAside(aside ? null : "tasks")}
          />
        </XStack>
      </XStack>

      <XStack flex={1} minH={0}>
        {view === 'planner' ? <Planner cards={cards ?? []} onOpen={setOpened} /> : null}

        {/* THE COLUMNS ARE ALWAYS DRAWN, and only the CARDS wait on the store.
            The board's shape is not data — the columns are the platform's own
            closed set, the same five whether anything answers — so replacing the
            whole board with a failure took away the shape, the counts and every
            Add a card along with the rows nobody could read. A refusal belongs
            in a line that says what is missing, not in place of the room.

            An empty column and a column whose cards could not be fetched read
            differently now, which they must: one is a board with nothing in it,
            the other is a board nobody can see. */}
        <YStack
          flex={1}
          minW={0}
          minH={0}
          // One view at a time: the planner is the other reading of these cards.
          display={view === 'planner' ? "none" : "flex"}
        >
          {refused ? (
            <XStack
              items="center"
              gap="$2"
              mx="$4"
              mt="$3"
              px="$3"
              py="$2"
              rounded="$3"
              borderWidth={1}
              borderColor="$borderColor"
              bg="$hover"
            >
              {/* THE SENTENCE GIVES AND THE BUTTON DOES NOT. `flex: 1` alone
                  still floors a text box at its longest unbroken word, so a
                  refusal that names a URL or an id pushes the control off a
                  390px screen — where the reader can neither read the reason nor
                  press the one thing that answers it. */}
              <Text fontSize="$1" color="$soft" flex={1} minW={0}>
                {refused} Cards will appear here when it answers.
              </Text>
              <Box
                render="button"
                onClick={() => bump((x) => x + 1)}
                shrink={0}
                px="$2"
                py="$1"
                rounded="$2"
                borderWidth={1}
                borderColor="$borderColor"
                hoverStyle={{ bg: '$hover' }}
              >
                <Text fontSize="$1" color="$ink">
                  Try again
                </Text>
              </Box>
            </XStack>
          ) : null}

          <XStack flex={1} minH={0} overflowX="auto" overflowY="auto" p="$4" gap="$3" items="flex-start">
            {COLUMNS.map((c) => (
              <Column
                key={c.id}
                column={c}
                cards={filed.get(c.id) ?? []}
                people={roster}
                onDrop={move}
                onOpen={setOpened}
                onAdd={add}
                loading={cards === null && !refused}
              />
            ))}
          </XStack>
        </YStack>
      </XStack>

      {/* THE FOOT: which reading of the cards is up. Board leads it and the room
          opens there, because Board is what this room is called — the planner is
          the same cards laid against the calendar. Two panes and not three: the
          workspace already has an inbox, and a second would be two places for
          the same arriving thing. */}
      <XStack
        shrink={0}
        items="center"
        gap="$2"
        px="$3"
        py="$2"
        borderTopWidth={1}
        borderColor="$borderColor"
      >
        <Act
          icon={Columns3}
          label="Board"
          on={view === 'board'}
          onPress={() => setView('board')}
        />
        <Act
          icon={Calendar}
          label="Planner"
          on={view === 'planner'}
          onPress={() => setView('planner')}
        />
        <YStack flex={1} />
        <Text fontSize="$1" color="$soft" numberOfLines={1} display="none" $md={{ display: 'flex' }}>
          A card is a forge issue — moving it here moves it there.
        </Text>
      </XStack>

      {filtering ? (
        <Filter want={want} labels={labels} onWant={setWant} onClose={() => setFiltering(false)} />
      ) : null}

      {opened ? (
        <Detail
          card={cards?.find((c) => c.id === opened.id) ?? opened}
          people={roster}
          agents={agents}
          onClose={() => setOpened(null)}
          onSaved={() => bump((x) => x + 1)}
        />
      ) : null}
    </YStack>
  )
}

/**
 * The pane, and the session its reads need.
 *
 * SPLIT so the hooks below never run for a reader with none: every route this
 * pane reads is org-scoped and answers 403 without one, and a hook cannot be
 * called conditionally — so the condition is a component boundary rather than
 * an `if` the rules forbid.
 */
export function Board() {
  return <Cards />
}
