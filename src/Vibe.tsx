'use client'

/**
 * /vibe — three columns: the runs started here, a frame pointed at whatever you
 * are building, and the org's people.
 *
 * WHAT IS DRAWN WAS READ, OR IT IS NOT DRAWN. This room shipped as a stage set.
 * It opened holding three members nobody had invited — one of them an
 * individual, named in full at a live domain — all stamped "online" by a
 * literal and counted in the header as "3 online". Under them sat two finished
 * agent runs attributed to those people, priced at $0.0485 and $0.0192 over
 * 146.0s and 32.1s, and three chat messages carrying a poll whose 3-to-1 tally
 * nobody had voted in. The address bar named a host on another org's domain
 * while the frame below it loaded /ocean, a path this site does not serve.
 * Every one of those was typed into the file.
 *
 * The reads that answer are IAM's people, the platform's agents and models, and
 * POST /v1/agents/coding. The chat column went entirely: nothing it displayed
 * came from anywhere, and nothing typed into it ever left the browser — a room
 * that only ever talked to itself. The preview column kept its frame and lost
 * its claims: it now shows the URL in the bar, which is the one thing about it
 * that was ever true.
 */

import { dev } from './lib/host'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRooms } from './host'
import {
  ArrowUp,
  Globe,
  Monitor,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tablet,
  UserPlus,
  Users,
} from 'lucide-react'
import { View, XStack, YStack, Text } from '@hanzo/gui'
import { Button, Picker } from '@hanzo/ui'
import { AiProvider, useAgents, useModels, usePeople } from '@hanzo/ai/react'
import { sku } from './lib/limits'
import { useIam, useOrganizations } from '@hanzo/iam/react'
import { hasSession } from './lib/session'
import { useHydrated } from './lib/hydrated'
import { ENSO, FREE, served, useAi } from './lib/ai'
import { TopOrgSelector } from './OrgSwitcher'
import { plainly, say } from './failure'
import { invite } from './lib/home'
import { startRun, type CodingRun } from './lib/coding'
import { Orgs } from './Orgs'

/** One prompt this room sent, and what the platform answered. Nothing else: a
 *  202 names a session, a branch and where it landed, and says no word about
 *  cost, wall time, files touched or lines changed. */
interface Turn {
  id: string
  time: string
  who: string
  prompt: string
  model: string
  run?: CodingRun
  /** The refusal in the platform's own words, when it refused. */
  refused?: string
}

const clock = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** The one grey line, so every empty state in this room is written the same. */
function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize={11} color="$soft" lineHeight={16}>
      {children}
    </Text>
  )
}

/**
 * The org's people and its agents.
 *
 * SPLIT OUT because `usePeople` needs an owner and a hook cannot be called
 * conditionally — the same reason Home keeps `Mates` apart from `Team`.
 *
 * NOBODY IS MARKED PRESENT. Nothing here subscribes to presence, so "online"
 * was a field set to the same string for everyone the moment the file loaded.
 * A directory can say who belongs to the org; it cannot say who is looking.
 */
function Members({ owner }: { owner: string }) {
  const { people, loading, error } = usePeople({ owner, service: false })
  const { agents, loading: counting, error: refused } = useAgents()
  const wrong = error ?? refused
  if (wrong) return <Quiet>{say(wrong, 'your team')}</Quiet>

  const rows = [
    ...people.map((p) => ({
      key: p.id,
      name: p.displayName || p.name,
      detail: p.email || '',
      // A ROLE IS A CLAIM IAM MAKES OR NOBODY DOES.
      role: p.admin ? 'Admin' : '',
      mark: (p.displayName || p.name || '?').charAt(0).toUpperCase(),
    })),
    ...agents.map((a) => ({
      key: a.id,
      name: a.name,
      detail: a.model || '',
      role: 'Agent',
      mark: a.emoji || a.name.charAt(0).toUpperCase(),
    })),
  ]

  if (rows.length === 0)
    return <Quiet>{loading || counting ? 'Reading.' : 'Nobody in this org yet.'}</Quiet>

  return (
    <YStack gap="$1.5">
      {rows.map((r) => (
        <XStack
          key={r.key}
          items="center"
          justify="space-between"
          p="$2"
          rounded={8}
          bg="$panel"
        >
          <XStack items="center" gap="$2.5" flex={1} overflow="hidden">
            <View
              width={24}
              height={24}
              rounded={12}
              bg="$raised"
              items="center"
              justify="center"
              shrink={0}
            >
              <Text fontSize={10} fontWeight="700" color="$ink">
                {r.mark}
              </Text>
            </View>
            <YStack flex={1} overflow="hidden">
              <Text fontSize={12} fontWeight="600" color="$ink" numberOfLines={1}>
                {r.name}
              </Text>
              {r.detail ? (
                <Text fontSize={10} color="$soft" numberOfLines={1}>
                  {r.detail}
                </Text>
              ) : null}
            </YStack>
          </XStack>
          {r.role ? (
            <View
              px={6}
              py={2}
              rounded={4}
              bg="$hover"
            >
              <Text fontSize={10} color="$soft">
                {r.role}
              </Text>
            </View>
          ) : null}
        </XStack>
      ))}
    </YStack>
  )
}

