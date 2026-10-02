'use client'

// Every route this room calls that the SDK has no method for, named once.
//
// `@hanzo/ai` 0.6.16 owns the agent verbs, the sandbox verbs, the tool
// registry, the channel list and the machines, and those are called through it
// — a path written twice is a path that drifts. What is here is the remainder:
// registering and narrating a session, binding a channel to one Bot, starting
// a coding run, calling a tool, minting a window onto a sandbox, and reading a
// Bot's own secrets.
//
// MEASURED against api.hanzo.ai, 2026-09-07, with a live IAM bearer. The
// gateway serves each of these under both spellings (`/v1/agent/sessions` and
// `/v1/agents/sessions` answer the same handler); the plural is written here
// because it is the spelling the SDK uses, and two spellings of one route is
// one too many.

import type { Session, SessionDetail, SessionEvent } from '@hanzo/ai'
import type { useAi } from '../lib/ai'

export type Client = NonNullable<ReturnType<typeof useAi>['client']>

const SESSION = '/v1/agents/sessions'

// ── What a Bot owns ─────────────────────────────────────────────────────────
//
// A Bot is not a row in a list of prompts; it is a worker with things of its
// own. Most are fields on the record — the tools it may call, the machine it
// runs on, the clock it wakes to, the identity it acts as — and two are named
// spaces derived from its name:
//
//   its DISK, because a sandbox volume is named per (org, project) and the name
//   is deterministic, so leasing `bot-<name>` twice finds the same disk and the
//   Bot's runtime state survives a lease that ended;
//
//   its SECRETS, because `/v1/kms/secrets` filters by `path`, so a Bot's
//   credentials sit under a prefix nothing else reads.

/** The sandbox project that is this Bot's own disk. */
export const disk = (name: string) => `bot-${name}`

/** The KMS path prefix that is this Bot's own secrets. */
export const vault = (name: string) => `bots/${name}`

/** Long-running is the platform's word for a Bot that stays up. The set is
 *  closed, and long-running is REFUSED without a schedule — measured, 400
 *  "a long-running agent requires a 'schedule' (5-field cron)". */
export const ALWAYS = 'long-running'
export const ONCE = 'one-shot'

// ── Its work ────────────────────────────────────────────────────────────────

/**
 * The sessions opened under this Bot's name.
 *
 * NARROWED HERE, BECAUSE THE ROUTE WILL NOT. Its query is root, parent,
 * status, project, room and limit — there is no per-agent filter — and an
 * `agent=` it does not know is SILENTLY IGNORED rather than refused. Measured:
 * `?agent=nope` and no query at all answer the same five rows. A caller that
 * trusts the parameter draws the whole org's work as one bot's, which is how
 * this was wrong once already.
 */
export const sessions = (c: Client, agent: string, limit = 200, signal?: AbortSignal) =>
  c.http
    .collection<Session>('sessions', { path: SESSION, query: { limit }, signal })
    .then((rows) => rows.filter((s) => s.agent === agent))

/** Opens a session under this Bot's name and answers the row. */
export const launch = (c: Client, agent: string, title: string) =>
  c.http.json<Session>({ method: 'POST', path: SESSION, body: { agent, title } })

/** One session with its children and its most recent turns. */
export const transcript = (c: Client, id: string, signal?: AbortSignal) =>
  c.http.json<SessionDetail>({ path: `${SESSION}/${encodeURIComponent(id)}`, signal })

/** Records one turn in a session's log and answers it. */
export const record = (c: Client, id: string, kind: string, text: string) =>
  c.http.json<SessionEvent>({ method: 'POST', path: `${SESSION}/${encodeURIComponent(id)}/events`, body: { kind, text } })

/** The four things you can say to a running session. Each one is recorded as a
 *  control turn whether or not a runner is attached to hear it — the reply
 *  carries `forwarded`, which says which of the two happened. */
export const steer = (
  c: Client,
  id: string,
  command: 'pause' | 'resume' | 'stop' | 'message',
  message?: string,
) =>
  c.http.json<{ command?: string; event?: SessionEvent; forwarded?: boolean }>({
    method: 'POST',
    path: `${SESSION}/${encodeURIComponent(id)}/${command}`,
    body: message === undefined ? {} : { message },
  })

