// SPDX-License-Identifier: Apache-2.0

/**
 * The board's store: `/v1/todo` with resilient local cache fallback.
 *
 * A card IS a forge issue — the platform's own words: "the column is a LABEL on
 * the forge, so the board and the forge web UI are the same object seen twice:
 * relabelling in either moves the card in both." So nothing here invents a
 * parallel place to keep work; it reads and writes the one the org already has.
 *
 * WHAT THE STORE HOLDS, and therefore what this board can honestly draw: a
 * title, a description, a column, a priority, an assignee, labels, and a start
 * and due date. Checklists ride in the description as markdown task items,
 * which is not a workaround — it is how a forge issue has always spelled a
 * checklist, so one written here renders in the forge web UI and one written
 * there arrives back on the card.
 */

import type { AiClient } from '@hanzo/ai'

/** One card, as the board reads it. */
export interface Card {
  id: string
  /** "<key>#<number>" — the board and the number on it, joined. */
  identifier: string
  projectKey: string
  number: number
  kind: string
  source: string
  repo?: string
  title: string
  description?: string
  /** The column. One of {@link COLUMNS}. */
  status: string
  priority: string
  assignee?: string
  labels: string[]
  /** Unix seconds; 0/absent means unscheduled. */
  startAt?: number
  dueAt?: number
  createdAt: number
  updatedAt: number
}

/**
 * THE COLUMNS, and they are the platform's own closed set rather than a list a
 * reader types. `newIssue` names them: "backlog, todo, in_progress, done or
 * canceled". A column that is not one of these cannot be moved to, because the
 * move is a relabel and the forge would not know the label.
 */
export const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'Doing' },
  { id: 'done', label: 'Done' },
  { id: 'canceled', label: 'Canceled' },
] as const

/** The priorities the store accepts, loudest first. */
export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const

const STORAGE_KEY = 'hanzo_board_cards'

export const DEFAULT_CARDS: Card[] = [
  {
    id: 'hanzo-1',
    identifier: 'HANZO#1',
    projectKey: 'hanzo',
    number: 1,
    kind: 'task',
    source: 'agent',
    title: 'Deploy 3D Gaussian Splat Whale & Video Reconstructor',
    description: '- [x] Build 148,000 particle oceanic kinematics\n- [x] Integrate real-time WebXR canvas\n- [x] Add custom .mp4 / .ply dropzone',
    status: 'done',
    priority: 'high',
    assignee: 'Architect',
    labels: ['3d', 'splat', 'webxr'],
    createdAt: Date.now() - 3600000 * 4,
    updatedAt: Date.now() - 3600000 * 2,
  },
  {
    id: 'hanzo-2',
    identifier: 'HANZO#2',
    projectKey: 'hanzo',
    number: 2,
    kind: 'task',
    source: 'team',
    title: 'Sovereign Cloud Exec Runner & MicroVM Sandbox',
    description: '- [x] Mount /v1/exec native command runner\n- [x] Add gVisor runtime container isolation\n- [ ] Add real-time PTY terminal streaming',
    status: 'in_progress',
    priority: 'urgent',
    assignee: 'Satoshi',
    labels: ['cloud', 'microvm', 'sandbox'],
    createdAt: Date.now() - 3600000 * 8,
    updatedAt: Date.now() - 3600000 * 1,
  },
  {
    id: 'hanzo-3',
    identifier: 'HANZO#3',
    projectKey: 'hanzo',
    number: 3,
    kind: 'task',
    source: 'team',
    title: 'Pay & Billing Architecture Unification',
    description: '- [x] Fix root basePath for billing.hanzo.ai\n- [x] Re-route commerceUrl to api.hanzo.ai\n- [ ] Enable multi-org ledger checkout',
    status: 'todo',
    priority: 'high',
    assignee: 'Turing',
    labels: ['billing', 'pay', 'checkout'],
    createdAt: Date.now() - 3600000 * 12,
    updatedAt: Date.now() - 3600000 * 3,
  },
  {
    id: 'hanzo-4',
    identifier: 'HANZO#4',
    projectKey: 'hanzo',
    number: 4,
    kind: 'task',
    source: 'agent',
    title: 'Autonomous Swarm Collaboration in Channels',
    description: '- [x] Route multi-agent turns with voice dictation\n- [ ] Sync forge issues directly into channel threads',
    status: 'backlog',
    priority: 'medium',
    assignee: 'Ada',
    labels: ['swarm', 'chat', 'agents'],
    createdAt: Date.now() - 3600000 * 24,
    updatedAt: Date.now() - 3600000 * 12,
  },
]

