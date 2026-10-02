import { track } from './tags'

/**
 * Signup vs login, decided in ONE place.
 *
 * IAM hosts the form, so /auth/callback sees the same redirect for a brand-new
 * account and a returning sign-in — and counting a returning login as a signup
 * would silently inflate the top-line conversion. /signup marks the intent
 * before handing off; the callback takes it (read-once) and picks the event.
 *
 * sessionStorage, not localStorage: the intent must not survive the tab.
 */
const KEY = 'hz_signup_intent'

export function markSignupIntent(): void {
  try {
    window.sessionStorage.setItem(KEY, '1')
  } catch {
    /* private mode — the callback then reports login_completed; never throw */
  }
}

/**
 * How this tab is signing in, written when the person commits to a way:
 * `email` (a new account), `password`, `code`, a provider's kind (`google`,
 * `github`), `hanzo.id` (IAM's own page), or `session` (a hanzo.id session,
 * asked silently). The callback's login and the first organization's sign-up
 * carry it as `method`; a sign-in that began nowhere on this site is `hanzo.id`.
 */
const METHOD = 'hz_signin_method'

export function markMethod(method: string): void {
  try {
    window.sessionStorage.setItem(METHOD, method)
  } catch {
    /* private mode — the method reads as hanzo.id; never throw */
  }
}

export function signinMethod(): string {
  try {
    return window.sessionStorage.getItem(METHOD) || 'hanzo.id'
  } catch {
    return 'hanzo.id'
  }
}

/** Read-once: returns true when this callback completes a signup, and clears. */
export function takeSignupIntent(): boolean {
  try {
    const had = window.sessionStorage.getItem(KEY) === '1'
    window.sessionStorage.removeItem(KEY)
    return had
  } catch {
    return false
  }
}

/**
 * The account was created: signup_completed, once per tab however many places
 * could say so (the terms page's Create account, the first organization).
 */
const COUNTED = 'hz_signup_counted'

export function countSignup(method: string = signinMethod()): void {
  try {
    if (window.sessionStorage.getItem(COUNTED)) return
    window.sessionStorage.setItem(COUNTED, '1')
  } catch {
    /* private mode — counted on every call rather than never */
  }
  track('signup_completed', { method })
}
