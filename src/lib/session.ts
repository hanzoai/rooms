/**
 * WHERE THE SESSION IS KEPT, named once.
 *
 * The @hanzo/iam SDK owns these keys and publishes no reader a plain module can
 * call — `getSession()` needs `configureIam()`, and this app configures through
 * `IamProvider` instead. So the names are restated here, in ONE file, and
 * everything that needs the bearer asks this.
 *
 * That is not a style preference. Four modules restated the name themselves and
 * every one of them got it wrong — they read `hanzo_access_token` while the SDK
 * writes `hanzo_iam_access_token`, so invitations, referrals, coding runs and
 * signed-in telemetry all read null and behaved as if nobody was signed in.
 * Nothing errored: `bearer()` threw "Sign in to manage invitations" at somebody
 * who was signed in, which reads as a permissions problem rather than a typo.
 * Two derivations of one name never agree; this is the one derivation.
 */

import { api } from './api'

/** The SDK's own keys, `hanzo_iam_`-prefixed. The far side of a boundary. */
const PREFIX = 'hanzo_iam_'
const ACCESS = `${PREFIX}access_token`
const REFRESH = `${PREFIX}refresh_token`
const EXPIRES = `${PREFIX}expires_at`
const KEYS = [ACCESS, REFRESH, `${PREFIX}id_token`, EXPIRES]


/**
 * The access token, or null.
 *
 * Guarded because storage THROWS rather than answering null in a browser that
 * refuses it, and a caller reaching for the bearer is usually about to make a
 * request — one that should fail as unauthenticated, not as an exception.
 */
export function bearer(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ACCESS)
  } catch {
    return null
  }
}

/**
 * Whether the stored access token is live: present, and not past the expiry the
 * SDK wrote beside it — the SDK's own fast path (`IAM#getValidAccessToken`)
 * without the refresh, which is a request and cannot be waited for here. No
 * expiry reads as live, as it does in the SDK.
 */
export function live(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const expires = window.localStorage.getItem(EXPIRES)
    return Boolean(bearer()) && (!expires || Date.now() < Number(expires))
  } catch {
    return false
  }
}

/** The attribute on `<html>` that says `/` is showing the app, not the landing. */
export const APP = 'data-app'

/**
 * `live()`, as the script `/` runs as the first child of its landing
 * (app/_apex.tsx `[data-landing]`), before the rest of the landing is parsed
 * (app/page.tsx). A live token marks the document with `APP` and takes the
 * landing off the page at once, so a signed-in reader is never shown the pitch
 * on the way to the app. Same keys, same test. An inline style, because this is
 * decided before any stylesheet or component has run.
 */
export const BOOT = `try{var t=localStorage.getItem('${ACCESS}'),e=localStorage.getItem('${EXPIRES}');if(t&&(!e||Date.now()<Number(e))){document.documentElement.setAttribute('${APP}','');var l=document.currentScript&&document.currentScript.parentElement;if(l&&l.hasAttribute('data-landing'))l.style.display='none'}}catch(_){}`

/**
 * A RETURNING PERSON IS RECOGNISED WITHOUT GOING ANYWHERE.
 *
 * IAM keeps its session cookie on this origin (universe static-sites
 * `iam-on-hanzo-ai`), set when a person signs in on /login or /signup. So those
 * two pages ask IAM first, before drawing a form, with a POST that carries no
 * credential: @hanzo/iam `resume`, which IAM's single sign-on branch answers
 * with a code from the session, or refuses. A code signs the reader in with
 * nothing typed; a refusal draws the form. Nobody is sent to hanzo.id, and no
 * frame is opened.
 *
 * ONCE PER TAB, then never again in it. Only a person's browser asks: a crawler
 * or an automated browser is drawn the form.
 */
const PROBED = 'signin.probed'
/** What names itself a crawler, a preview fetcher or a headless browser. */
const AUTOMATED = /bot|crawl|spider|slurp|preview|lighthouse|headless/i

/**
 * Whether this tab may still ask: a person's browser, and not asked in this tab
 * yet. A browser that refuses storage cannot remember having asked, so it never
 * asks.
 */
export function unasked(): boolean {
  if (typeof window === 'undefined') return false
  if (navigator.webdriver || AUTOMATED.test(navigator.userAgent)) return false
  try {
    return !window.sessionStorage.getItem(PROBED)
  } catch {
    return false
  }
}

/** Spend this tab's ask: it is written down before it is made, so it is made once. */
export function asked(): void {
  try {
    window.sessionStorage.setItem(PROBED, '1')
  } catch {
    /* unasked() already answered no for a browser with no store */
  }
}