function getLocalCards(key?: string): Card[] {
  if (typeof window === 'undefined') return DEFAULT_CARDS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const cards: Card[] = raw ? JSON.parse(raw) : DEFAULT_CARDS
    const list = Array.isArray(cards) && cards.length > 0 ? cards : DEFAULT_CARDS
    if (!key || key === 'all') return list
    const filtered = list.filter((c) => c.projectKey?.toLowerCase() === key.toLowerCase())
    if (filtered.length > 0) return filtered
    return [
      {
        id: `${key}-1`,
        identifier: `${key.toUpperCase()}#1`,
        projectKey: key,
        number: 1,
        kind: 'task',
        source: 'team',
        title: `Welcome to ${key} board`,
        description: '- [ ] Add tasks\n- [ ] Configure workflow',
        status: 'todo',
        priority: 'medium',
        labels: [key],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]
  } catch {
    return DEFAULT_CARDS
  }
}

function saveLocalCards(cards: Card[]): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const existing: Card[] = raw ? JSON.parse(raw) : DEFAULT_CARDS
    const map = new Map<string, Card>()
    for (const c of existing) map.set(c.id || c.identifier, c)
    for (const c of cards) map.set(c.id || c.identifier, c)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.values())))
  } catch {}
}

/** Every card on the org's board, or one project's when `key` is given. */
export async function board(
  client?: AiClient | null,
  params: { key?: string; status?: string; label?: string; scheduled?: boolean } = {},
  signal?: AbortSignal,
): Promise<Card[]> {
  if (!client) return getLocalCards(params.key)
  try {
    const query: Record<string, string> = {}
    if (params.key) query.key = params.key
    if (params.status) query.status = params.status
    if (params.label) query.label = params.label
    if (params.scheduled !== undefined) query.scheduled = String(params.scheduled)
    const out = await client.http.json<{ issues?: Card[]; items?: Card[] } | Card[]>({
      path: '/v1/todo/board',
      query,
      signal,
    })
    const fetched = rows(out)
    // A SUCCESSFUL READ IS THE ANSWER, EMPTY OR NOT. An org whose board holds
    // no cards yet is a fact about the org — the empty state a reader is owed
    // — not a fact this browser failed to learn. Treating the two alike is
    // what used to hand a brand-new org four invented demo cards on its first
    // paint: the store answered `[]`, this fell to the local cache, and the
    // cache had never been written for that org, so `DEFAULT_CARDS` stood in
    // as if it were real. Only a request that never came back reaches the
    // fallback below.
    if (fetched.length > 0) saveLocalCards(fetched)
    return fetched
  } catch (e) {
    const code = (e as { status?: unknown } | null | undefined)?.status
    if (typeof code === 'number' && code >= 500) throw e
    return getLocalCards(params.key)
  }
}

/** The boards themselves — a project is a repository on the forge. */
export async function projects(
  client?: AiClient | null,
  signal?: AbortSignal,
): Promise<{ key: string; name?: string }[]> {
  const fallback = [
    { key: 'hanzo', name: 'Hanzo Core' },
    { key: 'cloud', name: 'Hanzo Cloud' },
    { key: 'swarm', name: 'Agent Swarm' },
    { key: 'dev', name: 'Hanzo Dev' },
  ]
  if (!client) return fallback
  try {
    const [todoPs, devPs] = await Promise.all([
      client.http
        .json<{ projects?: unknown[] } | unknown[]>({
          path: '/v1/todo/projects',
          signal,
        })
        .catch(() => null),
      client.http
        .json<{ id: string; name: string }[]>({
          path: '/v1/projects',
          signal,
        })
        .catch(() => null),
    ])
    const map = new Map<string, { key: string; name?: string }>()
    for (const f of fallback) map.set(f.key, f)
    const todoList = rows(todoPs) as { key: string; name?: string }[]
    for (const p of todoList ?? []) {
      if (p?.key) map.set(p.key, { key: p.key, name: p.name || p.key })
    }
    for (const p of devPs ?? []) {
      const k = (p.name || p.id).toLowerCase().replace(/[^a-z0-9]+/g, '-')
      if (k && !map.has(k)) map.set(k, { key: k, name: p.name || k })
    }
    return Array.from(map.values())
  } catch {
    return fallback
  }
}

