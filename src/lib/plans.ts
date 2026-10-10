/**
 * The subscription catalog, in one place, for every pricing surface.
 *
 * THERE ARE TWO CATALOGS AND THEY ARE DIFFERENT PRODUCTS. Confusing them is
 * what this module exists to prevent:
 *
 *   GET /v1/billing/plans   THIS ONE. commerce's subscription authority — the
 *                           same rows that charge. 17 plans across categories
 *                           personal/team/enterprise/world/social/dns, each
 *                           with `features`. Bare ARRAY, `slug`, `price` in
 *                           CENTS.
 *   GET /v1/plans           Cloud VM tiers — vcpus, memoryGB, diskGB. 11 rows,
 *                           NO `features` on any of them. Shaped `{plans:[…]}`.
 *
 * They collide on the words "pro" and "enterprise" and on nothing else: `pro`
 * the subscription is $20/mo, `pro` the VM tier is $25/mo for 2 vCPU. Reading
 * the VM catalog to render subscriptions is not a wrong number, it is a wrong
 * product — and it crashed this page. The team/enterprise view filtered /v1/plans
 * for `category === "enterprise"`, matched the $429 VM row, replaced the real
 * Team/Enterprise cards with it, and handed a card `features: undefined`. The
 * `.map()` over it took the whole pricing page down to "Something went wrong."
 * for anyone who clicked the tab.
 *
 * So the catalog is named once, mapped once, and guarded once, here.
 *
 * A SuperAdmin edits these rows at admin.hanzo.ai (/v1/commerce/plans/entries),
 * and every reader here follows: the build bakes the authority's answer into the
 * pricing snapshot for the first paint, and the page replaces it with the live
 * read. No price in this repo is typed, and no plan's name: a slug is named by
 * @hanzo/build's `label` (`max-20x` reads Max, with 20x beside it).
 */

import { useEffect, useMemo, useState } from "react";
import { where } from "../where";
import { api } from "./api";
import { org } from "./session";
import { BILLING_URL, checkoutUrl, dollars, money, payUrl } from "./pay";

/** A row exactly as GET /v1/billing/plans returns it. */
export interface BillingPlan {
  slug: string;
  name: string;
  description: string;
  price: number | null;
  priceAnnual?: number | null;
  annualTotal?: number | null;
  category: string;
  features?: string[];
  limits?: Record<string, number | null>;
  popular?: boolean;
  contactSales?: boolean;
  perSeat?: boolean;
  checkoutUrl?: string;
  checkoutId?: string;
}

/** A plan as the pricing cards render it: dollars, and features always present. */
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number | null;
  /** A year shown per month: what each month costs when a year is bought. */
  priceAnnual?: number | null;
  /** What a year charges, once, where the catalog sells a year: `annualTotal`. */
  annualTotal?: number | null;
  category: string;
  popular?: boolean;
  contactSales?: boolean;
  pricePerUser?: boolean;
  features: string[];
  limits?: Record<string, number | null>;
  payouts?: { idleResalePercent: number; description: string };
  checkoutUrl?: string;
  checkoutId?: string;
}


/**
 * The checkout a plan's CTA opens.
 *
 * A catalog row may carry its own link, and then that link wins; otherwise the
 * id is the whole address. The id is also what `plan_clicked` reports, so the
 * plan the event names and the plan the checkout opens cannot disagree.
 */
export function planCheckoutUrl(plan: SubscriptionPlan, back?: string): string {
  return plan.checkoutUrl || checkoutUrl(plan.checkoutId || plan.id, back);
}

/** A subscription term. A month is what every catalog row charges by default. */
export type Interval = "month" | "year";

/**
 * A checkout address for a term: a year adds `interval=year`, a month leaves the
 * address as it is. pay reads the parameter; until it sells a year, its cart
 * states the monthly charge, and the buyer reads that before paying. A relative
 * address is read against the pay site, where every checkout is.
 */
export function term(href: string, interval: Interval): string {
  if (interval === "month") return href;
  const url = new URL(href, BILLING_URL);
  url.searchParams.set("interval", "year");
  return url.toString();
}

