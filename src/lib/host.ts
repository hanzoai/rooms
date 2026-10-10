/**
 * Which host this export is read on, what that host keeps, and the app's
 * addresses — the one module that writes and reads them.
 *
 * hanzo.ai is the site for a stranger and the app for a member: the web app is
 * /chat and /dev once signed in, and `/` takes a member to the mode they were
 * last in. hanzo.team is the workspace, its own app (hanzo-apps/team) with Home
 * at its root. This export still carries the rooms, so a room asked for on the
 * apex is sent to the same room on hanzo.team, and `output: 'export'` has no
 * server to do that, so it is decided in the browser off the hostname, here.
 *
 * Two predicates, one per product: `apex()` for the app, `team()` for the
 * workspace. Every host that is neither (localhost, a preview) draws the whole
 * workspace and admits the way the apex does.
 */

import APP from './rooms.json' with { type: 'json' }
import { href, parse, path, route, SESSION, SLUG } from '@hanzo/build/route'
import { site } from '../where'

/** The workspace's own address. */
export const WORKSPACE = 'https://hanzo.team'

/**
 * The workspace, signed in. hanzo.team keeps its own session (its own origin's
 * storage), so a reader signed in here arrives there signed out and is shown the
 * landing. `?signin` asks it to start the sign-in on arrival instead; hanzo.id
 * answers at once for a browser already signed in there, so the reader lands in
 * the workspace with nothing to press.
 */
export const ENTRY = `${WORKSPACE}/?signin`

/**
 * Where a business signs up for Hanzo Team: hanzo.team's /start. Email or a
 * provider at hanzo.id, then the team's name, invitations and seats, then the
 * Team plan's checkout — on the workspace's own origin, which is where the new
 * team's session has to live.
 */
export const START = `${WORKSPACE}/start`

/**
 * THE APP'S ADDRESSES ARE PATHS, in two modes at two roots. Chat is /chat, a
 * new conversation, and /chat/<id> one of the reader's. Dev is /dev, Dev's New,
 * and every place of @hanzo/build's builder is a path under it, written and
 * read by `href`/`parse` (@hanzo/build/route): /dev/run/<id>, /dev/projects,
 * /dev/projects/<org>/<repo> a repository, /dev/projects/<slug> a deployed
 * site, /dev/issues, /dev/artifacts, /dev/templates, /dev/automations[/<id>],
 * /dev/machines, /dev/environments, /dev/customize[/<tab>],
 * /dev/settings[/<section>], /dev/plans. The export holds one page per root,
 * /chat and /dev, and the edge serves it for every path under it (hanzo.ai's
 * lib/edge.ts `APP`), so every address reloads.
 */
export const CHAT = '/chat'
export const DEV = '/dev'

/** Chat on a conversation, or /chat itself for a new one. */
export const talk = (id?: string | null): string => (id ? `${CHAT}/${encodeURIComponent(id)}` : CHAT)

/** Dev at a builder address (`route` in @hanzo/build); '' is New, /dev. What is not an address is New. */
export const app = (at: string): string => DEV + href(route(at))

/** A place in the app: Chat on a conversation or none, or Dev at a builder address. */
export type Place = { mode: 'chat'; thread: string | null } | { mode: 'dev'; at: string }

/** /chat/shared is a page of its own, where a chat shared by link is read (lib/share.ts). */
const SHARED = 'shared'

/** The place a path names, or null when it names none of the app's. */
export function place(pathname: string): Place | null {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === CHAT) return { mode: 'chat', thread: null }
  if (p === DEV || p.startsWith(`${DEV}/`)) return { mode: 'dev', at: path(parse(p.slice(DEV.length))) }
  if (!p.startsWith(`${CHAT}/`)) return null
  const id = p.slice(CHAT.length + 1)
  if (id.includes('/') || id === SHARED) return null
  try {
    return { mode: 'chat', thread: decodeURIComponent(id) }
  } catch {
    return null
  }
}

/** An address as analytics counts it: a record folded to its kind, so every conversation is one page. */
export function page(pathname: string): string {
  const at = place(pathname)
  if (!at) return pathname
  if (at.mode === 'chat') return at.thread ? `${CHAT}/:id` : CHAT
  const r = route(at.at)
  if (r.kind === 'run') return `${DEV}/run/:id`
  if (r.kind === 'repo') return `${DEV}/projects/:org/:repo`
  if (r.kind === 'project') return `${DEV}/projects/:slug`
  if (r.kind === 'automation' && r.id !== 'new') return `${DEV}/automations/:id`
  return DEV + href(r)
}