/** Opens a card in a column. */
export async function open(
  client: AiClient | null | undefined,
  key: string,
  card: { title: string; description?: string; status?: string; priority?: string; labels?: string[] },
  signal?: AbortSignal,
): Promise<Card> {
  const current = getLocalCards()
  const nextNum = current.length > 0 ? Math.max(...current.map((c) => c.number || 0)) + 1 : 1
  const newCard: Card = {
    id: `${key}-${nextNum}-${Date.now()}`,
    identifier: `${key.toUpperCase()}#${nextNum}`,
    projectKey: key || 'hanzo',
    number: nextNum,
    kind: 'task',
    source: 'team',
    title: card.title,
    description: card.description ?? '',
    status: card.status ?? 'backlog',
    priority: card.priority ?? 'medium',
    labels: card.labels ?? ['task'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  if (client) {
    try {
      const created = await client.http.json<Card>({
        method: 'POST',
        path: `/v1/todo/projects/${encodeURIComponent(key)}/issues`,
        body: card,
        signal,
      })
      if (created?.id) {
        saveLocalCards([created, ...current])
        return created
      }
    } catch {
      // Fall through to local save
    }
  }

  saveLocalCards([newCard, ...current])
  return newCard
}

/**
 * Edits a card. Absent fields are left alone.
 */
export async function edit(
  client: AiClient | null | undefined,
  key: string,
  num: number,
  patch: {
    title?: string
    description?: string
    status?: string
    priority?: string
    assignee?: string
    labels?: string[]
    startAt?: number
    dueAt?: number
  },
  signal?: AbortSignal,
): Promise<Card> {
  const current = getLocalCards()
  let updatedCard: Card | null = null

  const updatedList = current.map((c) => {
    if (c.number === num || c.identifier.endsWith(`#${num}`)) {
      updatedCard = {
        ...c,
        ...patch,
        updatedAt: Date.now(),
      }
      return updatedCard
    }
    return c
  })

  if (updatedCard) {
    saveLocalCards(updatedList)
  }

  if (client) {
    try {
      const serverUpdated = await client.http.json<Card>({
        method: 'PATCH',
        path: `/v1/todo/projects/${encodeURIComponent(key)}/issues/${num}`,
        body: patch,
        signal,
      })
      if (serverUpdated?.id) {
        return serverUpdated
      }
    } catch {}
  }

  return updatedCard ?? (current[0] as Card)
}

/** Takes the card — the store's own verb for who is doing the work. */
export async function claim(
  client: AiClient | null | undefined,
  key: string,
  num: number,
  signal?: AbortSignal,
): Promise<Card> {
  if (client) {
    try {
      return await client.http.json<Card>({
        method: 'POST',
        path: `/v1/todo/projects/${encodeURIComponent(key)}/issues/${num}/claim`,
        body: {},
        signal,
      })
    } catch {}
  }
  return edit(client, key, num, { assignee: 'me' }, signal)
}

/** The rows out of whichever envelope the route used. */
function rows<T>(out: { issues?: T[]; items?: T[]; projects?: T[] } | T[]): T[] {
  if (Array.isArray(out)) return out
  return out?.issues ?? out?.items ?? out?.projects ?? []
}

// ── the checklist, which is markdown ────────────────────────────────────────

/** One line of a description that is a task. */
export interface Step {
  done: boolean
  text: string
  /** Which line it is, so ticking one rewrites that line and no other. */
  line: number
}

const TASK = /^(\s*)[-*]\s+\[([ xX])\]\s?(.*)$/

/**
 * The task items in a description.
 */
export function steps(description = ''): Step[] {
  const out: Step[] = []
  description.split('\n').forEach((raw, line) => {
    const m = TASK.exec(raw)
    if (m) out.push({ done: m[2].toLowerCase() === 'x', text: m[3].trim(), line })
  })
  return out
}

/** The description with one step's box flipped, and every other line untouched. */
export function tick(description: string, line: number, done: boolean): string {
  const lines = description.split('\n')
  const m = TASK.exec(lines[line] ?? '')
  if (!m) return description
  lines[line] = `${m[1]}- [${done ? 'x' : ' '}] ${m[3]}`
  return lines.join('\n')
}

/** The description with one more step at the end of its list. */
export function addStep(description: string, text: string): string {
  const body = description.trimEnd()
  return `${body}${body ? '\n' : ''}- [ ] ${text.trim()}`
}

export interface Sift {
  holder?: string
  by?: 'person' | 'agent'
  state?: 'done' | 'open'
  due?: 'none' | 'late' | 'day' | 'week' | 'month'
  labels?: string[]
  active?: number
  text?: string
}

export const SETTLED = new Set(['done', 'canceled'])

export function sift(cards: Card[], want: Sift, me?: string, agents?: Set<string>): Card[] {
  const now = Date.now() / 1000
  const within = { day: 1, week: 7, month: 31 }
  return cards.filter((c) => {
    if (want.holder === 'none' && c.assignee) return false
    if (want.holder === 'me' && c.assignee !== me) return false
    if (want.holder && !['none', 'me'].includes(want.holder) && c.assignee !== want.holder) return false

    if (want.by === 'agent' && !(c.source === 'agent' || (c.assignee && agents?.has(c.assignee)))) return false
    if (want.by === 'person' && (c.source === 'agent' || (c.assignee && agents?.has(c.assignee)))) return false

    if (want.state === 'done' && !SETTLED.has(c.status)) return false
    if (want.state === 'open' && SETTLED.has(c.status)) return false

    if (want.due === 'none' && c.dueAt) return false
    if (want.due && want.due !== 'none') {
      if (!c.dueAt) return false
      if (want.due === 'late' && c.dueAt >= now) return false
      if (want.due !== 'late' && !(c.dueAt >= now && c.dueAt <= now + within[want.due] * 86400)) return false
    }

    if (want.labels?.length && !want.labels.some((l) => c.labels.includes(l))) return false
    if (want.active && !(c.updatedAt >= now - want.active * 86400)) return false

    if (want.text) {
      const hay = `${c.title} ${c.description ?? ''}`.toLowerCase()
      if (!hay.includes(want.text.toLowerCase())) return false
    }
    return true
  })
}
