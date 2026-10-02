'use client'

// The working view: what is running, what it did, and what it made.
//
// Every piece here comes from `@hanzo/ui/agents` and every fact from
// `@hanzo/ai`. This file is arrangement — it owns no pixels and no transport,
// which is the test of whether the lift actually landed: a stranger with the
// two packages can assemble this room, and a channel workspace will assemble
// the same one from the same parts.
//
// THE BOARD IS A TREE, not a list. `sessions.list` answers ROOT sessions only,
// so a fan-out is invisible until you ask for it: each root with `children > 0`
// gets one `tree` read, and `nest` is not needed here because the server
// already materialises the nesting. A root with no children costs no request.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAi, useSession, useSessions } from '@hanzo/ai/react'
import { useOpen } from './open'
import type { Session, SessionEvent, TreeNode } from '@hanzo/ai'
import {
  AgentBoard,
  ChannelHeader,
  Pane,
  ProgressBlock,
  Steer,
  steps,
  type Command,
  type Run,
  type RunStatus,
} from '@hanzo/ui/agents'
import { Text, XStack, YStack } from '@hanzo/ui'
import { useIam } from '@hanzo/iam/react'
import { Composer } from '@hanzo/ui/chat'
import { Start } from './Start'
import { Bar } from './progress'

/** The server's four statuses, plus the honest fallback for anything else. */
const STATUS = (s?: string): RunStatus =>
  s === 'running' || s === 'paused' || s === 'done' || s === 'error' ? s : 'unknown'

/**
 * A session as the board reads it.
 *
 * `doing` is `lastEvent.preview` — the first 240 BYTES of a payload, cut
 * without regard for JSON or rune boundaries. It is rendered, never parsed, and
 * never re-cut here: a second truncation of an already-truncated string is how
 * a preview becomes a fragment of a fragment.
 */
/**
 * What the run is doing, in words.
 *
 * The preview is the first 240 bytes of the raw event, so for a machine payload
 * it arrives as `{"type":"done","finishRea…` — a fragment of JSON with the
 * closing brace cut off. Rendering that put twenty-five lines of escaped JSON
 * down the board where the summaries belong, which reads as a crash.
 *
 * It cannot be parsed back (it is truncated by construction), so this reads the
 * one field that survives the cut — `type` is written first by every producer —
 * and says it. Anything that does not look like a payload is human text already
 * and passes through untouched.
 */
const say = (preview?: string): string | undefined => {
  if (!preview) return undefined
  const raw = preview.trim()
  if (!raw.startsWith('{') && !raw.startsWith('"{') && !raw.startsWith('[')) return preview
  const kind = /"type"\s*:\s*\\?"([a-z_]+)/i.exec(raw)?.[1]
  switch (kind) {
    case 'done': return 'Finished'
    case 'error': return 'Failed'
    case 'start': return 'Starting'
    case 'tool': case 'tool_call': return 'Using a tool'
    case 'text': case 'delta': return 'Writing'
    case undefined: return undefined
    default: return kind.replace(/_/g, ' ')
  }
}

const toRun = (s: Session, children: Run[] = []): Run => ({
  id: s.id,
  agent: s.agent || s.title || s.id,
  status: STATUS(s.status),
  doing: say(s.lastEvent?.preview),
  target: s.target,
  project: s.project,
  children,
})

/** Flatten the server's tree into the board's, dropping the node we asked for. */
const kidsOf = (node: TreeNode | null): Run[] =>
  // `children` is NULL on a leaf, not `[]` — the guard is load-bearing.
  (node?.children ?? []).map((child) =>
    child.session ? toRun(child.session, kidsOf(child)) : null,
  ).filter((r): r is Run => r !== null)

