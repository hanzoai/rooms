'use client'


import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { useIam, useIamIdentity, useIamToken, useOrganizations } from '@hanzo/iam/react';
import type { User as IamUser, Organization as IamOrg } from '@hanzo/iam';
import { iam } from './api';

export interface OrganizationMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

export interface Organization {
  id: string;
  name: string;
  /** The reader's role in it as the token's `orgs` claim states it: owner | admin | member. */
  role: string;
  avatar?: string;
  plan?: string;
  memberCount?: number;
  members?: OrganizationMember[];
  description?: string;
  website?: string;
  location?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  location?: string;
  joinedDate?: string;
  website?: string;
  phone?: string;
}

interface AccountContextType {
  user: User | null;
  setUser: (user: User) => void;
  organizations: Organization[];
  currentOrganization: Organization | null;
  isLoading: boolean;
  switchOrganization: (orgId: string) => void;
  /** Writes to IAM and resolves once the row is stored. Rejects with the
   *  reason where it is not — a caller that reports success does so on this. */
  updateUserProfile: (userData: Partial<User>) => Promise<void>;
  updateOrganization: (orgData: Partial<Organization>) => void;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

/** The profile half of the IAM row. `@hanzo/iam`'s `User` type names the
 *  claims a token carries; these are columns on the record it does not
 *  restate, and the API answers them. See `pkg/schema/user.go`. */
type IamProfile = IamUser & { bio?: string; location?: string; homepage?: string };

function mapUser(u: IamProfile): User {
  return {
    id: u.id ?? u.name,
    name: u.displayName || u.name,
    email: u.email ?? '',
    avatar: u.avatar,
    phone: u.phone,
    bio: u.bio,
    location: u.location,
    // IAM calls it `homepage`; this app calls it a website. One name each side,
    // translated at the seam rather than in every screen.
    website: u.homepage,
    joinedDate: u.createdTime,
  };
}

/** An organization as the signed `orgs` claim names it: a name and a display name (@hanzo/iam `useOrganizations`). */
function mapOrg(o: Pick<IamOrg, 'name' | 'displayName'>, role: string | undefined): Organization {
  return {
    id: o.name,
    name: o.displayName || o.name,
    role: role ?? 'member',
    members: [],
  };
}


// ── The write ──────────────────────────────────────────────────────────────
//
// IAM owns the person. There is no second store to keep a name or a picture in,
// so a profile edit is a write to IAM and this page has succeeded when that has.
//
// `PUT /v1/iam/account` IS THE DOOR, and it is the only one a person has. The
// request names no target — the subject is whoever holds the token — so no
// shape of it reaches somebody else's record, and that property is exactly why
// a regular person may send it. The typed CRUD write beside it binds a WHOLE
// user from the body, which is an act only an administrator may perform (a
// full-row write is how a reader would carry `isAdmin` on their own row), so
// reaching for that one made changing a picture a privilege: the read
// succeeded, the write was refused, and the picture stayed on screen over a row
// that had not changed.
//
// A PATCH, NOT A ROW. Every field is optional: one omitted keeps the value it
// had and one sent empty clears it. So the panel that saves a picture cannot
// blank a biography it never drew, and two screens saving at once do not undo
// each other — which is also why there is nothing to read first.
//
// FOUR FIELDS, because four is what IAM lets a person write about themselves.
// An email address and a phone number are LOGIN IDENTIFIERS and second-factor
// destinations: moving where a code is delivered is a credential act, safe only
// once the new address has proved it can receive one. That is the verification
// flow's job, not a profile save's, so they are not here and this app does not
// draw a control that pretends otherwise.


/** IAM's self-scoped account door, at the host's IAM. */
const account = (): string => `${iam()}/v1/iam/account`;

// ── The read ───────────────────────────────────────────────────────────────
//
// THE SAME DOOR, and that is the point: the row this page edits is the row it
// draws. `PUT /v1/iam/account` names no target and neither does the GET — the
// subject is whoever holds the token — so a person reads their own record and
// nobody else's, which is why a regular person may ask.
//
// It reads the ROW because a token does not carry one. `IamProvider` sets its
// `user` to the OIDC userinfo response, which answers who you are (sub, name,
// email, picture) and nothing about the record: no avatar under that name, no
// bio, no homepage, no phone, no joined date, and no id. Read as a row it is
// a person with no picture and empty fields — the profile page drew "Add a
// picture" over an account that had one.

/** IAM's answer, whether it wraps the row or is the row. */
function row(said: unknown): IamProfile | null {
  if (!said || typeof said !== 'object') return null;
  const body = said as { status?: string; data?: unknown };
  if (body.status === 'error') return null;
  const it = (body.data ?? said) as IamProfile;
  return it && typeof it === 'object' ? it : null;
}

async function fetchAccount(token: string): Promise<IamProfile | null> {
  // The bearer is the whole proof, so the request carries no cookie — the same
  // reason the write does not.
  const res = await fetch(account(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return row(await res.json().catch(() => null));
}

/** IAM's names for what this app calls a profile. */
function fields(patch: Partial<User>): Record<string, string> {
  const body: Record<string, string> = {};
  if (patch.name !== undefined) body.displayName = patch.name;
  if (patch.bio !== undefined) body.bio = patch.bio;
  // IAM calls it `homepage`; this app calls it a website. One name each side,
  // translated at the seam rather than in every screen.
  if (patch.website !== undefined) body.homepage = patch.website;
  if (patch.avatar !== undefined) body.avatar = patch.avatar;
  return body;
}

/** What IAM said went wrong. A refused image names its own limit, and that
 *  sentence is the useful half of the answer. */
function reason(said: { msg?: string } | null, status: number): string {
  return said?.msg || `Could not save (${status}).`;
}

async function store(token: string, patch: Partial<User>): Promise<void> {
  const body = fields(patch);
  // Nothing IAM stores changed, so there is nothing to ask it.
  if (Object.keys(body).length === 0) return;

  // THE BEARER IS THE WHOLE PROOF, so the request carries no cookie. IAM opens
  // this path to a browser on the strength of a token in a header — asking for
  // credentials as well means the browser demands an
  // `Access-Control-Allow-Credentials` on the answer, and where the origin does
  // not get one the save fails as a network error with no status and no
  // sentence to show the reader.
  const res = await fetch(account(), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const said = await res.json().catch(() => null);
  if (!res.ok || said?.status === 'error') throw new Error(reason(said, res.status));
}

export const AccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user: iamUser, isLoading: authLoading } = useIam();
  const { token } = useIamToken();
  const { organizations: iamOrgs, roles, currentOrgId, switchOrg, isLoading: orgsLoading } = useOrganizations();

  const identity = useIamIdentity();
  // Held against the token it was read with. A row is about ONE person, so a
  // token change must not leave the previous account's picture on screen while
  // the next one is in flight — reading it back through the token is what makes
  // that impossible rather than merely brief.
  const [held, setHeld] = useState<{ of: string; row: IamProfile | null } | null>(null);
  const account = held && token && held.of === token ? held.row : null;
  const [userOverrides, setUserOverrides] = useState<Partial<User>>({});
  const [orgOverrides, setOrgOverrides] = useState<Record<string, Partial<Organization>>>({});

  useEffect(() => {
    setUserOverrides({});
    setOrgOverrides({});
  }, [iamUser?.id, iamUser?.name]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetchAccount(token)
      .then((row) => {
        if (live) setHeld({ of: token, row });
      })
      // A record that will not load leaves the token's identity on screen,
      // which is what this page had before it asked for the row at all.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [token]);

  const user = useMemo<User | null>(() => {
    if (!iamUser && !identity) return null;
    // The row where IAM answered with one; otherwise the identity the token
    // already carries, resolved by the one resolver that knows every key IAM
    // spells a name and a picture under.
    const base: User = account
      ? mapUser(account)
      : {
          id: (iamUser as IamUser | null)?.id ?? identity?.name ?? '',
          name: identity?.name ?? '',
          email: identity?.email ?? '',
          avatar: identity?.avatarUrl ?? undefined,
        };
    return { ...base, ...userOverrides };
  }, [account, iamUser, identity, userOverrides]);

  const organizations = useMemo<Organization[]>(
    () => iamOrgs.map((o) => {
      const base = mapOrg(o, roles[o.name]);
      return { ...base, ...orgOverrides[base.id] };
    }),
    [iamOrgs, roles, orgOverrides]
  );

  const currentOrganization = useMemo<Organization | null>(
    () => organizations.find((o) => o.id === currentOrgId) ?? organizations[0] ?? null,
    [organizations, currentOrgId]
  );

  const setUser = (next: User) => setUserOverrides(next);

  // The override lands FIRST so the picture the reader just picked is on screen
  // while the request is in flight, and is rolled back where the write is
  // refused — a preview that survives a failure is the page lying about what it
  // has.
  const updateUserProfile = async (userData: Partial<User>) => {
    const before = userOverrides;
    setUserOverrides((prev) => ({ ...prev, ...userData }));
    if (!iamUser || !token) {
      setUserOverrides(before);
      throw new Error('Sign in to change your profile.');
    }
    try {
      await store(token, userData);
    } catch (e) {
      setUserOverrides(before);
      throw e;
    }
  };

  const updateOrganization = (orgData: Partial<Organization>) => {
    if (!currentOrganization) return;
    setOrgOverrides((prev) => ({
      ...prev,
      [currentOrganization.id]: { ...prev[currentOrganization.id], ...orgData },
    }));
  };

  return (
    <AccountContext.Provider
      value={{
        user,
        setUser,
        organizations,
        currentOrganization,
        isLoading: authLoading || orgsLoading,
        switchOrganization: switchOrg,
        updateUserProfile,
        updateOrganization,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};

export const useAccount = () => {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
};
