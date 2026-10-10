/**
 * Where a sign-in comes back to, decided in ONE place.
 *
 * Signing in is a round trip through another origin: the browser leaves for
 * hanzo.id's /authorize and returns to /auth/callback, and nothing about that
 * return says which page the person was reading when they started. So the page
 * is written down on the way out and read back on the way in. One writer (the
 * header's Sign in), one reader (the callback), read-once.
 *
 * sessionStorage, because the note must NOT outlive the trip it belongs to. The
 * session itself is localStorage — signing in is meant to survive the tab — but
 * a destination is not a session: it answers "which page did this one sign-in
 * start from", and a page remembered from yesterday's tab is not an answer to
 * that. It survives the redirect because a redirect keeps the tab, which is the
 * whole lifetime it needs.
 *
 * Every access is guarded because storage THROWS rather than returning null in
 * a browser that refuses it (Safari private mode, a locked-down profile). A
 * person who cannot be sent back to their page must still be signed in, so a
 * refusal degrades to the default and never to an exception.
 */

import { apex, guest, SIGNIN } from "./host";
import { SHARED } from "./share";
import { where } from "../where";

/** The default on the apex: `/`, which takes anyone signed in to the app, in
 *  the mode they were last in (lib/host.ts `resume`). It answers the case where
 *  there is no page to go back to (a typed /login, a /signup funnel, a stranger
 *  who cleared their storage mid-flight). */
export const DEFAULT_DESTINATION = "/";

/** Where a sign-in with no page to go back to lands on `hostname`: the app on
 *  the apex, and the rooms' Home everywhere else. */
export function landing(hostname: string): string {
  return apex(hostname) ? DEFAULT_DESTINATION : where().home;
}

/** The storage key.
 *
 *  No brand in it — a key is a name, and the product it belongs to is not part
 *  of what it names. But not the bare word `destination` either: sessionStorage
 *  is scoped to the ORIGIN (per tab, but every page in it), and this origin also serves the chat SPA under
 *  /chat/, so a one-word key is a name two unrelated programs could both reach
 *  for. The qualifier says which flow owns it, which is the thing that makes it
 *  unambiguous. */
const KEY = "signin.destination";

/**
 * The addresses a sign-in must never return to, because each of them RESTARTS
 * the thing that just finished.
 *
 * /login calls `login()` from an effect on mount, so returning there sends the
 * browser straight back to /authorize — a loop that ends only when the person
 * gives up. /signup does the same with a signup hint. /auth/callback would
 * re-run `handleCallback()` against an authorization code that is single-use
 * and a verifier that was consumed by the exchange it is repeating, so it fails
 * and bounces to /login, which then loops as above.
 *
 * They are excluded here rather than at the point of writing because this is
 * the boundary that has to hold: the value has crossed storage and a foreign
 * origin between the two, and a rule enforced only on the way out is a rule
 * enforced nowhere.
 */
const RESTARTS_THE_FLOW = new Set(["/login", "/signup", "/auth/callback"]);

/** Write down where we are, immediately before leaving for the issuer.
 *
 *  It reads `window.location` itself rather than taking a path, because a
 *  caller that can name the page is a caller that can name the wrong one —
 *  there is exactly one moment this is correct to call and it is this one. */
export function rememberDestination(): void {
  try {
    const { pathname, search, hash } = window.location;
    window.sessionStorage.setItem(KEY, pathname + search + hash);
  } catch {
    /* no store — the callback then uses the default; never throw on the way to
       a login, or the control does nothing at all instead of signing anyone in */
  }
}

/** Where a person signs in: this site's own page. */
export const LOGIN = "/login";

/** Where a new one signs up: this site's own page, which the host names. */
export const signUp = (): string => where().signUp;

/**
 * Whether this browser has held a session on this site. It is marked where the
 * site resolves a signed-in user (app/providers.tsx `Identity`) and outlives
 * sign-out, which clears the SDK's keys and not this one.
 */
const KNOWN = "hz_known";

export function recognize(): void {
  try {
    window.localStorage.setItem(KNOWN, "1");
  } catch {
    /* no store — this browser reads as a stranger's and is offered sign-up */
  }
}

/**
 * The page a signed-out reader is sent to when nothing says which: /login for
 * a browser that has signed in here, /signup for a stranger, who has no
 * password to type. Both ask hanzo.id first and link to each other.
 */
export function door(): string {
  try {
    return window.localStorage.getItem(KNOWN) === "1" ? LOGIN : signUp();
  } catch {
    return signUp();
  }
}

/**
 * Send this reader to sign in, and back to this page after.
 *
 * Every signed-out door into the app is this one call: /chat, /dev and every
 * path under them, a room. The page is written down, and the browser goes to `to`,
 * which asks IAM for an existing session before it draws a form
 * (components/auth/panel.tsx `Gate`). On a `guest` host the same address is asked for on hanzo.ai instead. With no `to`
 * the page is `door()`'s; a control that says "Sign in" names LOGIN.
 */