/**
 * The session is asked FIRST, because it is the state that never resolves — a
 * reader nobody will answer would sit on "Reading." until they closed the tab.
 *
 * `useHydrated` keeps the server's render and the first client one agreeing:
 * `useOrganizations` resolves synchronously in the browser and never on the
 * server, and React answers a text mismatch by throwing the tree away.
 */
function Team() {
  const hydrated = useHydrated()
  const { isAuthenticated } = useIam()
  const signedIn = isAuthenticated || hasSession()
  const { currentOrgId } = useOrganizations() || {}
  if (!hydrated) return <Quiet>&nbsp;</Quiet>
  if (!signedIn) return <Quiet>Sign in to see who is in this workspace.</Quiet>
  if (!currentOrgId) return <Quiet>Reading.</Quiet>
  return <Members owner={currentOrgId} />
}

/**
 * THIS ROOM MOUNTS ITS OWN CLIENT.
 *
 * Every other room on this site arrives under `Room` → `Workspace`, which
 * supplies the `AiProvider` for the whole shell. `/vibe` is routed straight to
 * this component, so nothing above it does — and the moment anything here reads
 * the platform, `useAi` raises and the route answers 500. The provider prefers
 * the `client` prop over the one it builds itself, so a session that settles
 * after mount reaches the hooks below; signed out, its own anonymous client
 * stands in and the org-scoped reads simply answer nothing.
 *
 * The reading half is a separate component because a hook cannot run in the
 * component that mounts its provider.
 */
function VibeWorkspaceInner() {
  const { client } = useAi()
  return (
    <AiProvider client={client ?? undefined}>
      <Vibe />
    </AiProvider>
  )
}

