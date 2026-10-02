/**
 * The organization settings area's reads and writes, each on the API that owns it.
 *
 *   the org row            GET    /v1/iam/organizations/admin/<org>
 *   delete the org         DELETE /v1/iam/organizations/admin/<org>
 *   found a team org       POST   /v1/iam/organizations {owner: admin, name, displayName}
 *   business address       GET|PUT /v1/settings/organization (cloud's per-org config)
 *   your keys              GET|POST|DELETE /v1/account/keys (minted by IAM on you, shown once)
 *   the org's keys         GET    /v1/iam/keys?owner=<org>, DELETE /v1/iam/keys/<org>/<name>
 *   payment methods        GET    /v1/billing/methods
 *   invoices               GET    /v1/billing/invoices
 *
 * The name, the logo, the members and the invitations are lib/hanzo/team.ts's,
 * and the plan and balance are lib/hanzo/tier.ts's. Nothing here decides who may
 * do what: every request carries the reader's bearer and organization (`scope`),
 * the server answers, and a refusal comes back as the server's own sentence.
 */

import { scope } from './session'
import { api } from './api'
import { list } from './list'

/** A refusal, with the status it came under and the server's words. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** IAM's code for "not yours to do", said as a sentence. */
const UNAUTHORIZED = /^auth:Unauthorized operation$|^forbidden$/i
const NOT_YOURS = 'Your role in this organization does not allow this.'

/** One request as the signed-in reader, in the organization this browser works in. */
async function ask<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const res = await fetch(`${api()}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...scope(),
      ...(init.json === undefined ? null : { 'Content-Type': 'application/json' }),
    },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // An empty or HTML body carries nothing worth showing.
  }
  const said = (body ?? {}) as { detail?: string; msg?: string; error?: string; message?: string; status?: unknown }
  if (res.status === 401) throw new Refusal(401, 'Your session expired. Sign in again.')
  if (!res.ok || said.status === 'error') {
    const words = said.detail || said.msg || said.error || said.message || ''
    const status = res.ok ? 400 : res.status
    throw new Refusal(status, UNAUTHORIZED.test(words) || (status === 403 && !words) ? NOT_YOURS : words || `The server answered ${res.status}.`)
  }
  return body as T
}

const enc = encodeURIComponent

/** The words of any failure, for a toast or a line under a control. */
export const say = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'That did not go through.')

// ── the organization ────────────────────────────────────────────────────────

/** The org row as IAM answers it. Every org row is filed under the reserved `admin` owner. */
export interface OrgRow {
  name: string
  displayName: string
  websiteUrl?: string
  isPersonal?: boolean
  avatar?: string
}

export const readOrg = (org: string): Promise<OrgRow> => ask<OrgRow>(`/v1/iam/organizations/admin/${enc(org)}`)

/** Deletes the org row. IAM decides who may; there is no undo. */
export const deleteOrg = (org: string): Promise<unknown> =>
  ask(`/v1/iam/organizations/admin/${enc(org)}`, { method: 'DELETE' })

/**
 * Creates an organization the reader owns: cloud's `POST /v1/account/orgs
 * {name}`, the one create every surface uses. Cloud files the row in IAM and
 * records the verified creator as its owner through IAM's membership API.
 * Answers the new organization's handle; a refusal is what the reader is shown.
 */
export const createOrg = async (name: string): Promise<string> => {
  const made = await ask<{ org?: string }>('/v1/account/orgs', { method: 'POST', json: { name } })
  if (!made?.org) throw new Refusal(502, 'The organization was not created. Try again.')
  return made.org
}

/** The handle an org is addressed by, from the name a person typed. */
export function slug(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 39)
    .replace(/-+$/, '')
}

// ── the business address ────────────────────────────────────────────────────

export interface Address {
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export const EMPTY_ADDRESS: Address = { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' }

interface Config {
  config?: Record<string, unknown>
}

/** Where cloud keeps an org's own settings: one document per (org, product). */
const PROFILE = '/v1/settings/organization'

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

function addressOf(config: Record<string, unknown> | undefined): Address {
  const a = (config?.address ?? {}) as Record<string, unknown>
  return {
    line1: text(a.line1),
    line2: text(a.line2),
    city: text(a.city),
    state: text(a.state),
    postalCode: text(a.postalCode),
    country: text(a.country),
  }
}

export async function readAddress(): Promise<Address> {
  return addressOf((await ask<Config>(PROFILE)).config)
}

/**
 * Stores the address and answers what was stored. The document is written
 * whole, so the rest of it is read first and carried: a save of the address
 * never drops a field somebody else kept beside it.
 */
export async function saveAddress(next: Address): Promise<Address> {
  const held = (await ask<Config>(PROFILE)).config ?? {}
  const stored = await ask<Config>(PROFILE, { method: 'PUT', json: { config: { ...held, address: next } } })
  return addressOf(stored.config)
}

// ── keys ────────────────────────────────────────────────────────────────────

export type KeyType = 'secret' | 'publishable'

/** One of the reader's own keys in the acting org. A secret key's value is never listed. */
export interface OwnKey {
  type: KeyType
  prefix?: string
  /** The whole value, for a publishable key only: it is public by construction. */
  key?: string
  createdAt?: string
}

export async function ownKeys(): Promise<OwnKey[]> {
  return list<OwnKey>((await ask<{ keys?: unknown }>('/v1/account/keys')).keys)
}

/** Mints the reader's key of `type`, replacing the one they held, and answers it — once. */
export async function mintKey(type: KeyType): Promise<string> {
  const made = await ask<{ key?: string }>('/v1/account/keys', { method: 'POST', json: { type } })
  if (!made?.key) throw new Refusal(502, 'IAM answered without a key.')
  return made.key
}

export const revokeOwnKey = (type: KeyType): Promise<unknown> =>
  ask(`/v1/account/keys?type=${type}`, { method: 'DELETE' })

/** One of the org's keys, as IAM lists them: the secret half never leaves IAM. */
export interface OrgKey {
  owner: string
  name: string
  displayName?: string
  user?: string
  scope?: string
  state?: string
  createdTime?: string
}

export async function orgKeys(org: string): Promise<OrgKey[]> {
  return list<OrgKey>((await ask<{ keys?: unknown }>(`/v1/iam/keys?owner=${enc(org)}`)).keys)
}

export const revokeKey = (k: Pick<OrgKey, 'owner' | 'name'>): Promise<unknown> =>
  ask(`/v1/iam/keys/${enc(k.owner)}/${enc(k.name)}`, { method: 'DELETE' })

// ── billing reads ───────────────────────────────────────────────────────────

/** A card on file, as billing lists it. */
export interface Method {
  id: string
  brand?: string
  last4?: string
  expMonth?: number
  expYear?: number
  isDefault?: boolean
}

export async function methods(): Promise<Method[]> {
  const got = await ask<unknown>('/v1/billing/methods')
  return list<Method>(Array.isArray(got) ? got : (got as { data?: unknown } | null)?.data)
}

/** An invoice, amounts in whole cents. */
export interface Invoice {
  id: string
  numberStr?: string
  status?: string
  amountDue: number
  amountPaid?: number
  currency?: string
  createdAt?: string
  paidAt?: string
}

export async function invoices(): Promise<Invoice[]> {
  return list<Invoice>((await ask<{ invoices?: unknown }>('/v1/billing/invoices')).invoices)
}

/** Whole cents as money: `$1,234.56`. */
export function cents(n: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(n / 100)
}
