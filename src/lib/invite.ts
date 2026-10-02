import { me, scope } from './session'
import { api, CLIENT, iam } from './api';
/**
 * Organization invitations, on the real IAM surface.
 *
 * The contract, source-verified end to end:
 *  - create   POST   /v1/iam/invitations                (schema iam.invitations.Input)
 *  - list     GET    /v1/iam/invitations?owner=<org>    → { invitations, total }
 *  - withdraw DELETE /v1/iam/invitations/<owner>/<name>
 *  - send     POST   /v1/iam/invitations/<owner>/<name>/send
 *             {} → { sent, to }: IAM emails the join link to the address the
 *             invitation is pinned to, from the org of the application the
 *             caller's access token was issued to (hanzo-app here).
 *  - redeem   https://hanzo.id/join?client_id=<CLIENT>&invite=<CODE>&org=<owner>
 *             — the link IAM emails, built here identically. A new person
 *             creates their account there with the code, and a signed-in one
 *             accepts it; the server model (iam pkg/schema/invitation.go)
 *             gates on State "Active", counts UsedCount against Quota, and an
 *             Email pin constrains who may redeem.
 *
 * A refusal states its reason. 401 is the credential, 403 is permission —
 * neither is "try again", so neither ever says it.
 */

export interface Invitation {
  owner: string;
  name: string;
  displayName: string;
  code: string;
  quota: number;
  usedCount: number;
  email?: string;
  state: string;
  createdTime?: string;
}

export class InviteRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${api()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...scope(),
      ...init?.headers,
    },
  });
  if (res.status === 401) throw new InviteRefusal(401, 'Your session expired — sign in again');
  if (res.status === 403) throw new InviteRefusal(403, 'Your role in this organization does not allow this');
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { msg?: string; error?: string; message?: string };
      detail = body.msg || body.error || body.message || '';
    } catch {
      // an HTML error page proves nothing worth toasting
    }
    throw new InviteRefusal(res.status, detail || `Invitation service answered ${res.status}`);
  }
  const body = (await res.json()) as { status?: string; msg?: string } | null;
  // IAM's raw handlers refuse with HTTP 200 and `{status: "error", msg}` — the
  // memberships writes do — so the envelope is read as well as the status.
  if (body?.status === 'error') throw new InviteRefusal(400, body.msg || 'IAM refused the change');
  return body;
}