export function enter(to: string = door()): void {
  const { pathname, search, hash } = window.location;
  const here = `${pathname}${search}${hash}`;
  if (handoff(here)) return;
  rememberDestination();
  // Written in the address too, so the place (a room, a prompt in `?q=`)
  // survives what sessionStorage does not: a new tab, a pasted link.
  const back = safe(here, "");
  window.location.assign(back && back !== "/" ? `${to}?next=${encodeURIComponent(back)}` : to);
}

/**
 * The `?next=` a sign-in page was opened with, when it is an address on this
 * site (`safe`): where the sign-in goes on to. Anything else is undefined.
 */
export function onward(search: string): string | undefined {
  const next = new URLSearchParams(search).get("next");
  return next && safe(next, "") === next ? next : undefined;
}

/**
 * On a `guest` host, send this sign-in to `address` on hanzo.ai and report that
 * it left; anywhere else, do nothing and report false so the caller signs in
 * here. A guest host cannot finish a sign-in (no client lists its callback), so
 * starting one there only reaches IAM's refusal.
 */
export function handoff(address: string): boolean {
  if (typeof window === "undefined" || !guest(window.location.hostname)) return false;
  window.location.assign(SIGNIN + address);
  return true;
}

/**
 * Write down `address` as where this sign-in goes, in place of the page it
 * started from: for a page that knows the reader's next stop rather than being
 * it — /signup with a paid plan chosen goes on to /pay. Held to the same rule
 * as everything read back: a path on this origin, or nothing is written.
 */
export function aim(address: string): void {
  if (safe(address, "") !== address) return;
  try {
    window.sessionStorage.setItem(KEY, address);
  } catch {
    /* no store: the callback uses the default */
  }
}

/** The plan picker. */
export const PICKER = "/onboarding";

/**
 * Where a completed sign-in goes first: the plan picker, which sends the reader
 * on to `to` (components/onboarding/flow.tsx). A shared chat opens straight
 * away. The picker is reached this way only, so it is shown once per sign-in.
 */
export function picker(to: string): string {
  const path = to.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path === SHARED || path === PICKER ? to : `${PICKER}?next=${encodeURIComponent(to)}`;
}

/**
 * FREE, CHOSEN BEFORE SIGNING IN, IS AN ANSWER. A paid plan chosen on a pricing
 * card rides the sign-in as its destination (`/pay…?plan=`), and the picker opens
 * its checkout. Free has no page to ride on, so the choice is written down here,
 * in this tab, for the one sign-in it starts, and that sign-in skips the picker.
 */
const FREE = "signin.free";

/** Free was chosen: the sign-in this starts goes straight to the app. */
export function chooseFree(): void {
  try {
    window.sessionStorage.setItem(FREE, "1");
  } catch {
    /* no store: the picker asks, and Free is one click there */
  }
}

/** Read-once: whether Free was chosen before this sign-in. */
export function choseFree(): boolean {
  try {
    const chosen = window.sessionStorage.getItem(FREE) === "1";
    window.sessionStorage.removeItem(FREE);
    return chosen;
  } catch {
    return false;
  }
}

/** Read-once: where this sign-in was headed, or this host's landing. */
export function takeDestination(): string {
  return safe(take(), landing(window.location.hostname));
}

/** The storage half, alone, so the guard covers the read and nothing else — a
 *  `try` wrapped around the decision too would turn a bug in the rule below
 *  into a silent fallback instead of a failure anyone could see. */
function take(): string | null {
  try {
    const stored = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return stored;
  } catch {
    return null;
  }
}

/**
 * A same-origin path, or `fallback`.
 *
 * `startsWith('/')` alone is not that test, and the gap is an open redirect:
 * `//evil.example` and `/\evil.example` both begin with a slash and both
 * navigate OFF this origin — the browser reads them as protocol-relative
 * authorities, not paths. A single leading slash NOT followed by a second
 * slash or a backslash is what makes a path a path.
 *
 * Exported so the rule can be exercised without a DOM: it is the one piece of
 * this module that is a decision rather than a storage call.
 */
export function safe(stored: string | null | undefined, fallback = DEFAULT_DESTINATION): string {
  if (!stored) return fallback;
  if (
    !stored.startsWith("/") ||
    stored.startsWith("//") ||
    stored.startsWith("/\\")
  )
    return fallback;
  // The browser's parser drops tabs and newlines and reads a backslash as a
  // slash, so `/\t/evil.example` is `//evil.example` to it. An address is kept
  // only when that same parser resolves it onto this origin.
  let parsed: URL;
  try {
    parsed = new URL(stored, HERE);
  } catch {
    return fallback;
  }
  if (parsed.origin !== HERE) return fallback;
  // Compared without a trailing slash, because `/login` and `/login/` are the
  // same page here and only one of them would be caught by a literal set. That
  // is not hypothetical: this export answers both, and /auth/callback is itself
  // inside the marketing layout, so it wears the header and its Sign in can be
  // clicked — from the one address whose second visit is guaranteed to fail.
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (RESTARTS_THE_FLOW.has(path)) return fallback;
  return stored;
}

/** An origin no address can name, to resolve a path against. */
const HERE = "https://hanzo.invalid";
