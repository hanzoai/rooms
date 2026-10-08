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
//
// ONE WAY IN FOR A FILE. The composer's paperclip, a drop on the room, a paste
// into the field and the column's `+` all call `hold`, so a file goes up by one
// road (`lib/files`: straight to the org's workspace, in parts when it is
// large), shows as a chip over the field and a row under Sources at once, and
// goes with the next message by reference. Sending spends what is held; from
// then on the turn itself is the record Sources reads.

import { useSyncExternalStore } from 'react'
import { chatKey, follow, pool, register, settled, upload, workspace, type Api, type WorkFile } from './lib/files'

/** One open tab in the pane's browser. */
export interface Leaf {
  id: string
  url: string
  /** What the strip shows: host and path, which is all we can read across an
   *  origin we do not own. A frame's real title is not ours to ask for. */
  title: string
}

/**
 * A file put into this conversation, on its way to the workspace or already
 * there, waiting to go with the next message.
 *
 * `href` is an object URL and is the reason this is never written down — see
 * the note at the top. A name and a size are the file system's, or the
 * workspace file's, never a guess.
 */
export interface Held {
  id: string
  name: string
  size: number
  /** The browser's type for it, or '' where it could not tell from the name. */
  type: string
  /** An object URL over the bytes on this machine; '' for a file taken from Drive. */
  href: string
  /** Sending its bytes, then the index's own word for how far it has got. */
  state: 'uploading' | WorkFile['status']
  /** The fraction of the bytes the store holds, while uploading. */
  sent: number
  /** The workspace file, once the upload landed and was registered. */
  file?: WorkFile
  /** Why it failed, in the reader's words. */
  error?: string
}

/** What carries a file: the client that reaches the platform, and the org whose workspace it lands in. */
export interface Via {
  api: Api
  org: string | null
}

/** Everything the column beside one conversation is holding. */
export interface Pane {
  tabs: Leaf[]
  /** The chosen tab, or null when this conversation has opened none. */
  at: string | null
  /** Whether the summary column stands beside the browser. */
  pinned: boolean
  held: Held[]
  /** Why the last files offered were refused, in the reader's words, or null. */
  refused: string | null
}

/** A pane nobody has touched. Shared, and never mutated — see `EMPTY` in
 *  `open.ts` for why a fresh object per read is an infinite render. */
const BARE: Pane = { tabs: [], at: null, pinned: true, held: [], refused: null }

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
        refused: null,
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

// THE WORKSPACE FILES THIS DOCUMENT HAS SEEN, by id, as the index last said.
// A chip over the field and a chip in a sent turn read one record, so a file
// that finishes indexing after the message went shows ready in both.
const files = new Map<string, WorkFile>()
const fileListeners = new Set<() => void>()

function know(f: WorkFile): void {
  files.set(f.id, f)
  for (const l of fileListeners) l()
}

/** The workspace file `id` as the index last said, or undefined until it has. */
export function useWorkFile(id: string | undefined): WorkFile | undefined {
  return useSyncExternalStore(
    (l) => {
      fileListeners.add(l)
      return () => {
        fileListeners.delete(l)
      }
    },
    () => (id ? files.get(id) : undefined),
    () => undefined,
  )
}

// THE BYTES ON THIS MACHINE, by the workspace file they became. `spend` leaves a
// held file's object URL standing, so a turn that carried a picture draws it
// from here with no request, for as long as this document lives. A reload ends
// it, and the turn reads the workspace's copy instead.
const local = new Map<string, string>()

/** The object URL over workspace file `id`'s bytes on this machine, or '' where this document never held them. */
export const localOf = (id: string): string => local.get(id) ?? ''

// Each held file's upload, by held id: what stops it, and what it settles to.
const carrying = new Map<string, { stop: AbortController; done: Promise<WorkFile | null> }>()

/** How many files go up at once; each large one also sends several parts at once. */
const FILES_AT_ONCE = 3

function patch(key: string, id: string, fields: Partial<Held>): void {
  edit(key, (was) => {
    const at = was.held.findIndex((h) => h.id === id)
    if (at < 0) return was
    const held = was.held.slice()
    held[at] = { ...held[at], ...fields }
    return { ...was, held }
  })
}

const fromFile = (f: WorkFile): Partial<Held> => ({ state: f.status, sent: 1, file: f, error: f.status === 'failed' || f.status === 'stored' ? f.error : undefined })

