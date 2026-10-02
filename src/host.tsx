'use client'

/**
 * What a host tells the rooms.
 *
 * The rooms name no framework and no site. Everything that differs between the
 * surfaces that mount them arrives here, in two halves, because two kinds of
 * caller read them:
 *
 *   configure({ site: 'https://hanzo.ai', home: '/', signUp: '/start' })
 *
 *   <Rooms router={useRouter()} search={useSearchParams()} route={route} Link={Link}>
 *     <Room mode="cal" />
 *   </Rooms>
 *
 * The ADDRESSES — where the app's pages live, which gateway and IAM to talk to,
 * the plan catalogue to paint first — do not change while the page is open, and
 * plain modules (`api()`, `iam()`, `site()`, the plan reads) call them outside
 * any component and on pages the rooms never draw. So the host states them once
 * with `configure()`, in a module its root imports, before anything renders.
 *
 * The ROUTER, the query and the route change as the page moves, so they ride
 * React context, and a room reads them with `useRooms()`.
 */

import { createContext, useContext, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from 'react'
import { useIam, useOrganizations } from '@hanzo/iam/react'
import { useAppearance } from '@hanzo/appearance'
import { where } from './where'

/** A link the host's router owns: next/link under Next, an anchor elsewhere. */
export type Link = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }>

export interface Router {
  push(href: string): void
  replace(href: string): void
  back(): void
  forward(): void
}


interface Moving {
  router: Router
  /** The address's query, for the rooms that read one (Dev's `?at=`). */
  search: URLSearchParams | null
  route: string
  Link: Link
}

export interface RoomsProps extends Omit<Moving, 'search'> {
  /** Absent where no mounted room reads the query, so a static export needs no Suspense for it. */
  search?: URLSearchParams | null
  children?: ReactNode
}

const Plain: Link = ({ prefetch: _prefetch, ...rest }) => <a {...rest} />

const Context = createContext<Moving>({
  router: {
    push: (href) => window.location.assign(href),
    replace: (href) => window.location.replace(href),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
  },
  search: null,
  route: '/',
  Link: Plain,
})

/** The router, the query, the route and the link the host mounted the rooms with. */
export const useRooms = (): Moving => useContext(Context)

/** The org in scope, by the id the appearance layers are keyed on. */
export function useOrg(): { id?: string; name?: string } {
  const { currentOrg } = useOrganizations()
  const one = currentOrg as { id?: string; name?: string; displayName?: string } | null
  return { id: one?.id || one?.name, name: one?.displayName || one?.name }
}

/**
 * The person's appearance — theme, type, spacing, corners, accent — resolved
 * for the org in scope and kept with their IAM account, so a choice made here
 * follows them to every Hanzo origin. Every control that changes how the rooms
 * look goes through this, and only this.
 */
export function useLook() {
  const { accessToken } = useIam()
  const org = useOrg()
  // Signed out there is no person to ask about, so IAM is not asked: a stranger
  // passing through a room on the way to sign in sends nothing to the issuer.
  return useAppearance({
    org: org.id,
    account: accessToken ? { base: (where().iam ?? 'https://hanzo.id').replace(/\/+$/, ''), token: accessToken } : undefined,
  })
}

/**
 * The look, applied: mounted once at the host's root, inside its IamProvider,
 * so every page — a room or not — opens in the person's theme and accent and
 * keeps their choice in step with IAM.
 */
export function Look() {
  useLook()
  return null
}

export function Rooms({ router, search = null, route, Link, children }: RoomsProps) {
  return <Context.Provider value={{ router, search, route, Link }}>{children}</Context.Provider>
}