// ── What it can reach ───────────────────────────────────────────────────────

/** Which Bot answers a channel: the org default and any room bound past it. */
export interface Answering {
  channel: string
  default?: string
  rooms?: Record<string, string>
}

export const answering = (c: Client, channel: string, signal?: AbortSignal) =>
  c.http.json<Answering>({ path: '/v1/channels/agent', query: { channel }, signal })

/** Makes this Bot the one that answers a channel. */
export const answer = (c: Client, channel: string, agent: string) =>
  c.http.json<Answering>({ method: 'PUT', path: '/v1/channels/agent', body: { channel, default: agent } })

/**
 * The platform's own MCP surface — every subsystem's operations, projected as
 * tools, over JSON-RPC at `/v1/mcp`.
 *
 * This is where a Bot's callable names actually come from. The OTHER door,
 * `/v1/tools/call`, dispatches only what an org has ACTIVATED in the tool
 * registry, and answers 404 "unknown tool" for everything else — which is
 * everything, for an org that has activated none. So the registry is read for
 * what an org has added and this is read for what the platform already serves.
 *
 * Measured: `tools/list` answers 116 tools for a signed-in caller, and refuses
 * 127 more by a stated rule — a tool is not projected when its name would
 * disclose a bearer secret, or when a mutating verb acts on an identity.
 */
export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
  annotations?: { readOnlyHint?: boolean }
}

const rpc = <T,>(c: Client, method: string, params?: unknown) =>
  c.http
    .json<{ result?: T; error?: { message?: string } }>({
      method: 'POST',
      path: '/v1/mcp',
      body: { jsonrpc: '2.0', id: 1, method, params },
    })
    .then((r) => {
      if (r.error) throw new Error(r.error.message || 'the tool refused')
      return r.result as T
    })

export const tools = (c: Client) => rpc<{ tools?: McpTool[] }>(c, 'tools/list').then((r) => r.tools ?? [])

/** Runs one operation of one tool and answers the text it produced. */
export const call = (c: Client, name: string, op: string, input: Record<string, unknown> = {}) =>
  rpc<{ content?: { text?: string }[] }>(c, 'tools/call', { name, arguments: { op, input } }).then((r) =>
    (r.content ?? []).map((p) => p.text ?? '').join('\n'),
  )

/** Starts one autonomous coding run against a repo in the caller's org. */
export const workOn = (c: Client, params: { repo: string; prompt: string; agentRef?: string; project?: string }) =>
  c.http.json<{ sessionId?: string; id?: string }>({ method: 'POST', path: '/v1/agents/coding', body: params })

/** A project the org has declared, with the repo behind it where there is one. */
export interface Project {
  id: string
  slug: string
  name?: string
  repo?: { url?: string; branch?: string } | null
}

export const projects = (c: Client, signal?: AbortSignal) =>
  c.http.json<Project[]>({ path: '/v1/projects', signal })

/** A secret's NAME and where it lives. The value never leaves KMS. */
export interface Secret {
  name: string
  path?: string
  env?: string
  scheme?: string
}

export const secrets = (c: Client, path: string, signal?: AbortSignal) =>
  c.http.collection<Secret>('secrets', { path: '/v1/kms/secrets', query: { path }, signal })

/** A connector as `/v1/integrations/connectors` answers it. Held by the PERSON
 *  who signed in to it: the contract publishes no per-agent binding. */
export interface Connector {
  id: string
  provider?: string
  label?: string
  account?: string
  scopes?: string[]
  connectedAt?: string
  expiresAt?: string
}

export const connectors = (c: Client, signal?: AbortSignal) =>
  c.http.collection<Connector>('connectors', { path: '/v1/integrations/connectors', signal })

/** A short-lived grant to open a real terminal or a real screen on a sandbox.
 *  The URL it answers is the only address either surface is ever drawn from. */
export interface Grant {
  url?: string
  ticket?: string
  expiresIn?: number
}

export const grant = (c: Client, id: string, kind: 'terminal' | 'screen') =>
  c.http.json<Grant>({ method: 'POST', path: `/v1/sandbox/${encodeURIComponent(id)}/${kind}/ticket` })
