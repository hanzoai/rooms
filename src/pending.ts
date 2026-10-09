// Changes asked of the conversation store that every list already shows.
//
// A pin, a rename, an archive or a delete shows at once: each list draws the
// changes held here over what it last read (`view`). The store's answer settles
// a change, and a refusal takes it back — the list then shows what it read,
// which never stopped being the store's. No React, so a spec reads it as it is.
//
// A SETTLED CHANGE IS KEPT UNTIL EVERY LIST HAS READ AFTER IT. Clearing it the
// moment the store answers would draw the list's older read, the row back where
// it was, until the list read again. So every read and every answer takes a
// moment from one clock (`tick`): a list read before a change settled still
// shows the change, one read after shows its own read, and once every list on
// the page has read after it the change is gone (`sweep`).

import type { Thread } from '@hanzo/ai'

/** What a conversation will read once the store has it: the thread, or null once it is deleted. */
export interface Change {
  want: Thread | null
  /** The moment the store answered, or 0 while it has not. */
  settled: number
}

/** A list of conversations on the page: the moment its rows were asked for, and how to ask again. */
export interface Reader {
  at: number
  reload: () => void
}

let clock = 0
/** The next moment. A read takes one as it is asked for, an answer as it lands. */
export const tick = (): number => ++clock

const changes = new Map<string, Change>()
const readers = new Set<Reader>()
const listeners = new Set<() => void>()
let version = 0

const publish = (): void => {
  version++
  for (const listener of listeners) listener()
}

/** For `useSyncExternalStore`: told whenever a change is made, settled, taken back or dropped. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** For `useSyncExternalStore`: a number that moves whenever the changes do. */
export const snapshot = (): number => version

/** A list joins the page; the returned function is its leaving. */
export function enlist(reader: Reader): () => void {
  readers.add(reader)
  return () => {
    readers.delete(reader)
    sweep()
  }
}

/** Every list on the page reads the store again. */
export function reread(): void {
  for (const reader of readers) reader.reload()
}

/** Drops each settled change every list on the page has read after. */
export function sweep(): void {
  let dropped = false
  for (const [id, change] of changes) {
    if (!change.settled) continue
    let read = true
    for (const reader of readers) if (reader.at <= change.settled) read = false
    if (read) {
      changes.delete(id)
      dropped = true
    }
  }
  if (dropped) publish()
}

/** Pinned first, then most recently spoken in: the store's own order. */
const first = (a: Thread, b: Thread): number =>
  Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')

/** One conversation added to a list in the store's order. */
const place = (threads: Thread[], t: Thread): Thread[] => {
  const i = threads.findIndex((one) => first(t, one) < 0)
  return i < 0 ? [...threads, t] : [...threads.slice(0, i), t, ...threads.slice(i)]
}

/**
 * A list as it reads with every change it has not read yet: `threads` read at
 * `at`, from the archived shelf or the active one. A deleted conversation
 * leaves; one archived or brought back leaves the shelf it is no longer on and
 * joins the other; any other change shows in place.
 */
export function view(threads: Thread[], at: number, archived: boolean): Thread[] {
  let out = threads
  for (const [id, change] of changes) {
    if (change.settled && at > change.settled) continue
    const i = out.findIndex((t) => t.id === id)
    const want = change.want
    if (!want || Boolean(want.archived) !== archived) {
      if (i >= 0) out = out.filter((t) => t.id !== id)
    } else {
      out = i >= 0 ? out.map((t) => (t.id === id ? want : t)) : place(out, want)
    }
  }
  return out
}

/**
 * Asks the store for one change, shown at once. `want` is the conversation as
 * it will read (null for a delete) and `send` the request; what the store
 * answers is laid over `want`. On a refusal the change is taken back and the
 * refusal thrown. A later change to the same conversation supersedes this one,
 * which then neither settles nor takes anything back.
 */
export async function attempt(id: string, want: Thread | null, send: () => Promise<Thread | void>): Promise<void> {
  const mine: Change = { want, settled: 0 }
  changes.set(id, mine)
  publish()
  try {
    const answer = await send()
    if (changes.get(id) === mine) {
      if (want && answer) mine.want = { ...want, ...answer }
      mine.settled = tick()
      publish()
    }
  } catch (e) {
    if (changes.get(id) === mine) {
      changes.delete(id)
      publish()
    }
    throw e
  }
  reread()
  sweep()
}
