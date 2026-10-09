// Changes asked of the conversation store that every list already shows.
//
// A pin, a rename, an archive or a delete shows at once: each list draws the
// changes held here over what it last read (`view`). No React, so a spec reads
// it as it is.
//
// ONE CONVERSATION'S CHANGES GO TO THE STORE IN ORDER. Each waits for the one
// before it to be answered, so two toggles are never answered out of order and
// the last one asked is the one the store keeps. A change is a PATCH of the
// fields it names, laid over the row; a refusal takes that one change back and
// leaves the others standing, so a refused rename does not unpin a pin still
// in flight.
//
// A SETTLED CHANGE IS KEPT UNTIL EVERY LIST HAS READ AFTER IT. Dropping it the
// moment the store answers would draw the list's older read, the row back where
// it was, until the list read again. So every read and every answer takes a
// moment from one clock (`tick`): a list read before a change settled still
// shows the change, one read after shows its own read, and once every list on
// the page has read after it the change is folded away (`sweep`).

import type { Thread } from '@hanzo/ai'

/** What a change sets: the fields it names. */
export type Patch = Partial<Pick<Thread, 'title' | 'pinned' | 'archived'>>

/** One change: the fields it sets, or null for a delete; the moment the store answered, or 0 while it has not. */
interface Layer {
  patch: Patch | null
  settled: number
}

/** One conversation's changes, in the order they were asked, over the thread as it read before them. */
interface Entry {
  seed: Thread
  layers: Layer[]
  /** The last change asked of the store; the next one waits for it. */
  queue: Promise<void>
}

/** A list of conversations on the page: the moment its rows were asked for, and how to ask again. */
export interface Reader {
  at: number
  reload: () => void
}

let clock = 0
/** The next moment. A read takes one as it is asked for, an answer as it lands. */
export const tick = (): number => ++clock

const entries = new Map<string, Entry>()
const readers = new Set<Reader>()
const listeners = new Set<() => void>()
let version = 0
let owner: unknown = null

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

/**
 * Whose conversations these are: the client the lists read through. Another
 * client is another reader or organization, and nothing asked under the last
 * one is drawn over its rows.
 */
export function bind(next: unknown): void {
  if (owner !== null && owner !== next && entries.size) {
    entries.clear()
    publish()
  }
  owner = next
}

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

/** Folds each settled change every list on the page has read after into the thread it was laid over. */
export function sweep(): void {
  let moved = false
  for (const [id, entry] of entries) {
    while (entry.layers.length) {
      const layer = entry.layers[0]
      if (!layer.settled) break
      let read = true
      for (const reader of readers) if (reader.at <= layer.settled) read = false
      if (!read) break
      entry.layers.shift()
      moved = true
      if (!layer.patch) {
        entry.layers.length = 0
        break
      }
      entry.seed = { ...entry.seed, ...layer.patch }
    }
    if (!entry.layers.length) entries.delete(id)
  }
  if (moved) publish()
}

/** Pinned first, then most recently spoken in: the store's own order. */
const first = (a: Thread, b: Thread): number =>
  Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')

/** One conversation added to a list in the store's order. */
const place = (threads: Thread[], t: Thread): Thread[] => {
  const i = threads.findIndex((one) => first(t, one) < 0)
  return i < 0 ? [...threads, t] : [...threads.slice(0, i), t, ...threads.slice(i)]
}

/** A thread with changes laid over it in order; null once one of them deleted it. */
const lay = (t: Thread, layers: Layer[]): Thread | null => {
  let out: Thread = t
  for (const layer of layers) {
    if (!layer.patch) return null
    out = { ...out, ...layer.patch }
  }
  return out
}

/**
 * A list as it reads with every change it has not read yet: `threads` read at
 * `at`, from the archived shelf or the active one. A deleted conversation
 * leaves; one archived or brought back leaves the shelf it is no longer on and
 * joins the other; any other change shows in place.
 */
export function view(threads: Thread[], at: number, archived: boolean): Thread[] {
  let out = threads
  for (const [id, entry] of entries) {
    const unread = entry.layers.filter((layer) => !layer.settled || at < layer.settled)
    if (!unread.length) continue
    const i = out.findIndex((t) => t.id === id)
    // A row this list read carries every change it read after; one it lacks is the thread before them all.
    const want = i >= 0 ? lay(out[i], unread) : lay(entry.seed, entry.layers)
    if (!want || Boolean(want.archived) !== archived) {
      if (i >= 0) out = out.filter((t) => t.id !== id)
    } else {
      out = i >= 0 ? out.map((t) => (t.id === id ? want : t)) : place(out, want)
    }
  }
  return out
}

/**
 * Asks the store for one change to `t`, shown at once: `patch` the fields it
 * sets, or null for a delete, and `send` the request, made once every earlier
 * change to the same conversation has been answered. What the store answers
 * for those fields is what shows. On a refusal this change alone is taken back
 * and the refusal thrown.
 */
export function attempt(t: Thread, patch: Patch | null, send: () => Promise<Thread | void>): Promise<void> {
  let entry = entries.get(t.id)
  if (!entry) {
    entry = { seed: t, layers: [], queue: Promise.resolve() }
    entries.set(t.id, entry)
  }
  const held = entry
  const mine: Layer = { patch: patch ? { ...patch } : null, settled: 0 }
  held.layers.push(mine)
  publish()
  const run = held.queue.then(async () => {
    try {
      const answer = await send()
      if (answer && mine.patch) {
        const said = answer as Patch
        for (const key of Object.keys(mine.patch) as (keyof Patch)[]) if (said[key] !== undefined) Object.assign(mine.patch, { [key]: said[key] })
      }
      mine.settled = tick()
      publish()
    } catch (e) {
      const i = held.layers.indexOf(mine)
      if (i >= 0) {
        held.layers.splice(i, 1)
        if (!held.layers.length && entries.get(t.id) === held) entries.delete(t.id)
        publish()
      }
      throw e
    }
    reread()
    sweep()
  })
  held.queue = run.catch(() => {})
  return run
}
