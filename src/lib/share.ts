/**
 * Sharing a conversation by link.
 *
 * The platform makes a read-only link to one conversation and answers its token
 * once (github.com/hanzoai/agent share.go, under /v1/agent/chat). It keeps only
 * the token's hash, so the token is held here, in this person's browser, for
 * the conversation it opens — `own()` in lib/auth/session.ts removes it with
 * every other `hanzo*` key when a different person signs in.
 *
 * A shared chat opens for its owner and for the people who open the link signed
 * in, and for nobody else. A reader who is not signed in is told the title and
 * asked to sign in; a signed-in reader is recorded as a viewer the owner can
 * see, reads the chat, and finds it afterwards under Shared with you, read by
 * its share id (`/chat/shared?s=<id>`) with no token at all. The token names a
 * chat and authenticates nobody: every read carries the reader's own bearer.
 *
 * The token rides the address as the FRAGMENT (`/chat/shared#<token>`), which a
 * browser never sends to any server. It leaves the address before anything on
 * the page can read it: `SEAL`, the first script in the document head, moves it
 * into this tab's sessionStorage and replaces the address with one that has no
 * fragment, before the analytics and ad tags configure themselves. It reaches
 * the platform only in a request body, and survives the sign-in round trip in
 * sessionStorage — never back in an address.
 */

import { api } from './api'
import { live, scope } from './session'

/** The page a shared conversation is read on. */
export const SHARED = '/chat/shared'

/** Where this tab holds a link's token between opening it and reading it. */
export const OPENING = 'hanzo:share:open'

/**
 * The document-head script that takes a share token out of the address. On any
 * spelling of /chat/shared with a fragment — and on any page whose fragment has
 * a share token's shape, the not-found page included — the fragment goes to
 * sessionStorage (and to `window.hzShare` for a browser that refuses storage)
 * and the address is replaced by the same path and query with no fragment. It
 * runs as the document is parsed and again on every `hashchange` and
 * `popstate`, with its listeners registered before any tag's, so a link pasted
 * into an open tab is taken out before a tag's own history listener reads the
 * address. First in the head, so no tag and no module ever sees an address
 * carrying a token.
 */
export const SEAL = `(function(){function s(){try{var l=location,h=l.hash;if(h.length<2)return;var t=h.slice(1);try{t=decodeURIComponent(t)}catch(_){}var p=l.pathname.toLowerCase().replace(/\\/+/g,'/').replace(/\\/index\\.html$/,'').replace(/\\.html$/,'').replace(/\\/$/,'');if(p!=='${SHARED}'&&!/^[A-Za-z0-9_-]{43}$/.test(t))return;window.hzShare=t;try{sessionStorage.setItem('${OPENING}',t)}catch(_){}history.replaceState(null,'',l.pathname+l.search)}catch(_){}}s();addEventListener('hashchange',s);addEventListener('popstate',s)})()`

/** `SEAL` for a fragment the head's listeners did not take: the token goes to
 *  this tab and the address loses the fragment. */
export function take(): void {
  try {
    const hash = window.location.hash
    if (hash.length < 2) return
    let token = hash.slice(1)
    try {
      token = decodeURIComponent(token)
    } catch {
      /* a malformed escape: the fragment as written */
    }
    ;(window as { hzShare?: string }).hzShare = token
    try {
      window.sessionStorage.setItem(OPENING, token)
    } catch {
      /* held on the window for this page */
    }
    history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {
    /* a browser that refuses history: the head script already tried */
  }
}

/** The address that opens a share, on this origin unless told otherwise. */
export function link(token: string, origin: string = window.location.origin): string {
  return `${origin}${SHARED}#${token}`
}

/** The address a viewer reads a chat shared with them at, without the token. */
export function address(share: string): string {
  return `${SHARED}?s=${encodeURIComponent(share)}`
}

/** A token this tab is holding for a link it opened and has not read yet, or ''. */
export function opening(): string {
  if (typeof window === 'undefined') return ''
  try {
    const held = window.sessionStorage.getItem(OPENING)
    if (held) return held
  } catch {
    /* a browser that refuses storage: the head left it on the window */
  }
  return (window as { hzShare?: string }).hzShare ?? ''
}

/** Forget the token this tab was holding, once the link has been read. */
export function opened(): void {
  try {
    window.sessionStorage.removeItem(OPENING)
  } catch {
    /* nothing held */
  }
  delete (window as { hzShare?: string }).hzShare
}

/** One signed-in person who opened a link, as its owner sees them. */
export interface Viewer {
  id: string
  name: string
  openedAt: string
}

/** One live link to a conversation, as its owner sees it. */
export interface ShareRow {
  id: string
  access: 'read'
  createdAt: string
  viewers: Viewer[]
}

/** One turn of a shared conversation. `model` is set on an assistant turn the
 *  platform stored from that model's completion, and absent on a turn the
 *  person who shared the chat recorded. */
export interface SharedTurn {
  role: 'user' | 'assistant'
  content: string
  model?: string
  createdAt?: string
}

/** A shared conversation as the platform answers it: the whole snapshot for a
 *  signed-in reader who opened it, the title alone for anyone else. */
export interface Shared {
  /** The share's id, for a signed-in reader: where they read it again. */
  share?: string
  title: string
  /** Who shared it, as they signed in: for a signed-in reader. */
  by?: string
  /** Set for a signed-in reader who has not opened this link yet: opening it
   *  records them as a viewer, and the person who shared it sees their name. */
  confirm?: boolean
  access: 'read'
  full: boolean
  messages: SharedTurn[]
}

/** One chat shared with the reader, and who shared it. */
export interface SharedItem {
  share: string
  title: string
  by: string
  openedAt: string
}

/** A refusal, carrying the platform's own sentence and status. */
export class Refused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** The sentence a refusal carries, or one in plain words when it carries none. */
function sentence(body: unknown, status: number): string {
  const b = (body ?? {}) as { detail?: unknown; error?: unknown; message?: unknown }
  const said = [b.detail, typeof b.error === 'object' ? (b.error as { message?: unknown })?.message : b.error, b.message].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  )
  if (said) return said
  if (status === 401 || status === 403) return 'Sign in again to manage sharing.'
  if (status >= 500) return 'Sharing is not answering right now. Try again shortly.'
  return 'That did not work. Try again.'
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(`${api()}${path}`, init)
  const text = await r.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!r.ok) throw new Refused(sentence(body, r.status), r.status)
  return body as T
}

