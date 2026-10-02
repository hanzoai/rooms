/**
 * The host's addresses — where its own pages live, which gateway and IAM to
 * talk to, the plan catalogue to paint first — stated once with `configure()`.
 *
 * A plain module, with no client directive, because plain modules read it:
 * `api()`, `iam()`, `site()` and the plan reads run in server components and
 * outside any component, where a client module's export is only a reference
 * and calling it throws.
 */
import type { ComponentType } from 'react'
import type { BillingPlan } from './lib/plans'
import type { Integration } from './lib/integrations'

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
  /**
   * The product's name, wherever the rooms print it: the sidebar's wordmark,
   * Home's and Chat's titles, the composer's placeholder, the setup. The host's
   * brand by hostname (`@hanzogui/shell/registry`'s `brandName`): `Hanzo Team`
   * on hanzo.team. Default `Hanzo AI`, hanzo.ai's.
   */
  brand?: string
  /** The publishable key anonymous calls carry. */
  key?: string
  /** The plan catalogue as the host's build last read it: the first paint. */
  plans?: BillingPlan[]
  /**
   * The SDKs and frameworks Directory lists, which the host publishes. A loader,
   * so the catalogue — every guide's code, and the model counts it quotes — is
   * fetched when Directory's Apps tab opens, not on every page the rooms frame.
   */
  integrations?: () => Promise<Integration[]>
  /**
   * The host's front door, for a workspace rooted at `/` (hanzo.team): what a
   * stranger at Home is shown instead of the sign-in, and the business sign-up
   * `/start` draws. A host without one gets the sign-in.
   */
  Landing?: ComponentType<{ member?: boolean }>
  Signup?: ComponentType
  /**
   * The rooms are hanzo.team's: every room is behind the per-seat Team plan,
   * and an organization is founded through the team's setup, never the create
   * dialog a person on hanzo.ai uses.
   */
  team?: boolean
  /**
   * The host's funnel call, for a host that counts moments in tags of its own
   * (hanzo.team's GA4 and Pixel boot). Unset, a moment goes to @hanzo/event's
   * tag manager.
   */
  track?: (name: string, params: Record<string, unknown>) => void
}

let addresses: Addresses = { site: '', home: '/home', signUp: '/signup' }

/**
 * State the host's addresses, at module scope, before anything renders. Each
 * call adds to what is stated, so a host can name its cheap addresses at its
 * root and the heavier ones only where the rooms are drawn.
 */
export function configure(given: Partial<Addresses>): void {
  addresses = { ...addresses, ...given }
}

/** The host's addresses, for code that runs outside a component. */
export const where = (): Addresses => addresses

/** The product's name, as the host states it. Read at call time, like every address. */
export const brand = (): string => addresses.brand ?? 'Hanzo AI'

/** A page of the app's own, from wherever the rooms are mounted. */
export const site = (path: string): string => `${addresses.site}${path}`