function Watching({ idle }: { idle?: ReactNode }) {
  const ai = useAi()
  const { sessions, loading, reload } = useSessions({ limit: 100 })
  // THE OPEN RUN IS THE SHELL'S, not this pane's. `Start` announces a new run by
  // writing `openSession`, which is how /dev picks it up; this pane kept its own
  // useState and so never heard, and the one control the idle state offers spent
  // money on a real run and left the reader reading "No runs yet". Same store,
  // and the list is re-read when the id changes so the new row is there to open.
  const { session: open, openSession: setOpen } = useOpen()
  const [trees, setTrees] = useState<Record<string, Run[]>>({})

  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  // One `tree` read per root that says it has children. Roots without a
  // fan-out are left alone, so an org of solo runs costs exactly one request.
  useEffect(() => {
    const safeSessions = Array.isArray(sessions) ? sessions : []
    const swarms = safeSessions.filter((s) => (s?.children ?? 0) > 0)
    if (!swarms.length) return
    const stop = new AbortController()
    void Promise.all(
      swarms.map((s) =>
        ai.sessions
          .tree(s.id, { signal: stop.signal })
          .then((node) => [s.id, kidsOf(node)] as const)
          .catch(() => [s.id, [] as Run[]] as const),
      ),
    ).then((pairs) => {
      if (!stop.signal.aborted) setTrees(Object.fromEntries(pairs))
    })
    return () => stop.abort()
  }, [ai, sessions])

  const runs = useMemo(
    () => sessions.map((s) => toRun(s, trees[s.id] ?? [])),
    [sessions, trees],
  )

  return (
    // A COLUMN THAT BECOMES A ROW, never a wrapped row. `flexWrap` put the
    // board on one line and the pane on the next, and a wrapped container with
    // a definite height distributes its free space across the LINES
    // (`align-content: stretch`): measured at 960, two lines of 424px each, so
    // the 220px board reserved 424 and the pane began 204px below the bottom of
    // the list. That gap is what made /dev read as broken. Stating the axis
    // per breakpoint is the same layout with no line-box arithmetic in it.
    <YStack flex={1} minH={0} width="100%" $lg={{ flexDirection: 'row' }}>
      <YStack
        // AN EMPTY BOARD DRAWS NOTHING ACROSS THE TOP. As a full-width strip it
        // reserved 270px and a hairline for one line of grey text, and pushed
        // the pane's own content most of a screen down — a narrow window's
        // whole budget spent saying there is nothing to show. As a COLUMN it is
        // still worth drawing empty, because a column with a heading is where a
        // reader looks for the list; a strip is not.
        display={runs.length === 0 ? 'none' : 'flex'}
        width="100%"
        // A STRIP HAS A HEIGHT, and `maxHeight` could not give it one. The
        // board inside is a ScrollView at `flex: 1 1 0` — a zero basis — so in
        // a column with an auto height it measured 1px and the strip vanished.
        // "Up to 220" is not expressible over a child that contributes nothing;
        // 220 is.
        height={220}
        shrink={0}
        borderBottomWidth={1}
        // A COLUMN NEEDS A WINDOW WIDE ENOUGH FOR TWO. At 640 this took 300 of
        // the 316px left after the rail and the sidebar, so the pane beside it
        // was 32px wide and the run itself was unreadable — a narrow strip with
        // a rule down it, which is what a squeezed column looks like. Above
        // 1024 there is room for both; below it the board is a strip across the
        // top and the run has the whole width under it.
        //
        // STATE THE VALUE, NEVER `undefined`. gui emits nothing for an
        // undefined value, so the base cap this block used to lift SURVIVED
        // into `$lg` and the full-height column described here was a 220px stub
        // at every width — measured in the browser at 1280.
        $lg={{
          display: 'flex',
          width: 300,
          shrink: 0,
          height: '100%',
          borderBottomWidth: 0,
          borderRightWidth: 1,
        }}
        borderColor="$borderColor"
      >
        <AgentBoard
          runs={runs}
          active={open ?? undefined}
          onOpen={setOpen}
          empty={
            <Text fontSize="$2" color="$soft">
              {loading ? 'Reading runs…' : 'No runs yet. Start one and it appears here.'}
            </Text>
          }
        />
      </YStack>
      {/*
        `minWidth={0}` is load-bearing. A flex child's default `min-width: auto`
        refuses to shrink below its content, so the pane kept its desktop width
        on a phone and the install cards' link row reached 546px inside a 390px
        viewport — off the side, and unreachable, because `overflow-x: clip` on
        body hides it rather than scrolling to it.
      */}
      {/* The pane takes what the board leaves — the rest of the column below
          $lg, the rest of the row above it. `minHeight: 0` is what lets a
          scrolling child inside it actually scroll instead of growing. */}
      <YStack width="100%" flex={1} minW={0} minH={0} $lg={{ width: 'auto' }}>
        {open ? <Watch key={open} id={open} /> : (idle ?? <Idle runs={runs.length} />)}
      </YStack>
    </YStack>
  )
}

/**
 * Nothing is open. What that MEANS depends on whether there is anything to
 * open: with runs on the board it is an instruction, and with none the pane is
 * the whole width (the board draws nothing) and the honest thing to show is the
 * home — the composer and what to do next.
 */
function Idle({ runs }: { runs: number }) {
  if (runs === 0) {
    return (
      <YStack flex={1} minH={0} overflowY="auto" overflowX="hidden">
        <YStack
          width="100%"
          maxW={640}
          mx="auto"
          px="$5"
          pt="$10"
          gap="$4"
        >
          <YStack gap="$2">
            <Text render="h1" fontSize="$7" fontWeight="500" color="$ink">
              Start a run
            </Text>
            <Text fontSize="$3" color="$soft" maxW={520}>
              Give an agent a task. Its plan, progress, and output will appear here.
            </Text>
          </YStack>
          <Start />
          <Text fontSize="$1" color="$soft">
            Runs stay visible in Working so you can inspect or steer them at any time.
          </Text>
        </YStack>
      </YStack>
    )
  }
  return (
    <YStack flex={1} items="center" justify="center" p="$6">
      <Text fontSize="$3" color="$soft">
        Pick a run to watch it work.
      </Text>
    </YStack>
  )
}

/**
 * One run: its steps on the left, whatever it produced on the right.
 *
 * KEYED BY THE RUN at the call site, so opening a different one REMOUNTS — the
 * live tail, the draft and the last confirmation all start empty rather than
 * carrying the previous run's.
 */
