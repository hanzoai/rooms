/**
 * Which host this export is read on, and what that host keeps.
 *
 * hanzo.ai is the site for a stranger and the app for a member: the web app is
 * `/` once signed in (app/page.tsx), beside /chat. hanzo.team is the
 * workspace, its own app (hanzo-apps/team) with Home at its root. This export
 * still carries the rooms, so a room asked for on the apex is sent to the same
 * room on hanzo.team, and `output: 'export'` has no server to do that, so it is
 * decided in the browser off the hostname, here.
 *
 * Two predicates, one per product: `apex()` for the app, `team()` for the
 * workspace. Every host that is neither (localhost, a preview) draws the whole
 * workspace and admits the way the apex does.
 */

import APP from './rooms.json' with { type: 'json' }
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
 * The web app, at `/` for a signed-in reader, in two modes. Chat is the default.
 * Dev is @hanzo/build's `<Builder>`, and what it shows rides ONE query, `?at=`,
 * in the builder's own grammar (`route` in @hanzo/build): '' New, `sess_<id>` a
 * run, `-/<screen>`, `-/settings[/<section>]`, `-/customize[/<tab>]`,
 * `-/plans`, `<slug>` a project. A query and not a path, because a static
 * export has no server to answer a path under `/`.
 */
export const AT = 'at'

/** `/` in Dev at an app address; '' is Dev's New, `/?at=`. The key is the mode. */
export const app = (path: string): string => `/?${AT}=${path}`

/**
 * Chat, the app's default mode: `/` is a new conversation and `?chat=<id>` one
 * of the reader's. So the address says which mode the app is in — `at` for Dev,
 * anything else Chat — and a reload keeps it.
 */
export const TALK = 'chat'

/** `/` in Chat, on a conversation, or `/` itself for a new one. */
export const talk = (id?: string | null): string => (id ? `/?${TALK}=${encodeURIComponent(id)}` : '/')

/**
 * The door into the app: every "Try Hanzo Dev" link, the rail's Dev, the
 * console's "open in the builder", dev.hanzo.ai. It signs a stranger in and
 * forwards a member to Dev in the app, `/?at=` (app/(app)/dev/_door.tsx). It is
 * the app's page, so it is reached through `site()`: here on hanzo.ai, across
 * to hanzo.ai from hanzo.team.
 */
const DEV = '/dev'

/** A run, as the platform mints its id. */
const SESSION = /^sess_[0-9a-f]{32}$/

/** A project, as the Sites plane slugs it. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

/**
 * The door opened on one run or project: `?run=` or `?project=`, the query the
 * door turns into `?at=` — and the one the console and shared links already
 * carry. Only a value that is exactly a session id or a project slug is
 * carried; anything else opens /dev itself, so no caller can make this name
 * another address.
 */
export const dev = (ref?: string | null): string =>
  site(!ref ? DEV : SESSION.test(ref) ? `${DEV}?run=${ref}` : SLUG.test(ref) ? `${DEV}?project=${ref}` : DEV)

/** The routes under app/(app) the apex keeps: the app — /chat, a chat shared by link, and /dev — and three surfaces that are not the workspace's. */
const KEPT = new Set(['/chat', '/chat/shared', '/dev', '/vibe', '/beluga', '/dashboard'])

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
export const WEB = `${SIGNIN}/chat`

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
