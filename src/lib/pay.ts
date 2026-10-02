/**
 * The pay site's addresses and money as a sentence says it.
 *
 * Kept apart from `plans.ts`, which reads the bundled plan catalogue: a page
 * that only links the pay page or prints a price carries none of it.
 */

import { org } from "./session";

/**
 * Where money changes hands: the checkout, mounted at hanzo.ai/pay so a buyer
 * never leaves the site. It is hanzo-inc/pay, served from the same export
 * pay.hanzo.ai was; that host now redirects here.
 *
 * billing.hanzo.ai has no route at the edge and answers 404, and /billing on
 * this site is the Billing PRODUCT's page — a reader sent there to buy a plan
 * lands on marketing. /pay takes `?plan=`, `?interval=`, `?returnUrl=` and
 * `?org=`, and comes back. Every "add credit" and "billing" link reads this one
 * address. Absolute, because this export also serves cloud.hanzo.ai and
 * hanzo.bot, and the checkout lives on hanzo.ai.
 */
export const BILLING_URL = "https://hanzo.ai/pay";

/**
 * The checkout address, opened on a plan when one is named, and returning to
 * `back` once the buyer has paid. Without `back` a paid buyer lands on the pay
 * site's receipt with no way into what they bought.
 *
 * ONE writer for this address. It was spelled out in three places — the
 * personal ladder, the business strip and the /account hand-off — and a plan id
 * only selects the card a reader clicked if every writer spells the query the
 * same way.
 */
export function checkoutUrl(id?: string, back?: string): string {
  return payUrl(id ? "/cart" : "/", { plan: id, returnUrl: back });
}

/**
 * A page on the pay site, for the organization this browser works in.
 *
 * pay charges and reads the ledger it is named, and it can only offer the ones
 * the token lists; which of them this workspace is in is a fact only this site
 * holds. `?org=` carries it across, and pay honours it only while the token
 * offers it. Call it at the moment of leaving: the organization lives in this
 * browser and moves with the switcher.
 */
export function payPage(path = "/"): string {
  return payUrl(path, { org: org() });
}

/** The pay address with its query, written in one place for both callers above. */
export function payUrl(path: string, query: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
  const s = q.toString();
  if (path === "/" && !s) return BILLING_URL;
  return `${BILLING_URL}${path}${s ? `?${s}` : ""}`;
}

export const dollars = (n: number) => `$${n.toFixed(2)}`;

/** Money as a sentence says it: whole dollars bare, anything else to the cent — $20, $16.67. */
export const money = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : dollars(n));