function Watch({ id }: { id: string }) {
  const ai = useAi()
  const { session } = useSession(id)
  const [live, setLive] = useState<SessionEvent[]>([])
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<string | null>(null)

  // The live feed, narrowed to this run's tree. There is no per-session stream
  // — `/v1/agents/sessions/{id}/stream` does not exist — so `root` is how one
  // run is watched, and it brings its sub-agents' turns with it.
  useEffect(() => {
    const stop = new AbortController()
    void (async () => {
      try {
        for await (const frame of ai.sessions.stream({ root: id }, { signal: stop.signal })) {
          if (stop.signal.aborted) return
          if (frame.kind === 'event') setLive((prev) => [...prev, frame.event])
        }
      } catch {
        // A dropped feed is ordinary. What is on screen stands.
      }
    })()
    return () => stop.abort()
  }, [ai, id])

  // The 50 the detail carries, then everything the feed added, deduped by seq —
  // the two overlap whenever a turn lands between the read and the subscribe.
  const events = useMemo(() => {
    const seen = new Map<string, SessionEvent>()
    for (const [i, e] of [...(session?.recentEvents ?? []), ...live].entries()) {
      seen.set(e.seq !== undefined ? `s${e.seq}` : (e.id ?? `i${i}`), e)
    }
    return [...seen.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  }, [session?.recentEvents, live])

  const { steps: shown, message } = useMemo(() => steps(events), [events])
  const status = STATUS(session?.status)
  const finished = status === 'done' || status === 'error'

  const steer = useCallback(
    async (command: Command) => {
      setNote(null)
      try {
        await ai.sessions.steer(id, command)
        setNote(`${command} queued — it takes effect between turns`)
      } catch {
        setNote(`Could not ${command} this run`)
      }
    },
    [ai, id],
  )

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setNote(null)
    try {
      await ai.sessions.steer(id, 'message', { message: text })
      setNote('Sent — the agent reads it between turns')
    } catch {
      setNote('Could not reach this run')
    }
  }, [ai, draft, id])

  return (
    <XStack flex={1} minH={0} flexWrap="wrap">
      <YStack flex={1} minH={0} minW={0}>
        <ChannelHeader name={session?.title || session?.agent || id} artifacts={0} />
        {/* How far, under the name. `Bar` draws nothing when the run says
            nothing, so this costs a row only once there is something to say —
            and it is the SAME bar the home and the chat draw. */}
        <XStack px="$4" pb="$2">
          <Bar run={session} />
        </XStack>
        <YStack flex={1} minH={0} overflowY="auto" overflowX="hidden" p="$4" gap="$4">
          <ProgressBlock steps={shown} done={finished}>
            {message ? (
              <Text fontSize="$4" color="$ink">
                {message}
              </Text>
            ) : null}
          </ProgressBlock>
        </YStack>
        <YStack p="$3" gap="$2" borderTopWidth={1} borderColor="$borderColor">
          <Steer
            onCommand={(c) => void steer(c)}
            withhold={finished ? ['pause', 'resume', 'stop'] : []}
            note={note}
          />
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            placeholder="Steer this run…"
            label="Steer this run"
          />
        </YStack>
      </YStack>

      {/* The reserved right pane. Its tabs are the three things a run produces;
          each is honest-empty until the run has actually produced one. */}
      <YStack
        width="100%"
        p="$3"
        borderTopWidth={1}
        $sm={{ width: 420, shrink: 0, borderTopWidth: 0, borderLeftWidth: 1 }}
        borderColor="$borderColor"
      >
        <Pane
          tabs={[
            { id: 'code', label: 'Code', kind: 'code', content: <Nothing what="changes" /> },
            { id: 'view', label: 'View', kind: 'view', content: <Nothing what="preview" /> },
            { id: 'canvas', label: 'Canvas', kind: 'canvas', content: <Nothing what="summary" /> },
          ]}
        />
      </YStack>
    </XStack>
  )
}

function Nothing({ what }: { what: string }) {
  return (
    <Text fontSize="$2" color="$soft">
      This run has produced no {what} yet.
    </Text>
  )
}

/**
 * The board, and the session its reads need.
 *
 * SPLIT so the hooks below never run for a reader with none: sessions and their
 * trees are the org's, answered 403 without a session, and a hook cannot be
 * called conditionally — so the condition is a component boundary rather than
 * an `if` the rules forbid.
 */
export function Work({ idle }: { idle?: ReactNode }) {
  const { user, isLoading } = useIam()
  if (isLoading || !user) {
    return (
      <YStack flex={1} items="center" justify="center" p="$6" gap="$2">
        <Text render="h1" fontSize="$5" fontWeight="600" color="$ink">
          Agents
        </Text>
        <Text fontSize="$3" color="$soft" text="center">
          {isLoading ? '\u00a0' : 'Sign in to watch your agents work.'}
        </Text>
      </YStack>
    )
  }
  return <Watching idle={idle} />
}
