'use client'

// WHAT ONE BOT HAS.
//
// A Bot is a worker, and a worker owns things. The platform holds each one
// somewhere, and this pane is one section per thing:
//
//   its MACHINE   `computeRef`, an id from /v1/agents/targets
//   its COMPUTER  a sandbox leased on the project `bot-<name>`, which is this
//                 Bot's disk: a volume is named per (org, project) and the name
//                 is deterministic, so the same disk comes back after a lease ends
//   its TOOLS     `tools[]` — the names this Bot may call, out of the platform's
//                 own MCP surface plus whatever the org has registered
//   its CHANNELS  the rooms it answers, from /v1/channels/agent
//   its CODE      an autonomous run against one of the org's repos
//   its SECRETS   the KMS names under `bots/<name>`
//
// ONE THING A READER WILL LOOK FOR IS NOT THE BOT'S: a connector is held by the
// PERSON who signed in to it, and the contract publishes no route binding one to
// an agent. It is listed as what it is, with no switch to press.
//
// The screen and the terminal are real or they are absent. Each is a URL the
// platform mints against a sandbox that exists; where there is no sandbox there
// is no window, and where the mint is refused the refusal is what is drawn.

import { useCallback, useEffect, useState } from 'react'
import { Play, Square, X } from 'lucide-react'
import type { Agent, Channel, McpServer, Machine as Target, Ran, Sandbox, Tool } from '@hanzo/ai'
import { useOrganizations } from '@hanzo/iam/react'
import { useAi } from '../lib/ai'
import { say } from '../failure'
import { Input, Text, XStack, YStack } from '@hanzo/gui'
import { Picker } from '@hanzo/ui'
import { DIM, FAINT, GROUND, INK, LINE } from './ink'
import { BOXED, LABEL, OUT, PICK, TAB } from './kit'
import {
  type Connector,
  type McpTool,
  type Project,
  type Secret,
  answer,
  answering,
  call,
  connectors as readConnectors,
  disk,
  grant,
  projects as readProjects,
  secrets as readSecrets,
  tools as readTools,
  vault,
  workOn,
} from './api'