const base = (thread: string) => `/v1/agent/chat/conversations/${encodeURIComponent(thread)}/shares`

/** The owner's side: make, list and revoke the links to one conversation, and
 *  remove one viewer from a link. */
export const shares = {
  list: async (thread: string): Promise<ShareRow[]> =>
    (await call<{ shares?: ShareRow[] }>(base(thread), { headers: scope() })).shares ?? [],
  make: (thread: string): Promise<{ share: ShareRow; token: string }> =>
    call(base(thread), { method: 'POST', headers: { 'Content-Type': 'application/json', ...scope() }, body: '{}' }),
  revoke: (thread: string, id: string): Promise<unknown> =>
    call(`${base(thread)}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: scope() }),
  unview: (thread: string, id: string, viewer: string): Promise<unknown> =>
    call(`${base(thread)}/${encodeURIComponent(id)}/viewers/${encodeURIComponent(viewer)}`, { method: 'DELETE', headers: scope() }),
}

/** The reader's bearer and the organization they are working in: an owner who
 *  opens their own link from the organization they shared it in is its owner
 *  there, and not a viewer of it. Nothing about the reader's organization is
 *  read or changed. */
function reader(): Record<string, string> {
  if (!live()) return {}
  const h = scope()
  return h.Authorization ? h : {}
}

/** Open a link, or null when it opens nothing (never made, revoked, or closed
 *  to this reader). `open` is the reader's go-ahead to be recorded as a viewer,
 *  given after they were told who shared it and that their name is shown. */
export async function read(token: string, open = false): Promise<Shared | null> {
  try {
    return await call<Shared>('/v1/agent/chat/shares/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...reader() },
      body: JSON.stringify({ token, open }),
    })
  } catch (e) {
    if (e instanceof Refused && e.status === 404) return null
    throw e
  }
}

/** Read a chat shared with the reader by its share id, or null when it is no
 *  longer open to them. */
export async function readShared(share: string): Promise<Shared | null> {
  try {
    return await call<Shared>(`/v1/agent/chat/shared/${encodeURIComponent(share)}`, { headers: reader() })
  } catch (e) {
    if (e instanceof Refused && e.status === 404) return null
    throw e
  }
}

/** The chats shared with the reader, most recently opened first. */
export async function sharedWithMe(): Promise<SharedItem[]> {
  return (await call<{ shared?: SharedItem[] }>('/v1/agent/chat/shared', { headers: reader() })).shared ?? []
}

/** Where this browser keeps the token of the link it last made for a conversation. */
const held = (thread: string) => `hanzo:share:${thread}`

/** The link this browser holds for a conversation, if its share is still live. */
export function heldToken(thread: string, live: ShareRow[]): { id: string; token: string } | null {
  try {
    const raw = window.localStorage.getItem(held(thread))
    const got = raw ? (JSON.parse(raw) as { id?: string; token?: string }) : null
    if (got?.id && got.token && live.some((s) => s.id === got.id)) return { id: got.id, token: got.token }
  } catch {
    /* nothing held, or a store that refuses */
  }
  return null
}

/** Hold a new link's token for its conversation; null forgets it. */
export function hold(thread: string, value: { id: string; token: string } | null): void {
  try {
    if (value) window.localStorage.setItem(held(thread), JSON.stringify(value))
    else window.localStorage.removeItem(held(thread))
  } catch {
    /* the link still works; this browser just cannot copy it again */
  }
}