/**
 * The cart for `seats` of a per-seat plan, for a term, charged to `org` and
 * returning to `back` once paid. `quantity` is the seat count checkout sells.
 */
export function cartUrl(plan: string, seats: number, interval: Interval, org: string, back: string): string {
  return term(payUrl("/cart", { plan, quantity: String(seats), org, returnUrl: back }), interval);
}

/**
 * Billing speaks CENTS; these pages render dollars. Converting here, once, at
 * the boundary — a price that is 100x wrong on a checkout page is the worst
 * possible rounding bug, so it converts in exactly one place and nowhere else.
 *
 * `features` defaults to [] because a card maps over it. A plan that arrives
 * without features should render as a plan with no features listed, never as a
 * blank page.
 */
function fromBillingPlan(p: BillingPlan): SubscriptionPlan {
  return {
    id: p.slug,
    name: p.name,
    description: p.description,
    priceMonthly: p.price == null ? null : p.price / 100,
    priceAnnual: p.priceAnnual == null ? null : p.priceAnnual / 100,
    annualTotal: p.annualTotal ? p.annualTotal / 100 : null,
    category: p.category,
    popular: p.popular,
    contactSales: p.contactSales,
    pricePerUser: p.perSeat,
    features: p.features ?? [],
    limits: p.limits,
    checkoutUrl: p.checkoutUrl,
    checkoutId: p.checkoutId,
  };
}

/**
 * The authority's rows as the build last read them — scripts/sync-pricing.mjs
 * takes GET /v1/billing/plans into lib/data/plans.json on every build. It is the
 * first paint, and the whole answer wherever the live read fails: a preview host
 * the API does not admit, a reader offline, an outage. The SAME rows as the live
 * read, so the two can differ only by what a SuperAdmin changed since the build.
 */
const baked = (): BillingPlan[] => where().plans ?? [];

/**
 * The catalog, live — or null when commerce did not answer.
 *
 * The difference is the whole point. Commerce is where a plan is listed or
 * archived, so "this category sells nothing right now" is a real answer an admin
 * can produce, and it has to reach the page: archiving the last rung in a
 * category should empty it, not leave the build-time copy standing in as if
 * nothing had changed. A transport error or a non-2xx is null, and a caller keeps
 * the snapshot for it — a commerce outage must not blank the pricing page.
 *
 * ONE READ PER PAGE. Every hook below asks for the whole catalog and filters it,
 * so a page drawing four categories costs one request, not four.
 */
let reading: Promise<BillingPlan[] | null> | null = null;

function live(): Promise<BillingPlan[] | null> {
  reading ??= fetch(`${api()}/v1/billing/plans`)
    .then(async (res) => {
      if (!res.ok) return null;
      const body = await res.json();
      // The catalog answers with a bare array. Tolerate {plans:[…]} so a proxy
      // that wraps it cannot silently yield zero rows. Anything else is not a
      // catalog, and reading it as an empty one would blank the page on a shape
      // change rather than on a decision.
      return Array.isArray(body) ? body : Array.isArray(body?.plans) ? body.plans : null;
    })
    .catch(() => null);
  return reading;
}

/** The plans in one category, live — or null when commerce did not answer. */
export async function loadPlans(category: string): Promise<SubscriptionPlan[] | null> {
  const rows = await live();
  return rows === null ? null : rows.filter((p) => p?.category === category).map(fromBillingPlan);
}

/** The plans in one category as the build last read them. */
export function fallbackPlans(category: string): SubscriptionPlan[] {
  return baked().filter((p) => p.category === category).map(fromBillingPlan);
}

/**
 * Every row the authority serves, in catalog order: painted from the snapshot,
 * replaced by the live read. This is how an edit made at admin.hanzo.ai reaches
 * a reader with no build in between.
 */
export function useCatalog(): SubscriptionPlan[] {
  const [rows, setRows] = useState<SubscriptionPlan[]>(() => baked().map(fromBillingPlan));
  useEffect(() => {
    let open = true;
    live().then((got) => {
      if (open && got) setRows(got.map(fromBillingPlan));
    });
    return () => {
      open = false;
    };
  }, []);
  return rows;
}