/** A repository on the forge, `<org>/<name>`. */
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/**
 * Dev opened on one run, repository or site, from anywhere: every "Try Hanzo
 * Dev" link, a room's Dev, the console's "open in the builder". It signs a
 * stranger in on the way (app/(app)/dev/_door.tsx), and is reached through
 * `site()`: here on hanzo.ai, across to hanzo.ai from hanzo.team. Only a value
 * that is exactly a session id, a repository or a site's slug is carried;
 * anything else opens /dev itself, so no caller can make this name another
 * address.
 */
export const dev = (ref?: string | null): string => site(app(ref && (SESSION.test(ref) || REPO.test(ref) || SLUG.test(ref)) ? ref : ''))

/**
 * Move the app to an address of this page: a history entry, or in place of this
 * one. No document load and no route change — the Next router folds a native
 * history entry into `usePathname`, so the app follows the path it reads.
 */
export function go(address: string, replace = false): void {
  if (`${window.location.pathname}${window.location.search}` === address) return
  if (replace) window.history.replaceState(null, '', address)
  else window.history.pushState(null, '', address)
}

/** Where this browser keeps the mode its reader was last in. */
const MODE = 'hanzo.app.mode'

/** Keep the mode the reader is in, for `resume`. */
export function remember(mode: Place['mode']): void {
  try {
    window.localStorage.setItem(MODE, mode)
  } catch {
    /* no store: `/` opens Chat */
  }
}

/** Where `/` takes a member: the mode they were last in, Chat when none is kept. */
export function resume(): string {
  try {
    return window.localStorage.getItem(MODE) === 'dev' ? DEV : CHAT
  } catch {
    return CHAT
  }
}

/** The routes under app/(app) the apex keeps: the app — /chat, a chat shared by link, and /dev. */
const KEPT = new Set(['/chat', '/chat/shared', '/dev'])

/** Settings, and every page under it: the person's and the organization's, served wherever the app is. */
const SETTINGS = '/settings'

/**
 * The workspace's rooms: every route under app/(app) the apex does not keep.
 *
 * Derived from the tree `scripts/sync-rooms.mjs` walks, so a room added under
 * app/(app) lives on hanzo.team unless the apex names it above.
 */
export const ROOMS: readonly string[] = APP.filter(
  (path) => !KEPT.has(path) && path !== SETTINGS && !path.startsWith(`${SETTINGS}/`),
)

/** The apex's hosts, where the app is served and the rooms are not. */
export const APEX: readonly string[] = ['hanzo.ai', 'www.hanzo.ai']

/** Whether a host is the apex. */
export const apex = (hostname: string): boolean => APEX.includes(hostname)

/** Whether a host is the workspace's own, where every room asks for a paid plan. */
export const team = (hostname: string): boolean => hostname === 'hanzo.team' || hostname === 'www.hanzo.team'

/** Whether an address on this export, query and all, opens one of the workspace's rooms. */
export function room(address: string): boolean {
  const path = address.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return ROOMS.includes(path)
}

/**
 * Where an address belongs when it is asked for on `hostname`: on a `guest`
 * alias, the same address on hanzo.ai, because every room signs in and a guest
 * host cannot; on the apex, the same room and query on the workspace; otherwise
 * null. Home is the workspace's root, so /home?room=x lands on /?room=x.
 */
export const away = (hostname: string, address: string): string | null => {
  if (guest(hostname)) return SIGNIN + address
  if (!apex(hostname) || !room(address)) return null
  const home = address.match(/^\/home\/?(?=[?#]|$)/)
  return home ? `${WORKSPACE}/${address.slice(home[0].length)}` : `${WORKSPACE}${address}`
}

/** Where a sign-in started on a `guest` host is finished. */
export const SIGNIN = 'https://hanzo.ai'

/**
 * The Hanzo App, to get: the page with Download, Install CLI and Open in web.
 * It is this export's /app, served as the root of hanzo.app (universe
 * static-sites `hanzo-app`), so it is linked by that address and hanzo.ai/app
 * forwards there.
 */
export const GET = 'https://hanzo.app'

/**
 * The app, opened from another host: the chat at hanzo.ai/chat. A reader who
 * is signed out is asked to sign in there, on hanzo.ai's own page, and lands
 * back in the chat.
 */
export const WEB = `${SIGNIN}${CHAT}`

/**
 * Whether a host serves this export and signs nobody in: hanzo.app, whose root
 * is the page above; every `<slug>.hanzo.app` alias the Sites plane serves it
 * at; and hanzo.chat, whose root is /forward. hanzo.app is a namespace
 * customers publish into and hanzo.chat is only an address for the chat, so no
 * sign-in runs under either: every address that needs one is the same address
 * on hanzo.ai.
 */
export const guest = (hostname: string): boolean =>
  hostname === 'hanzo.app' || hostname.endsWith('.hanzo.app') || hostname === 'hanzo.chat'
