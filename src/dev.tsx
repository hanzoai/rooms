'use client'

// The web app's host: everything @hanzo/build's `<Builder>` needs from hanzo.ai,
// as values, so the builder imports neither IAM nor a router. hanzo.build's own
// host (hanzoai/build `src/app/root.tsx`) is the other one, and this answers
// each field the way that one does — who is signed in, the organizations they
// belong to and the one they work in, the theme, where the address is, and how
// to leave. The name drawn at the top left is Hanzo Dev: this host is the
// dev agent. Chat, on the rooms shell, is Hanzo AI.
//
// THE ADDRESS IS THE PATH. Dev is `/dev`, and what it shows is the path under
// it in the builder's own grammar (lib/host.ts `app`, `under`), so a run, a
// screen, a Settings section, a Customize tab, the plans and a project all
// survive a reload, and Back steps through them. A move is a native history
// entry, which the Next router folds into `usePathname`, so reading the address
// and moving it are one path.

import { useMemo } from 'react'
import { useLook, useRooms } from './host'
import { useIam } from '@hanzo/iam/react'
import { useSignOut } from './lib/signout'
import { administers, path, route, type Host } from '@hanzo/build'
import { bearer, named, org, orgs, pick } from './lib/session'
import { enter } from './lib/destination'
import { api } from './lib/api'
import { app, under } from './lib/host'
import { link } from './lib/tags'

/** Where the builder links out: every one of them an address of this site. */
const LINKS: Host['links'] = {
  github: app('-/sync'),
  customize: app('-/customize'),
  settings: app('-/settings'),
  home: '/',
}

/** The person's theme, when they have chosen one the builder can name. */
const theme = (t: string | undefined): Host['theme'] => (t === 'light' || t === 'dark' || t === 'system' ? t : undefined)

/** The app address a builder path names, canonical; '' for anything that is not one. */
const canonical = (at: string | null): string => path(route(at ?? ''))

/** The host for a signed-in reader. */
export function useDevHost(): Host {
  const { user, accessToken } = useIam()
  const logout = useSignOut()
  const { router, path: pathname } = useRooms()
  const here = canonical(under(pathname))
  const look = useLook()

  // The token's claims change only when the token does: a sign-in, a refresh.
  const memberships = useMemo(() => orgs(), [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps
  const scoped = useMemo(() => org(), [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps
  const claimed = useMemo(() => named(), [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const u = user as { displayName?: string; name?: string; email?: string; avatar?: string } | null
  const name = u?.displayName || u?.name || claimed?.name || ''
  const email = u?.email || claimed?.email || ''
  const avatar = typeof u?.avatar === 'string' && u.avatar.startsWith('https://') ? u.avatar : ''

  return useMemo<Host>(
    () => ({
      name: 'Hanzo Dev',
      api: api(),
      token: bearer,
      org: scoped,
      memberships,
      // Scope this browser to one of the token's organizations and open Dev's
      // New in it: a run or a project read under the last one is not this one's.
      chooseOrg: (next) => {
        if (!orgs().includes(next)) return
        pick(next)
        window.location.assign(app(''))
      },
      theme: theme(look.pref.theme),
      chooseTheme: (t) => look.set({ theme: theme(t) }),
      person: { name, email, avatar },
      admin: administers(bearer(), scoped),
      path: here,
      go: (to, how) => {
        const next = app(canonical(to))
        if (window.location.pathname === next && !window.location.search) return
        if (how?.replace) window.history.replaceState(null, '', next)
        else window.history.pushState(null, '', next)
      },
      links: LINKS,
      // An address of this site moves in the router; another origin is left in
      // this tab. platform.hanzo.ai is another product, and a click that names
      // it stays here — everything the builder had it for is in its Settings.
      open: (href) => {
        let url: URL
        try {
          url = new URL(href, window.location.origin)
        } catch {
          return
        }
        if (url.hostname === 'platform.hanzo.ai') return
        if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`)
        else window.location.assign(link(url.href))
      },
      signIn: () => enter(),
      signOut: () => void logout(),
    }),
    [scoped, memberships, look.pref.theme, look.set, name, email, avatar, here, router, logout],
  )
}