/**
 * Whether the browser holds an existing session (stored token, JWT subject,
 * or migration candidate).
 *
 * Guarded against storage exceptions. Used across workspace and marketing
 * headers so a signed-in person never sees "Sign in".
 */
export function hasSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(
      bearer() ||
      subject() ||
      window.localStorage.getItem('hanzo_access_token') ||
      window.localStorage.getItem(WHO) ||
      window.sessionStorage?.getItem(ACCESS)
    )
  } catch {
    return false
  }
}

/**
 * Carry a session across the move from per-tab storage to per-origin.
 *
 * The session used to be held in `sessionStorage`, which is why it did not
 * survive closing a tab. It is `localStorage` now — but everyone already signed
 * in was signed in THERE, and the new build looks HERE, so the fix for "I have
 * to sign in again" would itself have signed everybody out one last time.
 *
 * The old store is read once and its keys moved over. After that this does
 * nothing, because there is nothing left to find: a migration, not a fallback,
 * and a fallback is what would keep two answers about who is signed in alive.
 *
 * ONLY WHEN THE NEW STORE IS EMPTY. A session established since the move is the
 * current one, and a stale per-tab copy must never overwrite it.
 */
export function carry(): void {
  if (typeof window === 'undefined') return
  try {
    const from = window.sessionStorage
    const to = window.localStorage
    // The SDK's own write test first. A store that refuses a write is one the
    // SDK does not keep the session in — it keeps it per tab — and the throw
    // leaves before anything is touched.
    const probe = `${PREFIX}probe`
    to.setItem(probe, '1')
    to.removeItem(probe)
    // The access token is the session. It is carried only into a store that
    // holds none, and the per-tab copy is removed either way: left behind, it
    // would be carried back the next time a sign-out empties the shared store.
    const into = !to.getItem(ACCESS) && from.getItem(ACCESS) !== null
    for (const key of KEYS) {
      const held = from.getItem(key)
      if (into && held !== null) to.setItem(key, held)
      from.removeItem(key)
    }
  } catch {
    /* no store, or one that refuses — the reader signs in again, which is what
       happened before this file existed */
  }
}



/** Who this browser's local state belongs to. */
const WHO = 'hanzo:who'
/** The SDK's two per-person selections. Everything else under its prefix is
 *  the session's own machinery — tokens, the login in flight — and stays. */
const CHOSEN = [`${PREFIX}current_org`, `${PREFIX}current_project`]
/** What a change of person leaves in place. */
const kept = (key: string): boolean =>
  key === WHO || key === 'hanzo:sidebar:open' || (key.startsWith(PREFIX) && !CHOSEN.includes(key))

/**
 * The subject the stored access token names, or undefined.
 *
 * Read off the claim rather than waited for from userinfo, because that is
 * what makes `own` runnable BEFORE anything else reads storage: the token is
 * in place from the first line of the first script, and the SDK's own fast
 * path judges a session the same way. Expiry is not consulted — a stale
 * token still says whose browser this is, and the SDK either refreshes it or
 * clears it, at which point the answer changes here too.
 */
export function subject(): string | undefined {
  const token = bearer()
  if (!token) return undefined
  try {
    const part = token.split('.')[1]
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims.sub === 'string' && claims.sub ? claims.sub : undefined
  } catch {
    return undefined
  }
}

/**
 * Bind everything this site keeps in the browser to ONE person.
 *
 * Every `hanzo*` key — conversations, contacts, the calendar, the board, the
 * agent's persona, the chat's history, the SDK's current org — is written per
 * browser and would be read by whoever is signed in next. So the subject is
 * recorded beside them, and when a different subject arrives (or nobody: a
 * sign-out) the last person's keys are removed before anything reads them.
 * The SDK's `hanzo_iam_*` keys are the arriving session itself and stay —
 * except the org and project it last selected, which are the last person's.
 *
 * Same subject, no work. Called synchronously where the providers mount, so
 * a page's first read of storage already sees a browser that is the reader's.
 */
export function own(sub: string | undefined): void {
  if (typeof window === 'undefined') return
  try {
    const store = window.localStorage
    if (store.getItem(WHO) === (sub ?? null)) return
    for (const key of Object.keys(store))
      if (key.startsWith('hanzo') && !kept(key)) store.removeItem(key)
    if (sub) store.setItem(WHO, sub)
    else store.removeItem(WHO)
  } catch {
    /* a browser that refuses storage kept nothing to remove */
  }
}