function Vibe() {
  const { Link } = useRooms()
  const { user } = useIam()
  // Hanzo models alone, as every picker here offers them (`sku`).
  const { models: listed } = useModels()
  const models = useMemo(() => listed.filter((m) => sku(m.id)), [listed])

  const [activeTabMobile, setActiveTabMobile] = useState<'stream' | 'preview' | 'team'>('stream')

  // The frame shows what the bar says. It starts empty because a run publishes
  // no URL — the 202 names a session, not an address — so this room has nothing
  // to point at until somebody points it.
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [previewKey, setPreviewKey] = useState(0)

  const [agentInput, setAgentInput] = useState('')
  // The house name for the lane, resolved against what the gateway serves —
  // `served` falls to a model that answers rather than sending one nobody has.
  const [wanted, setWanted] = useState(user ? ENSO : FREE)
  const model = served(models, wanted)
  const [busy, setBusy] = useState(false)

  const [turns, setTurns] = useState<Turn[]>([])
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  const who = user?.displayName || user?.name || user?.email || 'You'

  /**
   * SEND THE PROMPT, AND SAY WHAT CAME BACK.
   *
   * `repo` is no longer sent. It carried the room's name — which defaulted to
   * `ocean-genesis-room` and was editable free text — into a field the contract
   * defines as `owner/name` in the caller's own org, so a label typed in a
   * header reached a real write as a repository. Omitting it is what the
   * contract means by optional: the server picks the default.
   */
  const send = () => {
    const task = agentInput.trim()
    if (!task || busy) return
    const id = `t${Date.now()}`
    setAgentInput('')
    setBusy(true)
    setTurns((prev) => [...prev, { id, time: clock(), who, prompt: task, model }])
    startRun({ prompt: task, model })
      .then((run) => setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, run } : t))))
      .catch((e: unknown) =>
        setTurns((prev) =>
          prev.map((t) => (t.id === id ? { ...t, refused: plainly(e, 'this run') } : t)),
        ),
      )
      .finally(() => setBusy(false))
  }

  return (
    <YStack
      data-vibe
      flex={1}
      minH={0}
      height="100vh"
      width="100%"
      maxW="100%"
      overflowX="auto"
      overflowY="hidden"
      bg="$background"
      pb={56}
    >
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <XStack
        height={52}
        items="center"
        justify="space-between"
        px="$3.5"
        borderBottomWidth={1}
        borderColor="$borderColor"
        bg="$background"
        z={30}
        shrink={0}
      >
        {/* WHERE YOU ARE IS IAM'S ANSWER. The editable room name that stood here
            named nothing on any server: it defaulted to `ocean-genesis-room`,
            was local to the tab, and was the string sent as `repo`. */}
        <XStack items="center" gap="$2.5">
          <TopOrgSelector />

          <XStack
            display="none"
            $md={{ display: 'flex' }}
            items="center"
            gap="$2"
            py={4}
            px={10}
            rounded={20}
            bg="$panel"
            borderWidth={1}
            borderColor="$borderColor"
          >
            {/* The one honest light in this room: whether a start is in flight.
                It used to name an agent ("Blue is working…") the platform never
                names, beside a Stop that only reset this pill — the run it
                claimed to stop went on running. Live is the state hue; idle is
                the quiet rung, because nothing is happening. */}
            <View width={7} height={7} rounded={4} bg={busy ? 'var(--state-online)' : '$faint'} />
            <Text fontSize={11} color="$quiet" fontWeight="500">
              {busy ? 'Starting a run' : 'Idle'}
            </Text>
          </XStack>
        </XStack>

        <XStack items="center" gap="$2">
          <XStack
            $md={{ display: 'none' }}
            bg="$panel"
            rounded={8}
            p={2}
            gap={2}
            borderWidth={1}
            borderColor="$borderColor"
          >
            {(['stream', 'preview', 'team'] as const).map((tab) => (
              <Button
                key={tab}
                size="sm"
                px="$2"
                variant={activeTabMobile === tab ? 'secondary' : 'ghost'}
                color={activeTabMobile === tab ? '$ink' : '$soft'}
                aria-pressed={activeTabMobile === tab}
                onClick={() => setActiveTabMobile(tab)}
              >
                {tab === 'stream' ? 'Stream' : tab === 'preview' ? 'Preview' : 'Team'}
              </Button>
            ))}
          </XStack>

          {/* INVITING IS IAM'S PAGE. The modal here took an email address, made
              a member out of the part before the @, marked them online and sent
              nothing anywhere. */}
          <Button asChild variant="primary" size="sm">
            <Link href={invite()}>
              <UserPlus size={13} />
              Invite
            </Link>
          </Button>
        </XStack>
      </XStack>

      {/* ── Three columns ─────────────────────────────────────────────────────
          A laptop shows all three, a tablet the runs and the frame, a phone the
          one its tabs chose. */}
      <View
        flex={1}
        minH={0}
        width="100%"
        height="100%"
        overflow="hidden"
        display="grid"
        gridTemplateRows="100%"
        gridTemplateColumns="100%"
        $md={{ gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)' }}
        $lg={{ gridTemplateColumns: 'minmax(340px, 400px) minmax(360px, 1fr) minmax(300px, 340px)' }}
        $xl={{ gridTemplateColumns: 'minmax(380px, 440px) minmax(480px, 1fr) minmax(340px, 380px)' }}
      >
        {/* ── 1: the runs started here ────────────────────────────────────── */}
        <YStack
          height="100%"
          borderRightWidth={1}
          borderColor="$borderColor"
          bg="$background"
          minW={0}
          display={activeTabMobile === 'stream' ? 'flex' : 'none'}
          $md={{ display: 'flex' }}
        >
          <XStack
            height={42}
            items="center"
            gap="$2"
            px="$3.5"
            borderBottomWidth={1}
            borderColor="$borderColor"
            bg="$background"
          >
            <Sparkles size={14} color="var(--foreground)" />
            <Text fontSize={12} fontWeight="600" color="$ink">
              Runs
            </Text>
            {turns.length > 0 && (
              <View px={6} py={2} rounded={4} bg="$hover">
                <Text fontSize={10} color="$soft">
                  {turns.length}
                </Text>
              </View>
            )}
          </XStack>

          <YStack flex={1} overflow="scroll" p="$3.5" gap="$4">
            {turns.length === 0 ? (
              <Quiet>
                Nothing has been sent from this room yet. Describe a task below and the run it
                opens appears here.
              </Quiet>
            ) : null}

            {turns.map((turn) => (
              <YStack key={turn.id} gap="$2.5">
                <XStack gap="$2.5">
                  <View
                    width={24}
                    height={24}
                    rounded={12}
                    bg="$raised"
                    items="center"
                    justify="center"
                    shrink={0}
                  >
                    <Text fontSize={10} fontWeight="700" color="$ink">
                      {turn.who.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <YStack flex={1} gap="$1">
                    <XStack items="center" gap="$2">
                      <Text fontSize={12} fontWeight="700" color="$ink">
                        {turn.who}
                      </Text>
                      <Text fontSize={11} color="$soft">
                        {turn.time}
                      </Text>
                      <View
                        px={5}
                        py={1}
                        rounded={4}
                        bg="$hover"
                      >
                        <Text fontSize={10} color="$soft" fontFamily="$mono">
                          {turn.model}
                        </Text>
                      </View>
                    </XStack>
                    <Text fontSize={12} color="$quiet" lineHeight={18}>
                      {turn.prompt}
                    </Text>
                  </YStack>
                </XStack>

                {/* WHAT THE PLATFORM ANSWERED, and only that. The card that
                    stood here drew invented Bash/Write/Edit steps with
                    durations, then a telemetry row costing the turn in dollars.
                    A 202 carries a session id, a branch, and whether a claimed
                    machine took it. */}
                <YStack ml="$4" gap="$1.5">
                  {turn.refused ? (
                    <Text fontSize={11} color="$ink" lineHeight={16}>
                      {turn.refused}
                    </Text>
                  ) : !turn.run ? (
                    <Quiet>Starting.</Quiet>
                  ) : (
                    <YStack
                      p="$2"
                      rounded={8}
                      bg="$panel"
                      borderWidth={1}
                      borderColor="$borderColor"
                      gap="$1"
                    >
                      <Text fontSize={11} color="$quiet" fontFamily="$mono">
                        {turn.run.sessionId}
                      </Text>
                      <Text fontSize={11} color="$soft">
                        {turn.run.routed
                          ? `Running on ${turn.run.targetId}`
                          : 'Running in a sandbox'}
                        {turn.run.branch ? ` · ${turn.run.branch}` : ''}
                      </Text>
                      {/* The run is watched where runs are watched: the builder at
                          /dev?run=<session>, rather than a second copy of it
                          drawn here. */}
                      <Text render={<Link href={dev(turn.run.sessionId)} />} color="$ink" fontSize="$1">
                        Watch it work
                      </Text>
                    </YStack>
                  )}
                </YStack>
              </YStack>
            ))}
            <div ref={bottom} />
          </YStack>

          {/* Composer */}
          <YStack
            p="$3"
            borderTopWidth={1}
            borderColor="$borderColor"
            bg="$background"
            gap="$2"
          >
            <XStack items="center" justify="space-between" gap="$2">
              {/* THE MODELS THE GATEWAY SERVES. The select here offered four
                  typed names — "ZenLM 3 — Fast & Capable", "GPT-4o Omnimodal" —
                  and a second one offering three reasoning efforts, neither of
                  which was ever read when the prompt was sent. */}
              <Picker value={model} onChange={(e) => setWanted(e.target.value)} aria-label="Model" maxW={200}>
                {models.length === 0 ? <option value={model}>{model}</option> : null}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </Picker>
              <Text fontSize={10} color="$faint">
                Press Enter to send
              </Text>
            </XStack>

            <YStack
              bg="$panel"
              borderWidth={1}
              borderColor="var(--border-control)"
              rounded={12}
              overflow="hidden"
            >
              <Text
                render={
                  <textarea
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                    placeholder="Describe a task and an agent starts on it…"
                    rows={2}
                    disabled={busy}
                  />
                }
                // design's base sheet makes every textarea resizable; gui types no `resize`.
                $platform-web={{ resize: 'none' }}
                width="100%"
                bg="transparent"
                px={12}
                py={10}
                color="$ink"
                fontSize="$2"
                outlineStyle="none"
                borderWidth={0}
              />
              <XStack
                items="center"
                justify="flex-end"
                px="$2.5"
                pb="$2"
              >
                <Button variant="primary" size="sm" onClick={send} disabled={!agentInput.trim() || busy}>
                  Send
                  <ArrowUp size={13} />
                </Button>
              </XStack>
            </YStack>
          </YStack>
        </YStack>

        {/* ── 2: the frame ────────────────────────────────────────────────── */}
        <YStack
          height="100%"
          borderRightWidth={1}
          borderColor="$borderColor"
          bg="$background"
          minW={0}
          display={activeTabMobile === 'preview' ? 'flex' : 'none'}
          $md={{ display: 'flex' }}
        >
          <XStack
            height={42}
            items="center"
            justify="space-between"
            gap="$2"
            px="$3"
            borderBottomWidth={1}
            borderColor="$borderColor"
            bg="$background"
          >
            <XStack
              items="center"
              gap="$2"
              flex={1}
              maxW={420}
              bg="$panel"
              rounded={6}
              px="$2.5"
              py={3}
              borderWidth={1}
              borderColor="var(--border-control)"
            >
              <Globe size={13} color="var(--muted-foreground)" />
              <Text
                render={<input type="text" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://…" />}
                flex={1}
                bg="transparent"
                borderWidth={0}
                color="$ink"
                fontSize="$1"
                fontFamily="$mono"
                outlineStyle="none"
              />
            </XStack>

            <XStack items="center" gap="$2">
              {/* The "Updated" badge is gone with the fabrications behind it: it
                  was initialised true and re-set true after every start, so it
                  announced that a frame nobody had loaded held new work. */}
              <XStack
                items="center"
                gap={2}
                bg="$panel"
                rounded={6}
                p={2}
                borderWidth={1}
                borderColor="$borderColor"
              >
                {([
                  ['desktop', 'Desktop', Monitor],
                  ['tablet', 'Tablet', Tablet],
                  ['mobile', 'Mobile', Smartphone],
                ] as const).map(([device, label, Glyph]) => (
                  <Button
                    key={device}
                    variant={previewDevice === device ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    aria-label={label}
                    title={label}
                    aria-pressed={previewDevice === device}
                    onClick={() => setPreviewDevice(device)}
                  >
                    <Glyph size={12} color={previewDevice === device ? 'var(--foreground)' : 'var(--muted-foreground)'} />
                  </Button>
                ))}
              </XStack>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Reload preview"
                title="Reload preview"
                onClick={() => setPreviewKey((k) => k + 1)}
              >
                <RefreshCw size={12} color="var(--muted-foreground)" />
              </Button>
            </XStack>
          </XStack>

          <YStack
            flex={1}
            items="center"
            justify="center"
            bg="$background"
            p="$2"
          >
            {previewUrl.trim() === '' ? (
              <Quiet>Nothing to show. Put the address of what you are building in the bar.</Quiet>
            ) : (
              <View
                key={previewKey}
                width={
                  previewDevice === 'desktop' ? '100%' : previewDevice === 'tablet' ? 768 : 375
                }
                maxW="100%"
                height="100%"
                bg="$background"
                rounded={previewDevice === 'desktop' ? 0 : 8}
                overflow="hidden"
                borderWidth={previewDevice === 'desktop' ? 0 : 1}
                borderColor="var(--border-control)"
                boxShadow="var(--shadow-lg)"
              >
                {/* SANDBOXED, AND WITHOUT `allow-top-navigation` — the same
                    policy Build.tsx's `Framed` states, and for the same reason:
                    `previewUrl` is an address the reader typed, so this frames
                    an arbitrary origin. Build.tsx records what the omission
                    costs — a bare frame there called `top.location.href` and
                    took the whole tab off hanzo.ai. This frame carried no
                    `sandbox` at all. */}
                <View
                  render={<iframe src={previewUrl} sandbox="allow-scripts allow-forms allow-popups allow-same-origin" title="Preview" />}
                  width="100%"
                  height="100%"
                  borderWidth={0}
                />
              </View>
            )}
          </YStack>
        </YStack>

        {/* ── 3: who is in this org ───────────────────────────────────────── */}
        <YStack
          height="100%"
          bg="$background"
          minW={0}
          display={activeTabMobile === 'team' ? 'flex' : 'none'}
          $md={{ display: 'none' }}
          $lg={{ display: 'flex' }}
        >
          <XStack
            height={42}
            items="center"
            gap="$2"
            px="$3"
            borderBottomWidth={1}
            borderColor="$borderColor"
            bg="$background"
          >
            <Users size={14} color="var(--foreground)" />
            <Text fontSize={12} fontWeight="600" color="$ink">
              People
            </Text>
          </XStack>

          <YStack flex={1} overflow="scroll" p="$3" gap="$3">
            <Team />
          </YStack>
        </YStack>
      </View>
    </YStack>
  )
}

// THE GATE IS NOT A ROOM'S TO REMEMBER. This room draws its own shell rather
// than `Room`, which is where every other room picks the organization gate up —
// so it was reachable, and usable, by an account that had never paid. Wrapping
// the export means the route cannot mount the room without it.
export function VibeWorkspace() {
  return (
    <Orgs>
      <VibeWorkspaceInner />
    </Orgs>
  )
}
