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
import type { BillingPlan } from './lib/plans'
import type { Integration } from './lib/integrations'

/** A link the host's router owns: next/link under Next, an anchor elsewhere. */
export type Link = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }>

export interface Router {
  push(href: string): void
  replace(href: string): void
  back(): void
  forward(): void
}

/** The addresses a host serves from, which plain modules read. */
export interface Addresses {
  /** The gateway's origin. Absent, the rooms derive it from the page's host. */
  api?: string
  /** IAM's origin. Absent, hanzo.id. */
  iam?: string
  /**
   * Where the app's own pages live — `/dev`, `/account`, `/legal/*`.
   * Empty on the site that serves them; `https://hanzo.ai` on hanzo.team.
   */
  site: string
  /** The rooms' Home: `/home` beside the app, `/` on hanzo.team. */
  home: string
  /** Where a new account starts: `/signup`, or hanzo.team's `/start`. */
  signUp: string
  /** The publishable key anonymous calls carry. */
  key?: string
  /** The plan catalogue as the host's build last read it: the first paint. */
  plans?: BillingPlan[]
  /** The SDKs and frameworks Directory lists, which the host publishes. */
  integrations?: Integration[]
  /**
   * The host's front door, for a workspace rooted at `/` (hanzo.team): what a
   * stranger at Home is shown instead of the sign-in, and the business sign-up
   * `/start` draws. A host without one gets the sign-in.
   */
  Landing?: ComponentType<{ member?: boolean }>
  Signup?: ComponentType
}

let addresses: Addresses = { site: '', home: '/home', signUp: '/signup' }

/**
 * State the host's addresses, at module scope, before anything renders. Each
 * call adds to what is stated, so a host can name its cheap addresses at its
 * root and the heavy ones (the plan catalogue, the integrations) only where the
 * rooms are drawn.
 */
export function configure(given: Partial<Addresses>): void {
  addresses = { ...addresses, ...given }
}

/** The host's addresses, for code that runs outside a component. */
export const where = (): Addresses => addresses

/** A page of the app's own, from wherever the rooms are mounted. */
export const site = (path: string): string => `${addresses.site}${path}`

interface Moving {
  router: Router
  search: URLSearchParams | null
  route: string
  Link: Link
}

export interface RoomsProps extends Moving {
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
  return useAppearance({
    org: org.id,
    account: { base: (addresses.iam ?? 'https://hanzo.id').replace(/\/+$/, ''), token: accessToken ?? undefined },
  })
}

/** The look, applied on every surface that mounts the rooms. */
function Look() {
  useLook()
  return null
}

export function Rooms({ router, search, route, Link, children }: RoomsProps) {
  return (
    <Context.Provider value={{ router, search, route, Link }}>
      <Look />
      {children}
    </Context.Provider>
  )
}