/** The invitation's row name within its org: random, and never the code. */
function mintName(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `inv-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

/** The link a member joins by, on the same IAM the account panel signs into.
 *  Those two were separately configurable and neither name was set anywhere, so
 *  pointing the app at another IAM would have moved one and left the other. It is
 *  the link IAM emails, parameter for parameter, so a copied link and an emailed
 *  one are the same link: the application the member joins through, the code, and
 *  the org IAM looks the code up in. */
export function inviteLink(org: string, code: string): string {
  const q = new URLSearchParams({ client_id: CLIENT, invite: code, org });
  return `${iam()}/join?${q}`;
}

/** How many people one shared invite link admits. */
export const LINK_SEATS = 25;

/**
 * Issues one invitation and returns it: pinned to an email and redeemable once,
 * or open to anyone with the link for `quota` joins. The caller owns telling the
 * person — `sendInvitation` emails a pinned one, and the link is
 * `inviteLink(invitation.owner, invitation.code)`.
 */
export async function createInvitation(org: string, email?: string, quota = 1): Promise<Invitation> {
  // No code is sent: IAM mints it, and only a code IAM minted is exempt from the
  // limit on guesses at an org's invitations. The row it answers carries it.
  const created = (await call('/v1/iam/invitations', {
    method: 'POST',
    body: JSON.stringify({
      owner: org,
      name: mintName(),
      displayName: email ? `Invitation for ${email}` : 'Invite link',
      quota,
      usedCount: 0,
      email: email || '',
      state: 'Active',
    }),
  })) as Invitation;
  if (!created?.code) throw new InviteRefusal(502, 'IAM made the invitation without a code');
  return created;
}

/**
 * One organization's invitations, newest first, redeemed ones included.
 *
 * The organization is named as `?owner=`, the one input IAM's list reads. A
 * read that names none is authorized against no organization and refused.
 */
export async function listInvitations(org: string): Promise<Invitation[]> {
  const body = (await call(`/v1/iam/invitations?owner=${encodeURIComponent(org)}`)) as { invitations?: Invitation[] };
  return (body.invitations ?? []).filter((r) => r && r.code);
}

/**
 * Emails the join link to the address an invitation is pinned to, and returns
 * the address IAM sent it to. A refusal carries IAM's own reason.
 */
export async function sendInvitation(inv: Pick<Invitation, 'owner' | 'name'>): Promise<string> {
  try {
    const body = (await call(
      `/v1/iam/invitations/${encodeURIComponent(inv.owner)}/${encodeURIComponent(inv.name)}/send`,
      { method: 'POST', body: '{}' },
    )) as { sent?: boolean; to?: string };
    if (!body.sent) throw new InviteRefusal(502, 'IAM did not send the email');
    return body.to ?? '';
  } catch (e) {
    if (!(e instanceof InviteRefusal)) throw e;
    // IAM paces sends per invitation, per org and per mailbox, and names which.
    if (e.status === 429) throw new InviteRefusal(429, e.message || 'Wait before sending it again');
    // An IAM that predates the send route answers a bare 404.
    if (e.status === 404 && e.message.startsWith('Invitation service answered')) {
      throw new InviteRefusal(404, 'Invitation emails are not switched on yet');
    }
    throw e;
  }
}

/**
 * The organization's shared invite link: an active invitation pinned to nobody
 * with a seat left. Pinned invitations are one person's and are not it.
 */
export function shareable(rows: Invitation[]): Invitation | undefined {
  return rows.find((r) => r.state === 'Active' && !r.email && r.quota > 1 && r.usedCount < r.quota);
}

/** Withdraws an invitation so its code stops redeeming. */
export async function withdrawInvitation(inv: Pick<Invitation, 'owner' | 'name'>): Promise<void> {
  await call(`/v1/iam/invitations/${encodeURIComponent(inv.owner)}/${encodeURIComponent(inv.name)}`, {
    method: 'DELETE',
  });
}

/**
 * Sets how the organization APPEARS: an image, or one emoji, or neither.
 *
 * `POST /v1/iam/organizations/avatar` writes those two fields onto the stored
 * row and touches nothing else — which the general update cannot do, because it
 * replaces the whole record and a record read back arrives MASKED, so a
 * read-modify-write through it would persist the mask over the organization's
 * own credential settings. That is IAM's own reason for publishing this route,
 * and it is why the logo does not go through `updateOrganization`.
 *
 * An image is an https link or the bytes inline as a data URL, up to 96 KiB —
 * the same bound and the same shape `lib/mark.ts` already produces for a
 * person's photograph, so a logo is not a second kind of picture.
 */
export async function setOrganizationMark(
  owner: string,
  name: string,
  mark: { avatar?: string; emoji?: string },
): Promise<void> {
  await call('/v1/iam/organizations/avatar', {
    method: 'POST',
    body: JSON.stringify({ owner, name, ...mark }),
  })
}

/**
 * Changes how an organization READS: its display name and its website.
 *
 * `POST /v1/iam/organizations/profile`, the sibling of the avatar route, and it
 * exists for the same reason. Update REPLACES the record, so sending just a new
 * name blanks the website and the sign-in rules — and a record read back arrives
 * MASKED, so the obvious read-modify-write stores "***" as the master password.
 * One costs the organization its settings, the other its credentials. This
 * writes the fields it names and touches nothing else.
 *
 * A field left `undefined` is not sent and not changed; `''` is sent and clears.
 */
export async function setOrganizationProfile(
  owner: string,
  name: string,
  profile: { displayName?: string; websiteUrl?: string },
): Promise<void> {
  await call('/v1/iam/organizations/profile', {
    method: 'POST',
    body: JSON.stringify({ owner, name, ...profile }),
  })
}

/** One person in the organization. */
export interface Member {
  /** "<homeOrg>/<username>", the membership's key. */
  id: string
  name: string
  email: string
  /** The role IAM gives them here: owner | admin | member. */
  role: string
  /**
   * Their account LIVES in this org, so their access is the account's own and
   * not a membership row: IAM refuses to revoke it (the account is disabled
   * instead) and reads their role off the account (store.HomeRole).
   */
  home: boolean
}

/** A row of `GET /v1/iam/memberships?org=`: someone who may act in the org. */
interface Membership {
  /** "<homeOrg>/<username>" */
  user: string
  /** owner | admin | member */
  role: string
}

/** A row of `GET /v1/iam/users?owner=`: an account whose home is the org. */
interface Account {
  owner: string
  name: string
  type?: string
  displayName?: string
  email?: string
  isAdmin?: boolean
}

/**
 * The organization's people: everyone who may act in it, with their role.
 *
 * Two reads, because IAM grants access two ways: a MEMBERSHIP row (someone who
 * lives in another org and was let into this one) and an account that LIVES in
 * this org, whose access is the account itself and has no row. A person usually
 * lives in their own personal organization and acts in a team one, so a team
 * org's people are mostly rows; an older org's people mostly live in it.
 *
 * A membership row carries the account and the role and no name, and IAM lets a
 * reader open accounts in the org's own directory and no other org's. So each
 * member is named from what the reader may read: the reader from their own
 * account (`self`, where the caller holds it), a member who lives in the org
 * from its directory, and anyone else by the username the row carries. The
 * directory also marks the org's service accounts, which are left out: the
 * roster beside the agents is where somebody looks for those. A reader who may
 * not read the directory sees the rows alone, by username.
 */
export async function members(org: string, self?: { name: string; email: string }): Promise<Member[]> {
  const q = encodeURIComponent(org)
  const [roster, directory] = await Promise.all([
    call(`/v1/iam/memberships?org=${q}`) as Promise<{ data?: Membership[] }>,
    (call(`/v1/iam/users?owner=${q}`) as Promise<{ users?: Account[] }>).catch(() => ({ users: [] as Account[] })),
  ])
  const accounts = directory?.users ?? []
  const key = (u: Account) => `${u.owner}/${u.name}`
  const machines = new Set(accounts.filter((u) => u?.type === 'service-account').map(key))
  const people = accounts.filter((u) => u?.type !== 'service-account')
  const known = new Map(people.map((u) => [key(u), u]))
  const mine = me()
  const rows = (Array.isArray(roster?.data) ? roster.data : []).filter(
    (r) => typeof r?.user === 'string' && r.user.includes('/'),
  )
  const named = (id: string, role: string, home: boolean): Member => {
    const username = id.slice(id.indexOf('/') + 1)
    if (self && id === mine) return { id, name: self.name || username, email: self.email, role, home }
    const account = known.get(id)
    return { id, name: account?.displayName || username, email: account?.email ?? '', role, home }
  }
  const listed = new Set<string>()
  const out: Member[] = []
  for (const r of rows) {
    if (machines.has(r.user)) continue
    listed.add(r.user)
    out.push(named(r.user, r.role, r.user.slice(0, r.user.indexOf('/')) === org))
  }
  // Everyone whose account lives here acts here, row or no row: IAM puts the home
  // org first in every token it mints (store.MemberOrgRefs) with the role the
  // account's own flag gives it (store.HomeRole).
  for (const u of people) {
    const id = key(u)
    if (listed.has(id)) continue
    out.push(named(id, u.isAdmin ? 'admin' : 'member', true))
  }
  return out
}

/**
 * Changes an existing member's role: `POST /v1/iam/memberships {user, org, role}`,
 * the one role write HIP-0527 names, by an owner or admin of the org. Resolves to
 * the role IAM holds for them afterwards, read back from the roster, so a caller
 * reports what IAM stored rather than what it asked for.
 */
export async function setRole(org: string, user: string, next: string): Promise<string | null> {
  await call('/v1/iam/memberships', { method: 'POST', body: JSON.stringify({ user, org, role: next }) })
  const roster = (await call(`/v1/iam/memberships?org=${encodeURIComponent(org)}`)) as { data?: Membership[] }
  return (Array.isArray(roster?.data) ? roster.data : []).find((r) => r?.user === user)?.role ?? null
}

/**
 * Ends someone's access to the org: `POST /v1/iam/delete-membership {user, org}`.
 * Their account survives. IAM refuses it for a person whose account lives in the
 * org, and says so in its own words.
 */
export async function removeMember(org: string, user: string): Promise<void> {
  await call('/v1/iam/delete-membership', { method: 'POST', body: JSON.stringify({ user, org }) })
}