/**
 * Follow the session every tab of this site shares.
 *
 * The SDK in each tab keeps its own copy of who is signed in and is told
 * nothing when another tab changes the store. A sign-out there empties the
 * tokens, and a tab that did not hear it goes on drawing the person it was
 * opened for while every call it makes carries `X-Org-Id` and no bearer, which
 * the platform answers as nobody (`a validated principal is required`).
 *
 * `moved` runs when the stored access token stops naming `was` — removed, or
 * naming someone else; a cleared store (`key` null) is read the same way — and
 * when the organization a SuperAdmin stepped into (`assumed`) changes, because
 * the person is the same and every request's scope is not. Any other token for
 * the same subject is not a move: that is a refresh in another tab, and
 * `bearer()` reads it at call time. A tab on the sign-in callback is finishing
 * its own sign-in and is left to it.
 *
 * When the store is left with nobody, the silent ask is marked spent in this
 * tab before `moved` runs: the sign-out that emptied it may still be on its way
 * to IAM, and an ask arriving first would be answered from the session being
 * ended and sign this tab straight back in. The reader signs in again from the
 * form. Returns the unsubscribe.
 */
export function follow(was: string | undefined, moved: () => void): () => void {
  const inside = assumed()
  const on = (e: StorageEvent) => {
    if (e.storageArea !== window.localStorage) return
    if (e.key !== null && e.key !== ACCESS) return
    if (window.location.pathname.startsWith('/auth/callback')) return
    const now = subject()
    if (now === was && assumed() === inside) return
    if (!now) asked()
    moved()
  }
  window.addEventListener('storage', on)
  return () => window.removeEventListener('storage', on)
}

/** A token's claims, or null. */
function claimsOf(token: string | null): Record<string, unknown> | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

/** The stored token's claims, or null. */
function claims(): Record<string, unknown> | null {
  return claimsOf(bearer())
}

/**
 * The organizations the token says this person belongs to, home first.
 * Empty for an account that has not made one: the SDK's own list falls back to
 * the `owner` claim, which is the application's org and nobody's to work in.
 */
export function orgs(): string[] {
  const set = claims()?.orgs
  const out: string[] = []
  for (const ref of Array.isArray(set) ? set : []) {
    const o = (ref as { org?: unknown } | null)?.org
    if (typeof o === 'string' && o && !out.includes(o)) out.push(o)
  }
  return out
}

/**
 * The reader's role in one organization as IAM signed it into the token's `orgs`
 * claim — owner, admin or member — or null where the token names no such org.
 * It is the role in THAT org only (HIP-0527: org admin is scoped to its org), so
 * it says nothing about any other org and nothing about SuperAdmin.
 */
export function role(o: string | null): string | null {
  if (!o) return null
  const set = claims()?.orgs
  for (const ref of Array.isArray(set) ? set : []) {
    const r = ref as { org?: unknown; role?: unknown } | null
    if (r?.org === o) return typeof r.role === 'string' && r.role ? r.role : null
  }
  return null
}

/**
 * Who the token names — its display name and email — or null. The IAM user says
 * the same once userinfo answers; this is the answer before it, so a signed-in
 * reader is never drawn as a stranger while it is asked.
 */
export function named(): { name: string; email: string } | null {
  const c = claims()
  if (!c) return null
  const text = (k: string): string => (typeof c[k] === 'string' ? (c[k] as string) : '')
  return { name: text('displayName') || text('name'), email: text('email') }
}

/**
 * The reader's account as IAM keys a membership: `<home org>/<username>`, or null.
 * The token's `name` is the username and its `orgs` claim lists the home org first.
 */
export function me(): string | null {
  const name = claims()?.name
  const home = orgs()[0]
  return typeof name === 'string' && name && home ? `${home}/${name}` : null
}

/** The organization this browser works in: the SDK's selection, when it is one of the token's. */
export function org(): string | null {
  try {
    const mine = orgs()
    const chosen = window.localStorage.getItem(`${PREFIX}current_org`)
    if (chosen && mine.includes(chosen)) return chosen
    // ONE ORGANIZATION IS NOT A CHOICE. Answering null here until `Orgs` had
    // recorded a pick meant every single-organization reader began UNSCOPED:
    // the client was built without X-Org-Id, the pick fired the event a moment
    // later, and useAi rebuilt the client — so every hook restarted after first
    // paint and a thread or a palette read in that window came back empty. The
    // sole organization is the answer from the first render.
    return mine.length === 1 ? mine[0] : null
  } catch {
    return null
  }
}