/** Watches a workspace file until its ingest settles, keeping every chip that names it current. */
function watch(api: Api, f: WorkFile, key?: string, id?: string): void {
  know(f)
  if (settled(f)) return
  void follow(api, f.id, (seen) => {
    know(seen)
    if (key && id) patch(key, id, fromFile(seen))
  }).catch(() => {})
}

/**
 * Takes files into this conversation: each goes straight to the org's
 * workspace — in parts when it is large, several at once — is registered with
 * the index, and is followed through its stages. Nothing is refused for its
 * size or its kind: a file the index cannot read is still kept, and says why.
 */
export async function hold(key: string, list: readonly File[], via: Via): Promise<void> {
  if (!list.length) return
  if (!via.org) {
    edit(key, (was) => ({ ...was, refused: 'Sign in to attach files: they are kept in your workspace Drive.' }))
    return
  }
  const org = via.org
  const taken: Held[] = list.map((file) => ({
    id: mint('h'),
    name: file.name,
    size: file.size,
    type: file.type,
    href: URL.createObjectURL(file),
    state: 'uploading',
    sent: 0,
  }))
  edit(key, (was) => ({ ...was, held: [...was.held, ...taken], refused: null }))
  const jobs = taken.map((h, i) => {
    const stop = new AbortController()
    let land!: (f: WorkFile | null) => void
    const done = new Promise<WorkFile | null>((r) => (land = r))
    carrying.set(h.id, { stop, done })
    return { h, file: list[i], stop, land }
  })
  await pool(jobs, FILES_AT_ONCE, async ({ h, file, stop, land }) => {
    try {
      if (stop.signal.aborted) return land(null)
      const bucket = await workspace(via.api, org)
      const objectKey = chatKey(file)
      await upload(via.api, bucket, objectKey, file, (sent) => patch(key, h.id, { sent }), stop.signal)
      const got = await register(via.api, bucket, objectKey)
      local.set(got.id, h.href)
      patch(key, h.id, fromFile(got))
      watch(via.api, got, key, h.id)
      land(got)
    } catch (e) {
      if (!stop.signal.aborted) patch(key, h.id, { state: 'failed', error: (e as Error)?.message || `${file.name} did not upload.` })
      land(null)
    }
  })
}

/**
 * Puts files already in the workspace into this conversation — Drive's "Ask in
 * chat". Nothing is uploaded; each is followed if its ingest has not settled.
 */
export function attach(key: string, list: readonly WorkFile[], via: Via): void {
  const taken: Held[] = list.map((f) => ({ id: mint('h'), name: f.name, size: f.size, type: f.type, href: '', state: f.status, sent: 1, file: f }))
  edit(key, (was) => ({ ...was, held: [...was.held.filter((h) => !list.some((f) => f.id === h.file?.id)), ...taken], refused: null }))
  taken.forEach((h) => {
    carrying.set(h.id, { stop: new AbortController(), done: Promise.resolve(h.file ?? null) })
    if (h.file) watch(via.api, h.file, key, h.id)
  })
}

/** The workspace file a held file became, once its upload settles; null when it did not. */
export function landed(h: Held): Promise<WorkFile | null> {
  if (h.file) return Promise.resolve(h.file)
  return carrying.get(h.id)?.done ?? Promise.resolve(null)
}

/**
 * Asks for files and holds what is given.
 *
 * The picker is the browser's, minted and dropped per press rather than kept as
 * a hidden input in the markup: a menu row is not a form control, and an
 * `<input type=file>` parked in the tree is one more thing for a screen reader
 * to walk past.
 */
export function take(key: string, via: Via): void {
  if (typeof document === 'undefined') return
  const ask = document.createElement('input')
  ask.type = 'file'
  ask.multiple = true
  ask.onchange = () => void hold(key, Array.from(ask.files ?? []), via)
  ask.click()
}

/**
 * Hands over everything held to go with a message, and lets go of it.
 *
 * The turn carries each file by reference from here. The object URLs are left
 * standing, so a tab already open on one keeps showing it, and an upload still
 * running keeps running: the turn names the file it lands as.
 */
export function spend(key: string): Held[] {
  const was = read(key)
  if (!was.held.length && !was.refused) return []
  write(key, { ...was, held: [], refused: null })
  return was.held
}

/** Lets go of a file: stops its upload if it is still going, and drops the handle the browser minted. */
export function drop(key: string, id: string): void {
  edit(key, (was) => {
    const going = was.held.find((h) => h.id === id)
    if (!going) return was
    carrying.get(id)?.stop.abort()
    carrying.delete(id)
    if (going.href) {
      if (going.file) local.delete(going.file.id)
      URL.revokeObjectURL(going.href)
    }
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
