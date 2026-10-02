/**
 * The versions of the Terms of Service and the Acceptable Use Policy, written
 * once for every host.
 *
 * The documents are hanzo.ai's (/terms, /aup). Its legal pages print these
 * strings, and every sign-up card — hanzo.ai's and hanzo.team's — records them
 * on the IAM account a new address creates (`@hanzo/ui/auth` `SignIn`'s
 * `policy`). Change a document's words, change its string here, and the page
 * and every card move together. Client-safe: no filesystem.
 */

export const TERMS_VERSION = 'terms-2026-09-30'
export const AUP_VERSION = 'aup-2026-09-30'

/** What a sign-up card asks a new account to accept: `SignIn`'s `policy`. */
export const POLICY = { terms: TERMS_VERSION, aup: AUP_VERSION } as const

/** The date a version string names: `terms-2026-09-30` is `2026-09-30`. */
export const versionDate = (version: string): string => version.slice(version.indexOf('-') + 1)