/** Dollars as a price is written: two places, always, so a card and a button agree. */

/** The row an organization runs on, priced. */
export interface OrgPlan {
  plan: SubscriptionPlan | null;
  /** The monthly price as money. An em dash until a row resolves — never a guess. */
  price: string;
}

/**
 * Which plan an organization runs on, and what it costs. A plan is a
 * subscription with usage limits; it mints no credit, so nothing here says it does.
 *
 * ONE ANSWER FOR TWO SURFACES. /pricing states the offer and the workspace gate
 * asks a member to buy it; those were two readings of one row, each with its own
 * copy of "the first personal row that charges" and its own money formatter. A
 * marketing page and a subscribe screen quoting different numbers for the same
 * plan is the failure that costs a sale, and it needs only for one of the two
 * copies to be edited.
 *
 * It is the FIRST ROW THAT CHARGES in a category: `personal` is the plan a
 * personal organization runs on, `team` the per-seat plan a team organization
 * runs on, whatever commerce currently prices each at. Neither surface holds the
 * figure, so neither can be wrong on its own.
 *
 * Painted from the snapshot and replaced by the live catalog, which is the
 * contract every reader in this module keeps.
 */
export function usePlan(category = "personal"): OrgPlan {
  return priced(usePlans(category).find((p) => (p.priceMonthly ?? 0) > 0) ?? null);
}

/**
 * A category's rows a reader can buy on their own, in catalog order: the
 * personal ladder from Free up, or the Team plan. Rows sold through a
 * conversation are left out. Painted from the snapshot, replaced by the catalog.
 */
export function usePlans(category: string): SubscriptionPlan[] {
  const all = useCatalog();
  return useMemo(() => all.filter((p) => p.category === category && !p.contactSales), [all, category]);
}

/** A row priced the way every surface writes it. */
export function priced(plan: SubscriptionPlan | null): OrgPlan {
  return { plan, price: plan ? dollars(plan.priceMonthly ?? 0) : "—" };
}


/**
 * What one term of a plan charges, in dollars, or null where the catalog sells
 * no such term. A month is `priceMonthly`. A year is the total the catalog
 * states, or twelve of `priceAnnual` where it states only the monthly figure.
 */
export function charge(plan: SubscriptionPlan, interval: Interval): number | null {
  const n =
    interval === "month"
      ? plan.priceMonthly
      : (plan.annualTotal ?? (plan.priceAnnual ? Math.round(plan.priceAnnual * 1200) / 100 : null));
  return n && n > 0 ? n : null;
}

/**
 * A term's price as a button quotes it — "$20/month", "$200/year" — or null.
 * A year is quoted as the total where the catalog states one, and otherwise as
 * the monthly figure the catalog does state, never as a total derived here.
 */
export function quote(plan: SubscriptionPlan, interval: Interval): string | null {
  if (interval === "month") return plan.priceMonthly ? `${money(plan.priceMonthly)}/month` : null;
  if (plan.annualTotal) return `${money(plan.annualTotal)}/year`;
  return plan.priceAnnual ? `${money(plan.priceAnnual)}/month, billed yearly` : null;
}

/** What a year saves against twelve months, as a whole percent: 1 − year ÷ (12 × month). Null where it saves nothing. */
export function saving(plan: SubscriptionPlan): number | null {
  const month = charge(plan, "month");
  const year = charge(plan, "year");
  if (!month || !year || year >= 12 * month) return null;
  return Math.round((1 - year / (12 * month)) * 100);
}

/**
 * A usage rate as money. A sub-dollar rate needs at least two decimals to read as
 * a price at all — 0.1 is $0.10, not $0.1 — while keeping the precision the
 * catalog states, so $0.015/1K vectors does not round away to a cent.
 */
export function formatUsageRate(v: number): string {
  if (v >= 1) return `$${v.toLocaleString("en-US")}`;
  const decimals = (String(v).split(".")[1] ?? "").length;
  return `$${v.toFixed(Math.max(2, decimals))}`;
}
