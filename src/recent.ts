// The Recents list as data: each mode's rows, the views a menu offers, and the
// list a view makes of them. No React, so a spec reads it as it is.

export type Mode = 'chat' | 'dev'

export interface Recent {
  kind: Mode
  id: string
  title: string
  /** When it was last spoken in, as an ISO time. */
  at: string
  /** When it began, as an ISO time. */
  began: string
  status?: string
  project?: string
}

export type Status = 'all' | 'running' | 'paused' | 'done' | 'error' | 'stopped'
export type Since = 'any' | 'day' | 'week' | 'month'
export type Group = 'date' | 'state' | 'project' | 'starred' | 'none'
export type Sort = 'activity' | 'created' | 'title'

/** How the list is narrowed, grouped and sorted. */
export interface View {
  status: Status
  since: Since
  group: Group
  sort: Sort
}

export const PLAIN: View = { status: 'all', since: 'any', group: 'date', sort: 'activity' }

export type Option<T> = { id: T; label: string }

const STATUSES: Option<Status>[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'paused', label: 'Paused' },
  { id: 'done', label: 'Done' },
  { id: 'error', label: 'Failed' },
  { id: 'stopped', label: 'Stopped' },
]
export const SINCE: Option<Since>[] = [
  { id: 'any', label: 'Any time' },
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'Past 7 days' },
  { id: 'month', label: 'Past 30 days' },
]

/** What each mode's menu offers, section by section, as Claude's Recents menu does. */
export const MENUS: Record<Mode, { status: Option<Status>[]; group: Option<Group>[]; sort: Option<Sort>[] }> = {
  chat: {
    status: [],
    group: [
      { id: 'date', label: 'Date' },
      { id: 'starred', label: 'Starred' },
      { id: 'none', label: 'None' },
    ],
    sort: [
      { id: 'activity', label: 'Activity' },
      { id: 'title', label: 'Title' },
    ],
  },
  dev: {
    status: STATUSES,
    group: [
      { id: 'date', label: 'Date' },
      { id: 'state', label: 'State' },
      { id: 'project', label: 'Project' },
      { id: 'none', label: 'None' },
    ],
    sort: [
      { id: 'activity', label: 'Activity' },
      { id: 'created', label: 'Created' },
      { id: 'title', label: 'Title' },
    ],
  },
}

/** A kept view as this mode may hold it: anything a menu does not offer reads as the plain view's. */
export function viewOf(mode: Mode, kept: unknown): View {
  const k = (kept && typeof kept === 'object' ? kept : {}) as Partial<Record<keyof View, unknown>>
  const m = MENUS[mode]
  const pick = <T,>(v: unknown, from: Option<T>[], fallback: T): T => from.find((o) => o.id === v)?.id ?? fallback
  return {
    status: pick(k.status, m.status, PLAIN.status),
    since: pick(k.since, SINCE, PLAIN.since),
    group: pick(k.group, m.group, PLAIN.group),
    sort: pick(k.sort, m.sort, PLAIN.sort),
  }
}

/** Chat's conversations as rows. */
export function chats(threads: { id: string; title?: string; updatedAt?: string }[]): Recent[] {
  return threads.map((t) => ({ kind: 'chat', id: t.id, title: t.title || 'Untitled', at: t.updatedAt ?? '', began: t.updatedAt ?? '' }))
}

/** Dev's runs as rows. */
export function runs(sessions: { id: string; title: string; status: string; project?: string; repo?: string; createdAt: string; updatedAt: string }[]): Recent[] {
  return sessions.map((r) => ({
    kind: 'dev',
    id: r.id,
    title: r.title || 'Untitled run',
    at: r.updatedAt || r.createdAt,
    began: r.createdAt,
    status: r.status,
    project: r.project || r.repo?.split('/').pop() || '',
  }))
}

const DAY = 86_400_000
const SPAN: Record<Since, number> = { any: Infinity, day: DAY, week: 7 * DAY, month: 30 * DAY }
const STATE: Record<string, string> = { running: 'Running', paused: 'Paused', done: 'Done', error: 'Failed', stopped: 'Stopped' }

/** The date headings, in the order they read. */
const DAYS = ['Today', 'Yesterday', 'Past 7 days', 'Past 30 days', 'Older']

/** Which date heading an instant falls under, counted in the reader's own days. */
function day(at: string, now: Date): string {
  const t = new Date(at)
  if (Number.isNaN(t.getTime())) return 'Older'
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (t.getTime() >= midnight) return 'Today'
  if (t.getTime() >= midnight - DAY) return 'Yesterday'
  if (t.getTime() >= midnight - 7 * DAY) return 'Past 7 days'
  if (t.getTime() >= midnight - 30 * DAY) return 'Past 30 days'
  return 'Older'
}

const newest = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)

/**
 * The list as drawn: the rows the view and the words admit, sorted, and cut into
 * headed groups in the order they read. A view grouped by None is one group with
 * no heading.
 */
export function arrange(rows: Recent[], view: View, words: string, starred: Set<string>, now = new Date()): { title: string; rows: Recent[] }[] {
  const w = words.trim().toLowerCase()
  const kept = rows.filter(
    (r) =>
      (!w || r.title.toLowerCase().includes(w)) &&
      (view.status === 'all' || r.status === view.status) &&
      (view.since === 'any' || now.getTime() - new Date(r.at).getTime() <= SPAN[view.since]),
  )
  kept.sort((a, b) =>
    view.sort === 'title' ? a.title.localeCompare(b.title) : view.sort === 'created' ? newest(a.began, b.began) : newest(a.at, b.at),
  )
  const headOf = (r: Recent): string => {
    switch (view.group) {
      case 'date':
        return day(view.sort === 'created' ? r.began : r.at, now)
      case 'state':
        return STATE[r.status ?? ''] ?? 'Other'
      case 'project':
        return r.project || 'No project'
      case 'starred':
        return starred.has(r.id) ? 'Starred' : 'Others'
      default:
        return ''
    }
  }
  const groups: { title: string; rows: Recent[] }[] = []
  for (const r of kept) {
    const title = headOf(r)
    const g = groups.find((one) => one.title === title)
    if (g) g.rows.push(r)
    else groups.push({ title, rows: [r] })
  }
  if (view.group === 'starred') groups.sort((a, b) => (a.title === 'Starred' ? -1 : b.title === 'Starred' ? 1 : 0))
  if (view.group === 'date') groups.sort((a, b) => DAYS.indexOf(a.title) - DAYS.indexOf(b.title))
  return groups
}


/**
 * How long ago a row was last active, as a list reads it at a glance: `now`,
 * `12m`, `3h`, `2d`, `5w`, `4mo`, `2y`. '' for an instant that is not one.
 */
export function ago(at: string, now = new Date()): string {
  const t = new Date(at).getTime()
  if (Number.isNaN(t)) return ''
  const m = Math.max(0, Math.floor((now.getTime() - t) / 60_000))
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  if (d < 30) return `${Math.floor(d / 7)}w`
  if (d < 365) return `${Math.floor(d / 30)}mo`
  return `${Math.floor(d / 365)}y`
}