export function Runtime({ bot }: { bot: Agent }) {
  const { client } = useAi()
  const { currentOrg } = useOrganizations()
  const org = currentOrg?.displayName || currentOrg?.name || ''
  const project = disk(bot.name)

  const [machines, setMachines] = useState<Target[]>([])
  const [boxes, setBoxes] = useState<Sandbox[]>([])
  const [servers, setServers] = useState<McpServer[]>([])
  const [skills, setSkills] = useState<Tool[]>([])
  const [activated, setActivated] = useState<string[]>([])
  const [published, setPublished] = useState<McpTool[]>([])
  const [links, setLinks] = useState<Connector[]>([])
  const [rooms, setRooms] = useState<Channel[]>([])
  const [keys, setKeys] = useState<Secret[]>([])
  const [repos, setRepos] = useState<Project[]>([])
  const [why, setWhy] = useState<Record<string, string>>({})

  const blame = useCallback((k: string, e: unknown, subject: string) => {
    setWhy((w) => ({ ...w, [k]: say(e, subject) }))
  }, [])

  const survey = useCallback(async () => {
    if (!client) return
    await Promise.all([
      client.machines.list().then(setMachines).catch((e) => blame('machine', e, 'this org’s machines')),
      client.sandboxes.list({ project }).then(setBoxes).catch((e) => blame('box', e, 'this bot’s computer')),
      client.tools.mcp().then(setServers).catch((e) => blame('mcp', e, 'this org’s MCP servers')),
      client.tools.skills().then((s) => setSkills(s.tools ?? [])).catch((e) => blame('skill', e, 'this org’s skills')),
      client.tools.activation().then((a) => setActivated(a.enabled ?? [])).catch(() => setActivated([])),
      readTools(client).then(setPublished).catch((e) => blame('served', e, 'the platform’s tools')),
      readConnectors(client).then(setLinks).catch((e) => blame('link', e, 'your connectors')),
      client.channels.list().then(setRooms).catch((e) => blame('room', e, 'this org’s channels')),
      readSecrets(client, vault(bot.name)).then(setKeys).catch((e) => blame('key', e, 'this bot’s secrets')),
      readProjects(client).then(setRepos).catch((e) => blame('repo', e, 'this org’s repos')),
    ])
  }, [client, project, bot.name, blame])

  useEffect(() => {
    void survey()
  }, [survey])

  return (
    <YStack
      render="aside"
      aria-label={`${bot.name} runtime`}
      data-hz="runtime-pane"
      width={360}
      shrink={0}
      overflowY="auto"
      borderLeftWidth={1}
      borderColor={LINE}
      bg={GROUND}
    >
      {/* WHOSE. Every read below is answered for the token this browser holds,
          so the org named here is the only one any of it can be about. */}
      <Part title="Runtime">
        <Line>
          {bot.name} runs for <Text color={INK}>{org || 'your org'}</Text>
          {bot.serviceAccountId ? ` as ${bot.serviceAccountId}` : ''}. Nothing on this panel
          crosses into another org.
        </Line>
        {bot.schedule ? (
          <Line>
            Wakes on <Text color={INK}>{bot.schedule}</Text>
            {bot.executionMode ? ` (${bot.executionMode})` : ''}.
          </Line>
        ) : null}
      </Part>
      <Machine bot={bot} machines={machines} why={why.machine} />
      <Computer bot={bot} box={boxes[0] ?? null} project={project} why={why.box} onChange={survey} />
      <Tools
        bot={bot}
        servers={servers}
        skills={skills}
        published={published}
        activated={activated}
        why={why.served ?? why.mcp ?? why.skill}
      />
      <Channels bot={bot} rooms={rooms} why={why.room} />
      <Code bot={bot} repos={repos} why={why.repo} />
      <Secrets bot={bot} keys={keys} why={why.key} />
      <Held links={links} why={why.link} />
    </YStack>
  )
}

/** The machine this Bot runs on. The list is the org's; the binding is the Bot's. */
function Machine({ bot, machines, why }: { bot: Agent; machines: Target[]; why?: string }) {
  const { client } = useAi()
  const [bound, setBound] = useState(bot.computeRef ?? '')
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => setBound(bot.computeRef ?? ''), [bot.computeRef])

  return (
    <Part title="Machine">
      {why ? <Line>{why}</Line> : null}
      {!why && machines.length === 0 ? (
        <Line>No machine is registered to this org, so this bot runs wherever the platform places it.</Line>
      ) : null}
      {machines.length > 0 ? (
        <Picker
          {...PICK}
          value={bound}
          aria-label="Machine"
          onChange={async (e) => {
            const id = e.target.value
            setBound(id)
            if (!client) return
            try {
              await client.agents.update(bot.name, { computeRef: id })
              setFailed(null)
            } catch (err) {
              setFailed(say(err, 'this bot', 'save'))
            }
          }}
        >
          <option value="">Unbound</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || m.host || m.id}
              {m.status ? ` — ${m.status}` : ''}
            </option>
          ))}
        </Picker>
      ) : null}
      {failed ? <Line>{failed}</Line> : null}
    </Part>
  )
}

/**
 * This Bot's computer.
 *
 * A `desktop` lease has a screen and every lease has a terminal; both are opened
 * through a ticket the platform mints against THIS sandbox, and the iframe points
 * at the URL that came back. There is no other source for either window.
 *
 * MEASURED 2026-09-07: every class of lease is refused by the fleet —
 * `exec` and `desktop` with "pod … not running after 2m0s", `dev` with
 * "admin credentials: DO_API_TOKEN not configured" — and `/v1/exec`, the other
 * door onto the same pool, answers the first of those. So the terminal, the
 * screen and running code are all one outage, and the refusal is the whole of
 * what this section can honestly show until the pool comes back.
 */
