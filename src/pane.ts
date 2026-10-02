'use client'

// What the column beside a conversation is holding, PER CONVERSATION.
//
// The store lives outside React for the reason `open.ts` gives: the router
// mounts the rooms, so anything kept inside one is destroyed by a route change.
// This differs from `open.ts` in the one way that matters — IT PERSISTS. A
// selection is WHERE YOU ARE and a fresh document is rightly a fresh room; a
// pane is WHAT YOU HAD OPEN, and losing four tabs to a reload is the reader
// losing work rather than losing their place.
//
// ONE ENTRY PER CONVERSATION, not one blob holding them all. A blob is read in
// full at boot and rewritten in full on every change, so ten conversations make
// nine channels' tabs the cost of moving one tab in the tenth. Keyed
// separately, both costs are proportional to the conversation you are actually
// in, and a corrupt entry loses one pane rather than all of them.
//
// WHAT IS KEPT AND WHAT IS NOT. Tabs, the chosen tab and the pin survive a
// reload because they are addresses and flags. Files picked off the reader's
// own disk DO NOT: a file handle is an object URL, which the browser revokes
// with the document that minted it, so a persisted row would come back as a
// name pointing at nothing. A row that looks like a file and opens nothing is
// worse than no row, so they are held for the session and no longer.

import { useSyncExternalStore } from 'react'

/** One open tab in the pane's browser. */
export interface Leaf {
  id: string
  url: string
  /** What the strip shows: host and path, which is all we can read across an
   *  origin we do not own. A frame's real title is not ours to ask for. */
  title: string
}

/**
 * A file the reader put into this conversation from their own disk.
 *
 * `href` is an object URL and is the reason this is never written down — see
 * the note at the top. Everything else is read off the `File` itself, so a name
 * and a size here are the file system's, never a guess.
 */
export interface Held {
  id: string
  name: string
  size: number
  /** The browser's type for it, or '' where it could not tell from the name. */
  type: string
  href: string
}

/** Everything the column beside one conversation is holding. */
export interface Pane {
  tabs: Leaf[]
  /** The chosen tab, or null when this conversation has opened none. */
  at: string | null
  /** Whether the summary column stands beside the browser. */
  pinned: boolean
  held: Held[]
}

/** A pane nobody has touched. Shared, and never mutated — see `EMPTY` in
 *  `open.ts` for why a fresh object per read is an infinite render. */
const BARE: Pane = { tabs: [], at: null, pinned: true, held: [] }

/** The half of a pane worth writing down. */
type Kept = Pick<Pane, 'tabs' | 'at' | 'pinned'>

const where = (key: string) => `hanzo.pane.${key}`

/**
 * The conversation a pane belongs to.
 *
 * THREE FIELDS AND NOT ONE, because `open.ts` already refuses to conflate them:
 * an inbox room arrives over a transport and is keyed by it, a thread is a
 * conversation the org has recorded, and an agent is who you are talking to
 * before a thread exists. Prefixed so a room called `x` and a thread called `x`
 * cannot land on one entry.
 *
 * `new` is a real answer and not a fallback: a room nobody has spoken in yet is
 * somewhere a reader can open tabs, and they should still be there when the
 * first turn mints a thread. It is the ONE key that several conversations pass
 * through, which is the honest cost of not having an id to key on yet.
 */
export function channel(open: {
  room: string | null
  thread: string | null
  agent: string | null
}): string {
  if (open.room) return `room:${open.room}`
  if (open.thread) return `thread:${open.thread}`
  if (open.agent) return `agent:${open.agent}`
  return 'new'
}

// The panes this document has actually touched. A switch back reads from here
// rather than re-parsing JSON, so moving between two conversations costs one
// read each and nothing after that.
const live = new Map<string, Pane>()

const listeners = new Set<() => void>()

function announce(): void {
  for (const l of listeners) l()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/**
 * The pane for a conversation, reading it in the first time it is asked for.
 *
 * A BAD ENTRY IS DROPPED, NOT THROWN. Storage holds whatever an older build
 * wrote, and one unparseable pane must not take the room down with it — the
 * reader loses some tabs, which is what they would have had anyway.
 */
function read(key: string): Pane {
  const found = live.get(key)
  if (found) return found
  let pane = BARE
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(where(key))
    if (raw) {
      const kept = JSON.parse(raw) as Partial<Kept>
      const tabs = Array.isArray(kept.tabs)
        ? kept.tabs.filter(
            (t): t is Leaf =>
              !!t && typeof t.id === 'string' && typeof t.url === 'string' && typeof t.title === 'string',
          )
        : []
      pane = {
        tabs,
        // A chosen tab that is no longer open is not a choice. Restoring one
        // leaves the strip with nothing marked and the panel drawing a tab that
        // is not in it.
        at: tabs.some((t) => t.id === kept.at) ? (kept.at as string) : (tabs[0]?.id ?? null),
        pinned: kept.pinned !== false,
        held: [],
      }
    }
  } catch {
    pane = BARE
  }
  live.set(key, pane)
  return pane
}