/** The headers that scope a request to the signed-in person and their organization. */
export function scope(): Record<string, string> {
  const h: Record<string, string> = {}
  const t = bearer()
  if (t) h.Authorization = `Bearer ${t}`
  const o = org()
  if (o) h['X-Org-Id'] = o
  return h
}

/**
 * Expire the access token so the next load mints one carrying the account's
 * current claims — after it joins an organization. The token itself stays,
 * because it is what names the person: removing it would read as a sign-out
 * and `own()` would empty everything the person just chose. The SDK sees an
 * expired token and refreshes on the refresh token.
 */
export function renew(): void {
  try {
    window.localStorage.setItem(EXPIRES, '0')
  } catch {
    /* no store to renew */
  }
}

/** Fired on `window` when the organization this browser works in changes. */
export const ORG = 'hanzo:org'

/** This person picked an organization in this browser. `own()` clears it with the person. */
export const PICKED = 'hanzo:org:picked'

/**
 * Work in this organization from now on: the SDK's selection, noted as picked
 * and announced. Noted here, so a choice made anywhere — the rooms' gate, the
 * app's account menu — is one the gate does not ask for again.
 */
export function pick(o: string): void {
  try {
    window.localStorage.setItem(`${PREFIX}current_org`, o)
    window.localStorage.setItem(PICKED, '1')
  } catch {
    /* the choice lives only in this page */
  }
  window.dispatchEvent(new Event(ORG))
}

/** The reserved org whose own people are the platform's operators. */
export const ADMIN_ORG = 'admin'

/**
 * Whether the signed-in person is a SUPERADMIN, as IAM signs it: the org of the
 * person's own row — the first entry of the token's `orgs`, which IAM always puts
 * first (hanzoai/iam internal/store/membership.go `MemberOrgRefs`) — is the
 * reserved `admin` org. It is the equality IAM decides `assume` and the
 * organization list on (pkg/schema/user.go `SuperAdmin`) and cloud's `Super`.
 * Not the `owner` claim: a sign-in token carries the APPLICATION's org there. A
 * membership of `admin` is not it either, and neither is being an org's admin.
 * It decides only what is drawn: IAM refuses everyone else the list of every
 * organization and the step into one.
 */
export function superAdmin(): boolean {
  return orgs()[0] === ADMIN_ORG
}

/** The organization a SuperAdmin stepped into through IAM, from the token's `assumed` claim, or null. */
export function assumed(): string | null {
  const org = claims()?.assumed
  return typeof org === 'string' && org ? org : null
}

/**
 * Step into an organization as its support, or step back out (`org` null).
 *
 * IAM does the whole act: `POST /v1/iam/assume {org}` answers the same person's
 * token re-scoped to that organization — `assumed` names it and `orgs` gains it —
 * and records the step in that organization's audit log; `POST /v1/iam/release`
 * answers the token with nothing assumed and records that too
 * (hanzoai/iam internal/oidc/masquerade.go). The answer is kept where the SDK
 * keeps the session, with its own expiry, so every request made from here on
 * carries it and the SDK's next refresh ends support mode by itself. The page
 * reloads so every room reads under it.
 */
export async function support(org: string | null): Promise<void> {
  const token = bearer()
  if (!token) throw new Error('Sign in first.')
  const res = await fetch(`${api()}/v1/iam/${org ? 'assume' : 'release'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(org ? { org } : {}),
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await res.json().catch(() => null)) as { msg?: string; data?: { accessToken?: string } } | null
  const next = body?.data?.accessToken
  const exp = claimsOf(next ?? null)?.exp
  if (!res.ok || !next || typeof exp !== 'number') throw new Error(body?.msg || `IAM answered ${res.status}.`)
  window.localStorage.setItem(ACCESS, next)
  window.localStorage.setItem(EXPIRES, String(exp * 1000))
  pick(org ?? homeOf(next))
  window.location.reload()
}

/** The org of the person's own row: the first entry of a token's `orgs`. */
function homeOf(token: string): string {
  const set = claimsOf(token)?.orgs
  const first = Array.isArray(set) ? (set[0] as { org?: unknown } | null)?.org : undefined
  return typeof first === 'string' ? first : ''
}

/**
 * Leave support mode when IAM cannot answer the step out: the stored token is
 * marked spent, so the SDK's refresh — which mints from the person's own grant
 * and assumes nothing — replaces it on the reload.
 */
export function abandon(): void {
  renew()
  pick('')
  window.location.reload()
}