function Computer({
  bot,
  box,
  project,
  why,
  onChange,
}: {
  bot: Agent
  box: Sandbox | null
  project: string
  why?: string
  onChange: () => void | Promise<void>
}) {
  const { client } = useAi()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [command, setCommand] = useState('')
  const [ran, setRan] = useState<Ran | null>(null)
  const [window, setWindow] = useState<{ kind: 'terminal' | 'screen'; url: string } | null>(null)

  const attempt = useCallback(
    async (what: string, act: () => Promise<unknown>) => {
      if (!client || busy) return
      setBusy(true)
      setFailed(null)
      try {
        await act()
      } catch (e) {
        // The fleet's own words. A sandbox that will not start is the reader's
        // situation and only the fleet knows why, so it is not translated away.
        setFailed(`${what}: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setBusy(false)
      }
    },
    [client, busy],
  )

  const open = (kind: 'terminal' | 'screen') =>
    attempt(`Could not open the ${kind}`, async () => {
      if (!client || !box) return
      const g = await grant(client, box.id, kind)
      if (!g.url) throw new Error('the platform minted no address')
      setWindow({ kind, url: g.url })
    })

  return (
    <Part title="Computer">
      <Line>
        Its own disk, <Text render="code" fontSize="$1" color={INK}>{project}</Text>. A lease on this project finds the same
        disk every time, so what this bot writes outlives the lease.
      </Line>

      {why ? <Line>{why}</Line> : null}

      {box ? (
        <>
          <Row>
            <Text fontSize="$2" color={INK} data-hz="box">
              {box.class ?? 'sandbox'} · {box.status ?? 'unknown'}
            </Text>
            <Text fontSize="$1" color={FAINT}>{box.id.slice(0, 14)}</Text>
          </Row>
          {/* A LEASE IS NOT A COMPUTER. The record appears the moment one is
              asked for and its status is `pending` until the fleet places the
              pod; only `running` can serve a terminal, a screen or a command.
              Measured: a lease answers 503 after two minutes and leaves a
              pending row behind, so drawing its controls would put a Terminal
              on a box that will never open one. */}
          {box.status === 'pending' ? (
            <Line>Waiting for the fleet to place it. Nothing can be opened on it until it is running.</Line>
          ) : null}
          {box.status === 'error' ? <Line>{box.error || 'The fleet could not start it.'}</Line> : null}
          <XStack gap={6} flexWrap="wrap">
            {box.status === 'running' ? (
              <Text {...TAB} onClick={() => open('terminal')} disabled={busy}>
                Terminal
              </Text>
            ) : null}
            {box.status === 'running' && box.class === 'desktop' ? (
              <Text {...TAB} onClick={() => open('screen')} disabled={busy}>
                Screen
              </Text>
            ) : null}
            <Text
              {...TAB}
              disabled={busy}
              onClick={() =>
                attempt('Could not stop it', async () => {
                  await client!.sandboxes.stop({ id: box.id })
                })
              }
            >
              <Square size={11} aria-hidden />
              Stop
            </Text>
            <Text
              {...TAB}
              disabled={busy}
              onClick={() =>
                attempt('Could not end the lease', async () => {
                  await client!.sandboxes.end({ id: box.id })
                  setWindow(null)
                  await onChange()
                })
              }
            >
              <X size={11} aria-hidden />
              End
            </Text>
          </XStack>

          {window ? (
            <YStack
              render="iframe"
              {...{ src: window.url, title: `${bot.name} ${window.kind}` }}
              width="100%"
              height={240}
              borderWidth={1}
              borderColor={LINE}
              rounded={8}
              bg={GROUND}
            />
          ) : null}

          <XStack
            render="form"
            {...{
              onSubmit: (e: React.FormEvent) => {
                e.preventDefault()
                void attempt('Could not run it', async () => {
                  setRan(await client!.sandboxes.run({ id: box.id, command }))
                })
              },
            }}
            display={box.status === 'running' ? 'flex' : 'none'}
            gap={6}
          >
            <Input
              {...BOXED}
              flex={1}
              minW={0}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Command"
              aria-label="Command to run in this bot's computer"
            />
            <Text {...TAB} {...{ type: 'submit' }} disabled={busy || !command.trim()}>
              <Play size={11} aria-hidden />
              Run
            </Text>
          </XStack>

          {ran ? (
            <Text {...OUT}>
              {(ran.stdout ?? '') + (ran.stderr ?? '')}
              {`\nexit ${ran.exitCode ?? 0}`}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Line>
            No computer is leased. A lease is what a terminal, a screen and a command all hang off,
            so until one starts there is nothing here to open.
          </Line>
          <XStack gap={6} flexWrap="wrap">
            <Text
              {...TAB}
              data-hz="lease"
              disabled={busy}
              onClick={() =>
                attempt('Could not lease a computer', async () => {
                  await client!.sandboxes.lease({ class: 'dev', project })
                  await onChange()
                })
              }
            >
              {busy ? 'Leasing…' : 'Lease a computer'}
            </Text>
            <Text
              {...TAB}
              data-hz="lease-desktop"
              disabled={busy}
              onClick={() =>
                attempt('Could not lease a screen', async () => {
                  await client!.sandboxes.lease({ class: 'desktop', project })
                  await onChange()
                })
              }
            >
              {busy ? 'Leasing…' : 'Lease a screen'}
            </Text>
          </XStack>
        </>
      )}

      {failed ? <Line data-hz="computer-failed">{failed}</Line> : null}
    </Part>
  )
}

/**
 * What this Bot may call, and calling one.
 *
 * `tools[]` on the agent record is the Bot's OWN permission set, and it is a
 * PATCH to this Bot and nothing else — another Bot in the same org keeps its
 * own list. The names come from three places, and they are three because the
 * platform keeps them in three:
 *
 *   PLATFORM   `/v1/mcp` tools/list — every subsystem's operations, projected.
 *              116 for a signed-in caller, with 127 more refused by a stated
 *              rule the endpoint publishes. This is the set that can be CALLED.
 *   MCP        the org's own registered servers, `/v1/tools/mcp/servers`.
 *   SKILL      the org's authored skills, `/v1/tools/skills`.
 *
 * A name from the last two is dispatchable only once the org ACTIVATES it —
 * `/v1/tools/call` answers 404 "unknown tool" for everything outside the
 * activated set — so an inactive one is labelled rather than drawn as ready.
 *
 * The call below runs against this Bot's granted set and nothing wider, which
 * is what makes the grant mean something on this screen rather than only in
 * the record.
 */
function Tools({
  bot,
  servers,
  skills,
  published,
  activated,
  why,
}: {
  bot: Agent
  servers: McpServer[]
  skills: Tool[]
  published: McpTool[]
  activated: string[]
  why?: string
}) {
  const { client } = useAi()
  const [held, setHeld] = useState<string[]>(bot.tools ?? [])
  const [failed, setFailed] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const [op, setOp] = useState('')
  const [ran, setRan] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setHeld(bot.tools ?? []), [bot.tools, bot.name])
  useEffect(() => setPick((p) => (held.includes(p) ? p : (held[0] ?? ''))), [held])

  const offered = [
    ...published.map((t) => ({ name: t.name, from: 'platform', ready: true })),
    ...servers.map((s) => ({ name: s.name || s.id, from: 'MCP', ready: activated.includes(s.name || s.id) })),
    ...skills.map((s) => ({ name: s.name, from: 'skill', ready: activated.includes(s.name) })),
  ]

  const flip = async (name: string) => {
    const next = held.includes(name) ? held.filter((t) => t !== name) : [...held, name]
    setHeld(next)
    if (!client) return
    try {
      await client.agents.update(bot.name, { tools: next })
      setFailed(null)
    } catch (e) {
      setFailed(say(e, 'this bot', 'save'))
    }
  }

  return (
    <Part title="Tools">
      {why ? <Line>{why}</Line> : null}
      {offered.length === 0 && !why ? (
        <Line>Nothing publishes a tool for this org yet, so there is nothing to grant.</Line>
      ) : null}

      <YStack data-hz="tools" maxH={200} overflowY="auto" gap={4}>
        {offered.map((t) => (
          <XStack render="label" key={`${t.from}-${t.name}`} items="center" justify="space-between" gap={8} cursor="pointer">
            <input type="checkbox" checked={held.includes(t.name)} onChange={() => flip(t.name)} aria-label={t.name} />
            <Text flex={1} fontSize="$2" color={INK}>{t.name}</Text>
            <Text fontSize="$1" color={FAINT}>{t.ready ? t.from : `${t.from} · not activated`}</Text>
          </XStack>
        ))}
      </YStack>

      {held.length > 0 ? (
        <YStack
          render="form"
          {...{
            onSubmit: async (e: React.FormEvent) => {
              e.preventDefault()
              if (!client || busy || !pick || !op.trim()) return
              setBusy(true)
              try {
                setRan(await call(client, pick, op.trim()))
              } catch (err) {
                setRan(err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            },
          }}
          gap={6}
        >
          <Picker {...PICK} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Tool to call">
            {held.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Picker>
          <XStack gap={6}>
            <Input
              {...BOXED}
              flex={1}
              minW={0}
              data-hz="op"
              value={op}
              onChange={(e) => setOp(e.target.value)}
              placeholder="Operation"
              aria-label="Operation to run"
            />
            <Text {...TAB} {...{ type: 'submit' }} data-hz="call" disabled={busy || !op.trim()}>
              {busy ? 'Calling…' : 'Call'}
            </Text>
          </XStack>
        </YStack>
      ) : null}

      {ran ? <Text {...OUT} data-hz="called">{ran}</Text> : null}
      {failed ? <Line>{failed}</Line> : null}
    </Part>
  )
}

/**
 * The rooms this Bot answers.
 *
 * `/v1/channels/agent` binds ONE agent per channel as the org's default
 * answerer, so this is a per-Bot binding and not an account-wide list: pressing
 * Answer here moves that channel from whichever bot holds it to this one.
 */
function Channels({ bot, rooms, why }: { bot: Agent; rooms: Channel[]; why?: string }) {
  const { client } = useAi()
  const [bound, setBound] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<string | null>(null)

  const read = useCallback(async () => {
    if (!client) return
    const pairs = await Promise.all(
      rooms.map(async (r) => {
        try {
          return [r.id, (await answering(client, r.id)).default ?? ''] as const
        } catch {
          return [r.id, ''] as const
        }
      }),
    )
    setBound(Object.fromEntries(pairs))
  }, [client, rooms])

  useEffect(() => {
    void read()
  }, [read])

  return (
    <Part title="Channels">
      {why ? <Line>{why}</Line> : null}
      {rooms.length === 0 && !why ? <Line>This org has no channels.</Line> : null}
      {rooms.map((r) => {
        const mine = bound[r.id] === bot.name
        return (
          <Row key={r.id}>
            <Text fontSize="$2" color={INK}>{r.id}</Text>
            <XStack items="center" gap={8}>
              <Text fontSize="$1" color={FAINT}>
                {r.connected ? bound[r.id] || 'unbound' : 'not connected'}
              </Text>
              <Text
                {...TAB}
                opacity={mine ? 0.5 : 1}
                disabled={mine}
                onClick={async () => {
                  if (!client) return
                  try {
                    await answer(client, r.id, bot.name)
                    setFailed(null)
                    await read()
                  } catch (e) {
                    setFailed(say(e, 'this channel', 'save'))
                  }
                }}
              >
                {mine ? 'Answers' : 'Answer'}
              </Text>
            </XStack>
          </Row>
        )
      })}
      {failed ? <Line>{failed}</Line> : null}
    </Part>
  )
}

/**
 * Work on a repo.
 *
 * `/v1/agents/coding` starts ONE autonomous run against a repo the org owns and
 * hangs a session off it, so this is the door between a Bot and a codebase. The
 * repos offered are the org's own projects that carry one; a name outside that
 * set is refused by the platform naming it, and the refusal is what is shown.
 */
function Code({ bot, repos, why }: { bot: Agent; repos: Project[]; why?: string }) {
  const { client } = useAi()
  const withRepo = repos.filter((p) => p.repo?.url)
  const [repo, setRepo] = useState('')
  const [task, setTask] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => {
    if (!repo && withRepo[0]) setRepo(withRepo[0].slug)
  }, [repo, withRepo])

  return (
    <Part title="Code">
      {why ? <Line>{why}</Line> : null}
      {withRepo.length === 0 && !why ? (
        <Line>No project in this org names a repo, so there is nothing for this bot to work on.</Line>
      ) : (
        <YStack
          render="form"
          {...{
            onSubmit: async (e: React.FormEvent) => {
              e.preventDefault()
              if (!client || busy || !repo || !task.trim()) return
              setBusy(true)
              setSaid(null)
              try {
                const started = await workOn(client, { repo, prompt: task.trim(), agentRef: bot.name, project: repo })
                setSaid(`Started ${started.sessionId || started.id || 'a run'} on ${repo}.`)
                setTask('')
              } catch (err) {
                setSaid(err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            },
          }}
          gap={6}
        >
          <Picker {...PICK} value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repo">
            {withRepo.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.slug}
              </option>
            ))}
          </Picker>
          <Input
            {...BOXED}
            data-hz="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What to change"
            aria-label="What to change"
          />
          <Text {...TAB} {...{ type: 'submit' }} data-hz="code" self="flex-start" disabled={busy || !task.trim()}>
            {busy ? 'Starting…' : 'Work on it'}
          </Text>
        </YStack>
      )}
      {said ? <Line>{said}</Line> : null}
    </Part>
  )
}

/** The names under this Bot's KMS prefix. The values stay in KMS. */
function Secrets({ bot, keys, why }: { bot: Agent; keys: Secret[]; why?: string }) {
  return (
    <Part title="Secrets">
      <Line>
        Held under <Text render="code" fontSize="$1" color={INK}>{vault(bot.name)}</Text> in KMS. Names are readable here; values
        are not, by KMS and not by this screen.
      </Line>
      {why ? <Line>{why}</Line> : null}
      {keys.length === 0 && !why ? <Line>None yet.</Line> : null}
      {keys.map((k) => (
        <Row key={`${k.path}/${k.name}`}>
          <Text fontSize="$2" color={INK}>{k.name}</Text>
          <Text fontSize="$1" color={FAINT}>{k.env}</Text>
        </Row>
      ))}
    </Part>
  )
}

/**
 * The one thing that is NOT this Bot's.
 *
 * A connector is held by the person who signed in to it.
 * `/v1/integrations/connectors` answers one set for the caller and no route in
 * the contract narrows it to one agent — so it is listed as what it is, and
 * there is no switch to press.
 */
function Held({ links, why }: { links: Connector[]; why?: string }) {
  return (
    <Part title="Your connectors">
      <Line>
        Signed in by you, reachable by every bot in this org. The platform publishes no per-bot
        binding for a connector, so nothing here is scoped down to this one.
      </Line>
      {why ? <Line>{why}</Line> : null}
      {links.length === 0 && !why ? <Line>None connected.</Line> : null}
      {links.map((l) => (
        <Row key={l.id}>
          <Text fontSize="$1" color={DIM}>{l.label || l.provider}</Text>
          <Text fontSize="$1" color={FAINT}>{l.account}</Text>
        </Row>
      ))}
    </Part>
  )
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack render="section" px={16} py={14} borderBottomWidth={1} borderColor={LINE} gap={8}>
      <Text {...LABEL}>{title}</Text>
      {children}
    </YStack>
  )
}

const Line = ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
  <Text render="p" fontSize="$1" lineHeight="1.1rem" color={DIM} {...rest}>
    {children}
  </Text>
)

const Row = ({ children }: { children: React.ReactNode }) => (
  <XStack items="center" justify="space-between" gap={8}>
    {children}
  </XStack>
)