/** The server renders no storage, so every pane starts bare there. Returning
 *  the shared object keeps the snapshot stable across reads. */
const onServer = (): Pane => BARE

function write(key: string, next: Pane): void {
  live.set(key, next)
  try {
    if (typeof window === 'undefined') return
    const kept: Kept = { tabs: next.tabs, at: next.at, pinned: next.pinned }
    window.localStorage.setItem(where(key), JSON.stringify(kept))
  } catch {
    // A browser refusing to store — private mode, a full quota — is not a
    // reason to refuse the change on screen. The pane stands for this document.
  }
  announce()
}

/** Applies a change to one conversation's pane. */
function edit(key: string, change: (was: Pane) => Pane): void {
  write(key, change(read(key)))
}

/** The host and path of an address, which is as much as a title can honestly be. */
export function name(url: string): string {
  try {
    const u = new URL(url)
    return u.host + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return url
  }
}

/**
 * An address as typed, made into one that can be opened.
 *
 * A bare host is `https`, because that is the web now; a loopback name is
 * `http`, because nothing is listening on 443 of a laptop and offering a
 * reader a URL that cannot connect is worse than guessing.
 */
export function address(typed: string): string {
  const t = typed.trim()
  if (!t) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t
  return /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(t) ? `http://${t}` : `https://${t}`
}

let minted = 0
const mint = (prefix: string) => `${prefix}${Date.now().toString(36)}${(minted++).toString(36)}`

/**
 * Opens an address in this conversation, and chooses it.
 *
 * `called` is for the things that HAVE a name of their own — an answer's
 * `index.html`, a file off the reader's disk — because their address is a blob
 * and `name()` can read nothing useful out of one. Without it the host and path
 * are the honest title.
 */
export function openTab(key: string, url: string, called?: string): void {
  const at = address(url)
  if (!at) return
  edit(key, (was) => {
    const leaf: Leaf = { id: mint('t'), url: at, title: called || name(at) }
    return { ...was, tabs: [...was.tabs, leaf], at: leaf.id }
  })
}

/** Points an already-open tab somewhere else. */
export function goTab(key: string, id: string, url: string): void {
  const at = address(url)
  if (!at) return
  edit(key, (was) => ({
    ...was,
    tabs: was.tabs.map((t) => (t.id === id ? { ...t, url: at, title: name(at) } : t)),
  }))
}

/** Chooses an open tab. */
export function pickTab(key: string, id: string): void {
  edit(key, (was) => (was.at === id ? was : { ...was, at: id }))
}

/**
 * Shuts a tab.
 *
 * THE NEIGHBOUR IS THE ONE TO ITS RIGHT, falling back to its left — what every
 * browser does, and the only choice that does not send the reader somewhere
 * they were not looking. Closing the last tab leaves none chosen rather than
 * refusing, because a pane with no tabs is a state this panel draws.
 */
export function shutTab(key: string, id: string): void {
  edit(key, (was) => {
    const gone = was.tabs.findIndex((t) => t.id === id)
    if (gone < 0) return was
    const tabs = was.tabs.filter((t) => t.id !== id)
    if (was.at !== id) return { ...was, tabs }
    return { ...was, tabs, at: (tabs[gone] ?? tabs[gone - 1])?.id ?? null }
  })
}

/** Shows or hides the summary column beside this conversation's browser. */
export function pin(key: string, on: boolean): void {
  edit(key, (was) => (was.pinned === on ? was : { ...was, pinned: on }))
}

/** Takes files from the reader's disk into this conversation. */
export function hold(key: string, files: File[]): void {
  if (!files.length) return
  const taken = files.map((f) => ({
    id: mint('h'),
    name: f.name,
    size: f.size,
    type: f.type,
    href: URL.createObjectURL(f),
  }))
  edit(key, (was) => ({ ...was, held: [...was.held, ...taken] }))
}

/** Lets go of a file, and of the handle the browser minted for it. */
export function drop(key: string, id: string): void {
  edit(key, (was) => {
    const going = was.held.find((h) => h.id === id)
    if (!going) return was
    URL.revokeObjectURL(going.href)
    return { ...was, held: was.held.filter((h) => h.id !== id) }
  })
}

/** This conversation's pane, and it alone — a change to another redraws nothing
 *  here, because the snapshot returned is that key's own object. */
export function usePane(key: string): Pane {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    onServer,
  )
}
