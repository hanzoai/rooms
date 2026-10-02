'use client'

// A room, mounted under whatever router the host gave `<Rooms>`.
//
// THE ROUTER LIVES HERE, and only here. `Workspace` takes navigation as a prop
// rather than importing one, so the shell and everything under it name no
// framework — the same components mount under Next, under Vite in a desktop
// webview, or under a test.
//
// That binding used to be written in each route file, on the reasoning that a
// route is Next's by definition. True, but it made SIX copies of one line, and
// four of them were never written: /board, /drive, /inbox and /work mounted
// `Workspace` with no `navigate`, so the rail rendered and did nothing. A rail
// that silently stops working on two thirds of the site is what a repeated
// binding buys. One copy cannot be forgotten in four places.

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Workspace, type Mode } from './Shell'
import { Orgs } from './Orgs'
import { rememberDestination } from './lib/destination'
import { away } from './lib/host'
import { useHost } from './lib/hostname'
import { link } from './lib/tags'
import { useRooms } from './host'

export function Room({ mode, children }: { mode: Mode; children: ReactNode }) {
  const { router } = useRooms()
  // A sign-in leaves for the issuer and returns to a FIXED callback that knows
  // nothing of the room the reader was in. So the room is written down here,
  // the one place the app meets the router, and the trip `Orgs` starts for a
  // signed-out reader returns HERE — address, `?q=` and all — rather than to
  // the host's landing.
  useEffect(() => {
    rememberDestination()
  }, [])
  // THE APEX KEEPS THE APP AND THE WORKSPACE KEEPS ITS ROOMS. A room asked for
  // on hanzo.ai is the same path and query on hanzo.team, and the location is
  // replaced with it once React owns the page: the export is static, so nothing
  // earlier knows the host. The room draws nothing while it leaves, so `Orgs`
  // never starts a sign-in on the host being left.
  const host = useHost()
  const here = host ? window.location : null
  const to = here ? away(host, `${here.pathname}${here.search}${here.hash}`) : null
  useEffect(() => {
    if (to) window.location.replace(link(to))
  }, [to])
  if (to) return null
  // A session comes first, then the organization: nothing of the workspace is
  // drawn until the reader has signed in at hanzo.id, belongs to an
  // organization that is paid for, and has picked the one they are working in.
  // Going to a room from the apex is going to hanzo.team, in this tab.
  return (
    <Orgs>
      <Workspace
        mode={mode}
        navigate={(route) => {
          // A page of another origin — hanzo.ai's from hanzo.team — is a
          // document load, not a client route the host's router can take.
          if (/^https?:\/\//.test(route)) return window.location.assign(link(route))
          const to = away(window.location.hostname, route)
          if (to) window.location.assign(link(to))
          else router.push(route)
        }}
        back={() => router.back()}
        forward={() => router.forward()}
      >
        {children}
      </Workspace>
    </Orgs>
  )
}
