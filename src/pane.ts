'use client'

// What a conversation is holding for its next message, PER CONVERSATION: the
// files on their way to the workspace and why any were refused. The panel's
// tabs are @hanzo/build's (`useDeck`), kept per conversation under the same key
// (`channel`).
//
// The store lives outside React for the reason `open.ts` gives: the router
// mounts the rooms, so anything kept inside one is destroyed by a route change.
// It is NOT written down: a file picked off the reader's own disk is an object
// URL, which the browser revokes with the document that minted it, so a kept
// row would come back as a name pointing at nothing.
//
// ONE WAY IN FOR A FILE. The composer's paperclip, a drop on the room, a paste
// into the field and the Sources tab's `+` all call `hold`, so a file goes up by
// one road (`lib/files`: straight to the org's workspace, in parts when it is
// large), shows as a chip over the field and a row under Sources at once, and
// goes with the next message by reference. Sending spends what is held; from
// then on the turn itself is the record Sources reads.

import { useSyncExternalStore } from 'react'
import { chatKey, follow, pool, register, settled, upload, workspace, type Api, type WorkFile } from './lib/files'

/**
 * A file put into this conversation, on its way to the workspace or already
 * there, waiting to go with the next message.
 *
 * `href` is an object URL and is the reason this is never written down. A name
 * and a size are the file system's, or the workspace file's, never a guess.
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

/** What one conversation holds for its next message. */
export interface Pane {
  held: Held[]
  /** Why the last files offered were refused, in the reader's words, or null. */
  refused: string | null
}

/** A pane nobody has touched. Shared, and never mutated — see `EMPTY` in
 *  `open.ts` for why a fresh object per read is an infinite render. */
const BARE: Pane = { held: [], refused: null }

/**
 * The conversation a pane belongs to.
 *
 * THREE FIELDS AND NOT ONE, because `open.ts` already refuses to conflate them:
 * an inbox room arrives over a transport and is keyed by it, a thread is a
 * conversation the org has recorded, and an agent is who you are talking to
 * before a thread exists. Prefixed so a room called `x` and a thread called `x`
 * cannot land on one entry. `new` is a room nobody has spoken in yet.
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

const read = (key: string): Pane => live.get(key) ?? BARE

/** The server renders nothing held, so every pane starts bare there. */
const onServer = (): Pane => BARE

function write(key: string, next: Pane): void {
  live.set(key, next)
  announce()
}

/** Applies a change to one conversation's pane. */
function edit(key: string, change: (was: Pane) => Pane): void {
  write(key, change(read(key)))
}

let minted = 0
const mint = (prefix: string) => `${prefix}${Date.now().toString(36)}${(minted++).toString(36)}`

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
