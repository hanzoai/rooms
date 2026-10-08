"use client";

// The rooms' shell. ONE of them, worn by /chat and every room. (The web app is
// `/`, whole, with a rail of its own: app/page.tsx. Dev is its door.)
//
// The two routes are the same room with different furniture: a rail on the left,
// a pane on the right. What differs is the rail's title, its nav, and which list
// it shows — three props, not two components. Building a second shell is how the
// two surfaces drift, and they are meant to be one product.
//
// Everything here is composition. The parts come from `@hanzo/ui/chat`, which is
// where the Hanzo chat shell lives for every surface that wears one; this file
// holds arrangement and words and owns no pixels of its own. That is the whole
// architecture: a stranger with `@hanzo/ui`, `@hanzo/ai` and `@hanzo/iam` can
// assemble this room, because nothing in it is private to hanzo.ai.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  MessageSquare,
  Code2,
  Inbox,
  Bot,
  ListChecks,
  HardDrive,
  Settings2,
  UserPlus,
  Building2,
  Search,
  Hash,
  AtSign,
  Lock,
  Workflow,
  Plus,
  ArrowLeft,
  ArrowRight,
  Send,
  Minus,
  Blocks,
  type LucideIcon,
  Star,
  FolderOpen,
  Activity,
  BookOpen,
  SquareTerminal,
  Share2,
  Sparkles,
  PanelLeft,
  PanelRight,
  Users,
  Globe,
  Cpu,
  Boxes,
  Wallet,
  Video,
  Calendar,
  LayoutGrid,
  ArrowUpLeft,
} from "lucide-react";
import {
  AiProvider,
  useAgents,
  useInbox,
  useModels,
  usePeople,
} from "@hanzo/ai/react";
import type { Thread } from "@hanzo/ai";
import { PINNED } from "./recent";
import { ThreadRow, useThreadList } from "./thread";
import { Box, XStack, YStack, Text } from "@hanzo/ui";
// THE PAPER LADDER. `sheet(n)` is a fill AND the light on it, published as a
// pair by @hanzo/design, so a surface asks for a HEIGHT instead of composing a
// shadow — which is the only way three panels on one screen end up lit from one
// direction. `scrim` is the dim under anything that lifts off the page.
import { scrim, sheet } from "@hanzo/ui/glass";
import {
  Sidebar,
  SidebarIconButton,
  SidebarNewChat,
  SidebarScroll,
  SidebarSection,
  SidebarItem,
  SidebarFolder,
} from "@hanzo/ui/chat";
import {
  OrgProjectSwitcher,
  useIam,
  useOrganizations,
} from "@hanzo/iam/react";
import { Grip } from "@hanzo/build";
import {
  HanzoMark,
} from "@hanzogui/shell";
import { useHydrated } from "./lib/hydrated";
import { useHost } from "./lib/hostname";
import { useAi } from "./lib/ai";
import { useTiers, useHidden, type Tier } from "./lib/tiers";
import { useAccount } from "./lib/account";
import { hasSession, superAdmin } from "./lib/session";
import { enter, LOGIN } from "./lib/destination";
import { address, sharedWithMe, type SharedItem } from "./lib/share";
import { list } from "./lib/list";
import { ModelPicker } from "@hanzo/ui/models";
import { parseModels } from "@hanzo/ui/models/catalog";
import { mark } from "./lib/mark";
import { useOpen } from "./open";
import { useSpan } from "./span";
import { pane } from "./ground";

/** The new-agent row's fields: an outlined box in the room's own ink. */
const FIELD = {
  bg: "transparent",
  borderWidth: 1,
  borderColor: "var(--border)",
  rounded: 6,
  py: 6,
  outlineStyle: "none",
  color: "inherit",
  fontSize: "$2",
} as const
/** The side column's grip stands in the gutter the frame leaves, or 8px where there is none; the rail clears the
 *  home indicator on a phone. gui carries a `calc()`, `max()` or `env()` to the page unchanged; its types only name
 *  custom properties. */
const GUTTER_START = "calc(-1 * var(--pane-gap, 0px))" as `var(--${string})`
const GUTTER = "max(8px, var(--pane-gap, 8px))" as `var(--${string})`
const HOME_INDICATOR = "env(safe-area-inset-bottom)" as `var(--${string})`
import { invite } from "./lib/home";
import { reach } from "./lib/reach";
import { say } from "./failure";
import { Face } from "./cast";
import { useStarred, titleOf } from "./stars";
import { roomName } from "./network";
import { useTeamRooms, teamKey, roomHref, type TeamRoom } from "./rooms";
import { apex, dev, ENTRY, room as moves, WORKSPACE } from "./lib/host";
import { netKey } from "./conversations";
import {
  FIRST,
  SettingsList,
  SettingsPane,
  type Row as SettingsRow,
} from "./Settings";
import { Profile } from "./Profile";
import { SupportPicker } from "./Support";
import { Find } from "./Find";
import { Account } from "./Account";
import { ModeMark } from "./ModeMark";
import { called } from "./team";
import type { OrgCommandItem } from "@hanzogui/shell";
import { checkoutUrl } from './lib/pay';

/** Tabs: the terminals, at their own host. */
const TABS = "https://tabs.hanzo.ai/app";
/** Where a plan is chosen. `lib/plans` owns the address; this is the door. */
const BILLING = checkoutUrl();

/**
 * THE FLOOR UNDER ANYTHING A FINGER PRESSES.
 *
 * 44 CSS px each way, which is the width at which a target stops being aimed at
 * and starts being pressed — the number WCAG 2.5.5 and Apple's own guidance
 * arrive at separately, and the one that does not move with the pointer, since a
 * mouse on a laptop and a thumb on the same page get the same control. Every
 * icon control in this shell's own chrome had been drawn at the size of its
 * GLYPH instead: @hanzo/ui gives its icon button 28, the mark's rule in
 * globals.css says 30, and compose padded a 16px pen out to 32.
 *
 * IT IS NOT SPREAD EVERYWHERE, and the exceptions are worth knowing before you
 * grep for why a neighbour is still small: the roster's own '+' and its
 * per-agent remove sit at ~22, and the sidebar filter input is 30. Those are a
 * list's controls rather than the shell's, and they move as that list's own
 * change — but the shell is not uniformly 44 until they do.
 *
 * A MINIMUM and not a size, which is what lets it be applied from here without
 * touching either of those. The used width is the larger of `width` and
 * `min-width`, so the mark reaches 44 while its stylesheet still says 30 and
 * nothing already bigger is disturbed — and the glyphs keep the sizes they were
 * chosen at. A larger icon would be a different drawing; this is the same
 * drawing you can hit.
 */
const TAP = { minWidth: 44, minHeight: 44 } as const;

/** The height of a control you can SEE in the top row — the search field, the
 *  sign-in pill. It is not TAP: a target is 44 so a thumb can find it, and a
 *  control is 28 so a row of them reads as one line. Stating the target on the
 *  element that also carries the border makes the target visible, which is how
 *  the sign-in button came to stand half again as tall as the field beside it. */
const CONTROL = 28;

import {
  getStoredPeople,
  getStoredAgents,
  getCustomThreads,
  createDirectChat,
  type CustomThread,
} from "./contacts-store";
import { bare } from './lib/bare'
import { BAD } from './lib/mix'
import { brand, site, where } from './where'

export type Mode =
  | "home"
  | "chat"
  | "dev"
  | "inbox"
  | "agents"
  | "tasks"
  | "drive"
  | "contacts"
  | "bots"
  | "meet"
  | "cal";

interface Place {
  id: Mode;
  /** Where it is: a route of this export. */
  route: string;
  /** The rail's title here. The product name, never the workspace. */
  title: string;
  /** The rail's word for it. Shorter than the title, because it sits in a row. */
  label: string;
  icon: LucideIcon;
  /** What "new" means here, where it means anything. A destination that cannot
   *  create draws no button rather than one that fails at press. */
  create?: string;
  /** The preview tier this room is behind, or undefined for a room everyone
   *  gets. Chat and Dev carry none — they are the landing's offer. The rest are
   *  alpha or beta until they ship, opened per identity by `useTiers`. */
  tier?: Tier;
}

/**
 * The destinations, in rail order.
 *
 * ONE table. Route, title and icon were three `Record<Mode, …>` standing side by
 * side, which is a shape that lets a sixth destination arrive with two of the
 * three filled in and no error until someone navigates to it.
 */
const HOME: Place = {
  id: "home",
  // The rooms' Home is the host's: /home beside the app, / on hanzo.team.
  get route() {
    return where().home;
  },
  get title() {
    return brand();
  },
  label: "Home",
  // The chat bubble. Home IS the conversation with the org — the rooms it talks
  // in and the people in them — so it is drawn as one. It shared this glyph with
  // Chat once and was given a house to separate them; the two never sit in the
  // rail together (CHAT is a tile, HOME is not), so there is nothing to tell
  // apart, and a house says "a place" where the room is a conversation.
  icon: MessageSquare,
};

/**
 * CHAT LEADS THE RAIL, and Dev follows it.
 *
 * These are the two rooms a person lives in — one to ask and one to build — so
 * they are the first two tiles and the switch between them is one press. The
 * rest of the rail is where you go from there.
 *
 * It was off the rail while /chat answered `invalid redirect_uri`: a tile that
 * leads to an error page offers a door that does not open. The room is this
 * export's own now, so the door opens.
 */
const CHAT: Place = {
  id: "chat",
  route: "/chat",
  get title() {
    return brand();
  },
  label: "Chat",
  icon: MessageSquare,
  create: "New chat",
};

const PLACES: Place[] = [
  {
    id: "dev",
    get route() {
      return dev();
    },
    title: "Hanzo Dev",
    label: "Dev",
    icon: Code2,
    create: "New run",
  },
  {
    id: "agents",
    route: "/work",
    title: "Agents",
    label: "Agents",
    icon: Bot,
    tier: "alpha",
  },
  {
    id: "bots",
    route: "/bots",
    title: "Bots",
    label: "Bots",
    icon: Cpu,
  },
  {
    id: "meet",
    route: "/meet",
    title: "Hanzo Meet",
    label: "Meet",
    icon: Video,
  },
  {
    id: "cal",
    route: "/cal",
    title: "Calendar",
    label: "Calendar",
    icon: Calendar,
  },
  {
    id: "contacts",
    route: "/contacts",
    title: "People & Agents",
    label: "Contacts",
    icon: Users,
  },
  {
    id: "inbox",
    route: "/inbox",
    title: "Inbox",
    label: "Inbox",
    icon: Inbox,
    tier: "beta",
  },
  {
    id: "tasks",
    route: "/board",
    title: "Board",
    label: "Board",
    icon: ListChecks,
    tier: "alpha",
  },
  {
    id: "drive",
    route: "/drive",
    title: "Drive",
    label: "Drive",
    icon: HardDrive,
    tier: "beta",
  },
];

export interface ConsoleProduct {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

export const CONSOLE_PRODUCTS: ConsoleProduct[] = [
  { id: "cloud", label: "Compute & VMs", icon: Cpu, href: "https://platform.hanzo.ai/cloud" },
  { id: "storage", label: "S3 Object Storage", icon: HardDrive, href: "https://platform.hanzo.ai/storage" },
  { id: "datastore", label: "Datastore", icon: Boxes, href: "https://platform.hanzo.ai/datastore" },
  { id: "iam", label: "Identity & Access", icon: Lock, href: "https://identity.hanzo.ai" },
  { id: "observe", label: "Observability", icon: Activity, href: "https://platform.hanzo.ai/observability" },
  { id: "network", label: "Zero Trust & Zap", icon: Globe, href: "https://platform.hanzo.ai/network" },
  { id: "flow", label: "Agent Flow", icon: Workflow, href: "https://flow.hanzo.ai" },
  { id: "models", label: "Foundation Models", icon: Blocks, href: "https://models.hanzo.ai" },
  { id: "webhooks", label: "Webhooks & Events", icon: Send, href: "https://platform.hanzo.ai/webhooks" },
  { id: "billing", label: "Billing & Wallet", icon: Wallet, href: BILLING },
];

/**
 * Whether a place belongs in THIS reader's rail.
 *
 * A place with no tier is the landing's offer — Chat and Dev — and everyone gets
 * it. A tiered room shows only where two things are true: the reader's identity
 * OPENS the tier (`useTiers`: a SuperAdmin gets every tier, an alpha/beta org its
 * own, a stranger none), and the reader has not HIDDEN it in Settings. The rooms
 * stay in PLACES either way — the structure is whole — so opening a tier is a
 * flag flip, not a code change. Hide, never delete.
 *
 * A rail of two is what a stranger meets, which is the landing's offer exactly.
 * The other four are dark until each ships and its tier is turned on.
 *
 * ON THE APEX THE ROOMS ARE hanzo.team'S. There a place shows only when its
 * route stays on the apex, which is Chat and Dev, and the rail ends in one tile
 * that opens the workspace instead.
 */
const shows = (place: Place, tiers: Set<Tier>, hidden: Set<Tier>, onApex: boolean): boolean =>
  !(onApex && moves(place.route)) &&
  (!place.tier || (tiers.has(place.tier) && !hidden.has(place.tier)));

/**
 * WHERE "GO THERE" COMES FROM, and why it is a prop.
 *
 * The rail moves between rooms, which is the one thing in this shell only the
 * HOST can do: a Next route pushes through its router, a Tauri window swaps a
 * view, an embedded surface may refuse to navigate at all. Taking `navigate`
 * as a prop is what leaves this file — and every component under it — with no
 * import from any framework, so the same shell mounts under Next, under Vite
 * in a desktop webview, or under a test that just records where it was asked
 * to go.
 *
 * Measured before the change: `next/navigation` here and `next/link` in
 * `Chat.tsx` were the ONLY two framework imports in the whole /chat + /dev
 * surface — 13 files, all `'use client'`, no RSC. Those two were the entire
 * cost of the port, and this removes one of them.
 */
export function Workspace({
  mode,
  children,
  navigate,
  back,
  forward,
}: {
  mode: Mode;
  children: ReactNode;
  /** Take the reader to a route. Absent, the rail's places do not navigate. */
  navigate?: (route: string) => void;
  /** Step back through this reader's own history. Absent, the arrows are not drawn. */
  back?: () => void;
  /** And forward again. */
  forward?: () => void;
}) {
  const { client } = useAi();
  return (
    // ONE client for the whole room. `AiProvider` prefers the `client` prop over
    // the one it built, so a session that settles after mount reaches every hook
    // below — which is exactly what its internal `useRef` would otherwise
    // prevent. Signed out the prop is absent and the provider's own anonymous
    // client stands in, so `useAi()` never throws and the org-scoped hooks simply
    // answer nothing.
    //
    // `Frame` is a separate component because the rail READS through those hooks,
    // and a hook cannot run in the component that mounts its provider.
    // The SELECTION is deliberately not provided here. It lives in `room.ts`,
    // outside React, because this component is what the router mounts — holding
    // it in state here is what emptied the room on every route change.
    <AiProvider client={client ?? undefined}>
      <Frame mode={mode} navigate={navigate} back={back} forward={forward}>
        {children}
      </Frame>
    </AiProvider>
  );
}

/**
 * The conversations, for /chat only.
 *
 * It owns its hook so the request is made by the surface that draws it —
 * mounted from `Frame` this ran on /dev too, one authenticated read per page
 * load whose answer was never rendered. Remounting it (a changed `key`) is the
 * refresh, so nothing has to hand a `reload` back up the tree.
 */
/**
 * WHEN a conversation was last spoken in, as a heading.
 *
 * Time is the only thing the platform says about a thread besides its title —
 * `Thread` is `{id, title, updatedAt}` — so it is the only grouping that can be
 * true. A folder per project would be an invention: nothing files a thread
 * under anything, and headings a reader could not have caused are worse than no
 * headings.
 *
 * The bands are the ones a person actually reasons in. "Today" and "Yesterday"
 * are named because someone remembers those; past that a date is a better
 * answer than a count of days, and past a month the month alone is enough.
 */
function when(iso: string | undefined, now: Date): string {
  if (!iso) return "Earlier";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Earlier";
  const day = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  if (at.getFullYear() === now.getFullYear())
    return at.toLocaleDateString(undefined, { month: "long" });
  return at.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * WHEN A CONVERSATION STARTED, from its own id.
 *
 * `Thread` publishes a title and `updatedAt` and no created time — but the id
 * is `<nanoseconds>-<seq>`, and that leading number IS the instant it was
 * minted. Verified against the live store: id 1787970910036802961 and
 * updatedAt 2026-08-28T19:35:10.036806065 name the same moment, to the
 * nanosecond. So the pair a reader wants — when it began and when it was last
 * touched — is already on the wire and needs no new field.
 */
function born(id: string): Date | null {
  const ns = Number(id.split("-")[0]);
  if (!Number.isFinite(ns) || ns <= 0) return null;
  const at = new Date(ns / 1e6);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** A day and a clock, in the reader's own locale. */
const moment = (at: Date): string =>
  at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * The two ends of a conversation, on one line.
 *
 * Started AND last used, because they answer different questions — which one is
 * the old thread, and which one is still alive. Where a conversation was used
 * on the day it began, the second half would repeat the first, so it says the
 * one moment instead of the same moment twice.
 */
function Span({ id, updatedAt }: { id: string; updatedAt?: string }) {
  const from = born(id);
  const to = updatedAt ? new Date(updatedAt) : null;
  if (!from) return null;
  const moved = to && !Number.isNaN(to.getTime()) && to.getTime() - from.getTime() > 60_000;
  return (
    <Text fontSize="$1" color="$soft" numberOfLines={1}>
      {moved ? `${moment(from)} — ${moment(to)}` : moment(from)}
    </Text>
  );
}

function Chats({
  filter = "",
  onPick,
}: {
  filter?: string;
  onPick?: () => void;
}) {
  const { thread, open } = useOpen();
  // RECENTS ARE THE READER'S OWN, or there are none.
  //
  // An empty list was replaced with ten invented conversation titles carrying
  // manufactured timestamps — "Composer display and UI styling fixes", "Office-
  // lease-agreement file search" — banded under Today and Yesterday like a
  // history somebody had. A visitor's first sight of the app was ten chats they
  // had never had, and every one of them opened nothing.
  const { threads, loading, error: wrong } = useThreadList(false, thread);
  const [customThreads, setCustomThreads] = useState<CustomThread[]>([]);

  useEffect(() => {
    setCustomThreads(getCustomThreads());
    const handleThreadChange = () => setCustomThreads(getCustomThreads());
    window.addEventListener("hanzo_threads_changed", handleThreadChange);
    return () => window.removeEventListener("hanzo_threads_changed", handleThreadChange);
  }, []);

  const { isAuthenticated, user } = useIam();
  const { user: account } = useAccount();
  const signedIn = isAuthenticated || Boolean(user) || Boolean(account) || hasSession();

  const mergedThreads = useMemo(() => {
    const list: Array<{ id: string; title: string; updatedAt: any; kind?: "call" | "group"; thread?: Thread }> = threads.map((t) => ({
      id: t.id,
      title: t.title || "Untitled",
      updatedAt: t.updatedAt,
      thread: t,
    }));
    for (const ct of customThreads) {
      if (!list.some((t) => t.id === ct.id)) {
        list.push({
          id: ct.id,
          title: ct.title,
          updatedAt: ct.updatedAt,
          ...(ct.type === "call" || ct.type === "group" ? { kind: ct.type } : {}),
        });
      }
    }
    return list;
  }, [threads, customThreads]);

  const found = mergedThreads.filter((t) => matches(t.title || "Untitled", filter));

  // PINNED FIRST, by the server's pin (thread.tsx), then the days.
  const shown = found.filter((t) => !t.thread?.pinned);
  const kept = found.filter((t) => t.thread?.pinned);

  const bands: { label: string; rows: typeof shown }[] = [];
  if (kept.length) bands.push({ label: PINNED, rows: kept });
  const now = new Date();
  for (const t of shown) {
    const label = when(t.updatedAt, now);
    const last = bands[bands.length - 1];
    if (last && last.label === label && last.label !== PINNED) last.rows.push(t);
    else bands.push({ label, rows: [t] });
  }

  if (!signedIn) return <Note>Sign in to see your recent chats.</Note>;

  const mine = wrong ? (
    <Note>{say(wrong, "your chats")}</Note>
  ) : loading && threads.length === 0 ? (
    <Note>Reading your chats.</Note>
  ) : found.length === 0 && filter ? (
    <Note>No chat matches “{filter}”.</Note>
  ) : threads.length === 0 ? (
    <Note>No chats yet. Say something and it lands here.</Note>
  ) : null;

  return (
    <>
      {mine}
      {mine ? null : bands.map((band) => (
        <SidebarSection key={band.label} label={band.label}>
          {band.rows.map((t) => {
            const item = (
            <SidebarItem
              key={t.id}
              active={t.id === thread}
              onPress={() => {
                open(t.id);
                onPick?.();
              }}
            >
              <YStack minW={0}>
                {/* A call or a group says so with the shell's own monochrome glyph, never a colour emoji. */}
                <XStack items="center" gap="$1.5" minW={0}>
                  {t.kind === "call" ? <Video size={13} color="var(--muted-foreground)" aria-label="Call" /> : null}
                  {t.kind === "group" ? <Users size={13} color="var(--muted-foreground)" aria-label="Group" /> : null}
                  <Text fontSize="$2" color="$ink" numberOfLines={1}>
                    {t.title || "Untitled"}
                  </Text>
                </XStack>
                <Span id={t.id} updatedAt={t.updatedAt} />
              </YStack>
            </SidebarItem>
            );
            // A stored conversation carries its menu; a call or a group is no conversation of the store's.
            return t.thread ? (
              <ThreadRow key={t.id} t={t.thread} active={t.id === thread} listed={false}>
                {item}
              </ThreadRow>
            ) : (
              item
            );
          })}
        </SidebarSection>
      ))}
      <SharedWithYou filter={filter} onPick={onPick} />
    </>
  );
}

/**
 * The chats other people shared with this reader, and who shared each: every
 * link they opened signed in, still live and still open to them (lib/share.ts).
 * Pressing one reads it at /chat/shared, by its share id — no token is held for
 * it.
 */
function SharedWithYou({ filter, onPick }: { filter: string; onPick?: () => void }) {
  const [items, setItems] = useState<SharedItem[] | null>(null);
  useEffect(() => {
    let on = true;
    sharedWithMe()
      .then((got) => on && setItems(got))
      .catch(() => on && setItems([]));
    return () => {
      on = false;
    };
  }, []);
  const shown = (items ?? []).filter((one) => matches(one.title || "Untitled", filter));
  if (shown.length === 0) return null;
  return (
    <SidebarSection label="Shared with you">
      {shown.map((one) => (
        <SidebarItem
          key={one.share}
          onPress={() => {
            onPick?.();
            window.location.assign(address(one.share));
          }}
        >
          <YStack minW={0}>
            <Text fontSize="$2" color="$ink" numberOfLines={1}>
              {one.title || "Untitled"}
            </Text>
            {one.by ? (
              <Text fontSize="$1" color="$soft" numberOfLines={1}>
                From {one.by}
              </Text>
            ) : null}
          </YStack>
        </SidebarItem>
      ))}
    </SidebarSection>
  );
}

/**
 * The projects. A run is something that happened, a project is the thing it
 * happened TO, and the reader picks the second to see the first — pressing a
 * name opens that project's workspace in the app, at `/`.
 *
 * IT OWNS ITS READ, like every other list in this column — mounted from the
 * frame it would fetch on every page load for every reader, including one whose
 * org answers 403.
 */
function Projects({
  filter,
  onPick,
}: {
  filter: string;
  onPick?: (slug: string) => void;
}) {
  const { client } = useAi();
  const [starred] = useStarred('projects');
  const [rows, setRows] = useState<{ id: string; name: string; slug?: string }[] | null>(null);
  // A REFUSAL IS NOT A PROJECT LIST. The catch below wrote `hanzo`, `zoolabs`
  // and `lux` into the rail — three orgs this reader may have nothing to do
  // with — and the same three covered "not asked yet" and "genuinely none". So
  // a 403 drew the same column as a healthy org, and pressing one of those rows
  // opened a project that does not exist for the person who pressed it.
  const [wrong, setWrong] = useState<unknown>(null);

  useEffect(() => {
    if (!client) return;
    let live = true;
    setWrong(null);
    client.http
      .json<{ id: string; name: string; slug?: string }[]>({ path: "/v1/projects" })
      .then((found) => live && setRows(Array.isArray(found) ? found : []))
      .catch((e: unknown) => {
        if (!live) return;
        setRows(null);
        setWrong(e);
      });
    return () => {
      live = false;
    };
  }, [client]);

  const list = Array.isArray(rows) ? rows : [];
  const found = list.filter((r) => matches(r.name, filter));
  const shown = [
    ...found.filter((r) => starred.has(r.id)),
    ...found.filter((r) => !starred.has(r.id)),
  ];

  return (
    <>
      {wrong ? (
        <Note>{say(wrong, "your projects")}</Note>
      ) : rows === null ? (
        <Note>Reading your projects.</Note>
      ) : list.length === 0 ? (
        <Note>Nothing deployed yet.</Note>
      ) : shown.length === 0 ? (
        <Note>No project matches “{filter}”.</Note>
      ) : null}

      {shown.map((one) => (
        <YStack key={one.id} gap="$0.5">
          <SidebarItem
            icon={
              starred.has(one.id) ? (
                <Star size={13} fill="currentColor" aria-hidden />
              ) : (
                <FolderOpen size={13} aria-hidden />
              )
            }
            onPress={() => onPick?.(one.slug || one.name)}
          >
            {one.name}
          </SidebarItem>
        </YStack>
      ))}
    </>
  );
}


/**
 * The rooms the inbox holds, under the transport that carried each one.
 *
 * The transport is the section because that is how a person holds it: Slack
 * here, iMessage there. The same display name can appear under both without
 * being one person — `senderUser` is declared by the schema and omitted by every
 * measured message, so a handle is a handle and a name would be a guess.
 *
 * `useInbox` groups the page it fetched; the server has no rooms route. So this
 * is the rooms in what has ARRIVED, and it grows as the page does.
 */
function Rooms({
  onPick,
  navigate,
}: {
  onPick?: () => void;
  navigate?: (route: string) => void;
}) {
  const { room, openRoom } = useOpen();
  const { rooms } = useInbox({ limit: 100 });
  if (rooms.length === 0) return null;

  const carried = new Map<string, typeof rooms>();
  for (const one of rooms) {
    const held = carried.get(one.channel);
    if (held) held.push(one);
    else carried.set(one.channel, [one]);
  }

  return (
    <>
      {[...carried].map(([channel, held]) => (
        <SidebarFolder key={channel} name={channel} defaultOpen>
          {held.map((one) => (
            <SidebarItem
              key={one.key}
              active={netKey(one) === room}
              onPress={() => {
                // ONE NAMESPACE. This wrote the bare inbox key while the team
                // rows wrote a bare room id, into the SAME slot — so whichever
                // pane was open looked the value up in its own list, missed,
                // and drew nothing. `conversations.ts` holds the one key.
                openRoom(netKey(one));
                navigate?.("/inbox");
                onPick?.();
              }}
            >
              {roomName(one)}
            </SidebarItem>
          ))}
        </SidebarFolder>
      ))}
    </>
  );
}

/** Whether a name answers what was typed. Case-folded substring: three letters
 *  of a half-remembered name is not a pattern, and should not have to be. */
const matches = (name: string, filter: string): boolean =>
  !filter || name.toLowerCase().includes(filter.toLowerCase());

/**
 * WHAT A SECTION SAYS WHEN IT HAS NO ROWS.
 *
 * Every folder in this rail drew only when it had something, so a list that was
 * still loading, a list that was empty and a list whose service had refused all
 * came out as the same blank — and blank was indistinguishable from an org that
 * owns nothing. That is precisely the gap the invented rosters were filling.
 * One line, in the sidebar's own quiet type, and the three states read apart.
 */
function Note({ children }: { children: ReactNode }) {
  return (
    <YStack pl="$4" pr="$3" py="$1.5">
      <Text fontSize="$1" color="$soft">
        {children}
      </Text>
    </YStack>
  );
}

function Team({
  filter = "",
  onPick,
  navigate,
}: {
  filter?: string;
  onPick?: () => void;
  /** A room opens in the ONE place every conversation is read, at the address
   *  that names it, so the host can carry it to hanzo.team from the apex. */
  navigate?: (route: string) => void;
}) {
  const { room, openRoom } = useOpen();
  const { rooms, wrong } = useTeamRooms();
  const { isAuthenticated, user } = useIam();
  const { user: account } = useAccount();
  const signedIn = isAuthenticated || Boolean(user) || Boolean(account) || hasSession();

  const [starred] = useStarred();

  const shown = list<TeamRoom>(rooms).filter((r) => matches(r.name, filter));

  const favourites = shown.filter((r) => starred.has(titleOf(r.name, r.direct)));
  const publicChannels = shown.filter((r) => !r.direct && r.visibility === "public");
  const orgChannels = shown.filter((r) => !r.direct && (r.visibility === "org" || (!r.visibility && !r.private)));
  const privateChannels = shown.filter((r) => !r.direct && (r.visibility === "private" || r.private));
  const directs = shown.filter((r) => r.direct);

  // THE ORDER IS SESSION, THEN REFUSAL, THEN SILENCE — the ladder every room in
  // this app climbs (see Home's `Waiting`). "Reading." never resolves for a
  // reader nobody is going to answer, so the session is asked first.
  if (!signedIn) return <Note>Sign in to see your org&apos;s rooms.</Note>;
  if (wrong) return <Note>{say(wrong, "your rooms")}</Note>;
  if (rooms === null) return <Note>Reading your rooms.</Note>;
  if (rooms.length === 0)
    return <Note>No rooms yet. Open one and the conversation has somewhere to live.</Note>;
  if (shown.length === 0) return <Note>No room matches “{filter}”.</Note>;

  return (
    <>
      {favourites.length > 0 ? (
        <SidebarFolder name="Favorites" defaultOpen>
          {favourites.map((one) => (
            <SidebarItem
              key={one.id}
              active={teamKey(one) === room}
              icon={<Star size={13} aria-hidden />}
              onPress={() => {
                openRoom(teamKey(one));
                navigate?.(roomHref(teamKey(one)));
                onPick?.();
              }}
            >
              {one.name}
            </SidebarItem>
          ))}
        </SidebarFolder>
      ) : null}

      {publicChannels.length > 0 ? (
        <SidebarFolder name="Public Channels" defaultOpen>
          {publicChannels.map((one) => (
            <SidebarItem
              key={one.id}
              active={teamKey(one) === room}
              icon={<Globe size={13} aria-hidden />}
              onPress={() => {
                openRoom(teamKey(one));
                navigate?.(roomHref(teamKey(one)));
                onPick?.();
              }}
            >
              {one.name}
            </SidebarItem>
          ))}
        </SidebarFolder>
      ) : null}

      {orgChannels.length > 0 ? (
        <SidebarFolder name="Org Channels" defaultOpen>
          {orgChannels.map((one) => (
            <SidebarItem
              key={one.id}
              active={teamKey(one) === room}
              icon={<Hash size={13} aria-hidden />}
              onPress={() => {
                openRoom(teamKey(one));
                navigate?.(roomHref(teamKey(one)));
                onPick?.();
              }}
            >
              {one.name}
            </SidebarItem>
          ))}
        </SidebarFolder>
      ) : null}

      {privateChannels.length > 0 ? (
        <SidebarFolder name="Private Channels" defaultOpen>
          {privateChannels.map((one) => (
            <SidebarItem
              key={one.id}
              active={teamKey(one) === room}
              icon={<Lock size={13} aria-hidden />}
              onPress={() => {
                openRoom(teamKey(one));
                navigate?.(roomHref(teamKey(one)));
                onPick?.();
              }}
            >
              {one.name}
            </SidebarItem>
          ))}
        </SidebarFolder>
      ) : null}

      {directs.length > 0 ? (
        <SidebarFolder name="Direct messages" defaultOpen>
          {directs.map((one) => (
            <SidebarItem
              key={one.id}
              active={teamKey(one) === room}
              icon={<AtSign size={13} aria-hidden />}
              onPress={() => {
                openRoom(teamKey(one));
                navigate?.(roomHref(teamKey(one)));
                onPick?.();
              }}
            >
              {one.name}
            </SidebarItem>
          ))}
        </SidebarFolder>
      ) : null}
    </>
  );
}

/**
 * The teammates, as a directory.
 *
 * IAM knows who is in the org, which is why these rows are real. It publishes no
 * route that sends one of them a message, so a row here IDENTIFIES rather than
 * opens — a name that looks like a conversation and starts nothing is worse than
 * a name that is plainly a name.
 */
/**
 * The bots, which ARE openable: an agent has runs, and a run is a thing to
 * watch. Picking one selects it; Agents is where it works.
 */
/**
 * AGENTS & APPS — the org's agents, and the two things you can do to one.
 *
 * IT IS DRAWN EVEN WHEN EMPTY. It used to return null on an empty list, which
 * is the state a new org is in — so the one section that can ADD an agent was
 * absent exactly while there were none, and the way in existed only after
 * somebody had already found another way in.
 *
 * The header carries the `+` because that is where the section's own verb
 * belongs; `@hanzo/ui`'s `SidebarFolder` publishes no slot for one, so the
 * header is composed here against the same tokens. When that prop exists this
 * goes back to being a folder — Channels wants the same button.
 *
 * REMOVING ASKS ONCE. An agent is a definition somebody wrote and there is no
 * undo, so the minus arms and the second press does it. Not a dialog: a dialog
 * over a sidebar row is a bigger interruption than the thing it guards.
 */
/**
 * PEOPLE & AGENTS — one list, because it is one question.
 *
 * They were two sections, Direct messages and Agents & apps, and the split was
 * about what a name IS rather than about what a reader is looking for: you come
 * to this column to find whoever you are about to talk to, and whether they run
 * on a model is a property of the row, not a reason to look somewhere else. The
 * count in the header is the whole roster, which is the number a person means
 * when they ask how big the team is.
 *
 * The order is people, then agents. Not a ranking — the org's people are the
 * shorter and more stable list, so putting them first keeps the rows a reader
 * already knows in the same place as agents come and go.
 */
function Bots({
  show,
  owner,
  filter = "",
  onPick,
  navigate,
}: {
  /** Which half of the roster this draws: the agents under Bots, or the people under Contacts. */
  show: "agents" | "people";
  owner?: string;
  filter?: string;
  onPick?: () => void;
  navigate?: (route: string) => void;
}) {
  const { agents: room, openAgent, withAgents, openSession, open: openThread } = useOpen();
  const { agents, create, remove, loading: agentsLoading, error: agentsWrong } = useAgents();
  const {
    people,
    loading: peopleLoading,
    error: peopleWrong,
  } = usePeople({ owner: owner ?? "", service: false });
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sortMode, setSortMode] = useState<"alpha" | "recent">("alpha");
  const [arming, setArming] = useState<string | null>(null);

  const [storedPeople, setStoredPeople] = useState<any[]>([]);
  const [storedAgents, setStoredAgents] = useState<any[]>([]);

  useEffect(() => {
    setStoredPeople(getStoredPeople());
    setStoredAgents(getStoredAgents());
    const onChange = () => {
      setStoredPeople(getStoredPeople());
      setStoredAgents(getStoredAgents());
    };
    window.addEventListener("hanzo_contacts_changed", onChange);
    window.addEventListener("hanzo_agents_changed", onChange);
    return () => {
      window.removeEventListener("hanzo_contacts_changed", onChange);
      window.removeEventListener("hanzo_agents_changed", onChange);
    };
  }, []);

  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [model, setModel] = useState("enso");
  const [emoji, setEmoji] = useState("");
  const [avatar, setAvatar] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const picking = useRef<HTMLInputElement | null>(null);
  const { models } = useModels();
  const listed = useMemo(() => parseModels(models), [models]);

  const allPeopleMap = new Map<string, any>();
  for (const p of (Array.isArray(storedPeople) ? storedPeople : [])) if (p?.id) allPeopleMap.set(p.id, p);
  for (const p of (Array.isArray(people) ? people : [])) if (p?.id) allPeopleMap.set(p.id, p);
  const allPeople = Array.from(allPeopleMap.values());

  const allAgentsMap = new Map<string, any>();
  for (const a of (Array.isArray(storedAgents) ? storedAgents : [])) if (a?.id) allAgentsMap.set(a.id, a);
  for (const a of (Array.isArray(agents) ? agents : [])) if (a?.id) allAgentsMap.set(a.id, a);
  const allAgents = Array.from(allAgentsMap.values());

  let shown = allAgents.filter((a) => a && a.name && matches(a.name, filter));
  let folk = allPeople.filter((one) => one && matches(one.displayName || one.name, filter));
  if (show === "agents") folk = [];
  else shown = [];

  if (sortMode === "alpha") {
    shown = [...shown].sort((a, b) => a.name.localeCompare(b.name));
    folk = [...folk].sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
  }
  const empty = folk.length + shown.length === 0;
  const waiting = agentsLoading || peopleLoading;
  const broke = agentsWrong ?? peopleWrong;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setWrong(null);
    try {
      // The same crop-and-encode a person's photo goes through: square, 256px,
      // quality lowered until it is inside the store's bound. One contract for
      // every face, so an agent's picture is not a second kind of picture.
      setAvatar(await mark(file));
      setEmoji("");
    } catch (e) {
      setWrong(reach(e));
    }
  };

  const add = async () => {
    const called = name.trim();
    if (!called) return;
    setBusy(true);
    setWrong(null);
    try {
      const made = await create({
        name: called,
        model: model || "enso",
        // At most one half, which is what the store keeps anyway — sending both
        // would leave the server to break a tie this side already decided.
        ...(avatar ? { avatar } : emoji.trim() ? { emoji: emoji.trim() } : {}),
      });
      setMaking(false);
      setName("");
      setEmoji("");
      setAvatar("");
      openSession(made.id);
      onPick?.();
    } catch (e) {
      // The form stays open holding what was typed, which is the only state
      // from which trying again is one press rather than three.
      setWrong(reach(e));
    } finally {
      setBusy(false);
    }
  };

  const drop = async (id: string, name: string) => {
    setBusy(true);
    try {
      await remove(id);
      if (room.includes(name)) openAgent(name);
    } catch {
      // Left in the list, which is the truth if the delete did not land.
    } finally {
      setArming(null);
      setBusy(false);
    }
  };

  return (
    <YStack>
      <XStack
        items="center"
        gap="$1.5"
        px="$3"
        py="$1"
        rounded="$2"
        hoverStyle={{ bg: "$hover" }}
      >
        <Box
          render="button"
          onClick={() => navigate?.(show === "agents" ? "/bots" : "/contacts")}
          flex={1}
          minW={0}
        >
          <XStack items="center" gap="$1.5">
            <Text fontSize="$2" color="$quiet" numberOfLines={1}>
              {show === "agents" ? "Agents" : "People"}
            </Text>
            {folk.length + shown.length > 0 ? (
              <Text fontSize="$1" color="$soft">
                {folk.length + shown.length}
              </Text>
            ) : null}
          </XStack>
        </Box>
        <Box
          render="button"
          onClick={(e) => {
            e.stopPropagation();
            setSortMode((m) => (m === "alpha" ? "recent" : "alpha"));
          }}
          title={sortMode === "alpha" ? "Sorting A-Z (Click for Recent)" : "Sorting Recent (Click for A-Z)"}
          px="$1.5"
          py="$0.5"
          rounded="$1"
          bg="$raised"
          hoverStyle={{ opacity: 0.8 }}
          display="flex"
          items="center"
          justify="center"
          $touchable={{ minH: 40, minW: 40 }}
        >
          <Text fontSize={12} fontWeight="600" color="$soft">
            {sortMode === "alpha" ? "A-Z" : "Recent"}
          </Text>
        </Box>
        {show === "agents" ? (
        <Box
          render="button"
          onClick={() => {
            if (busy) return;
            setOpen(true);
            setMaking((v) => !v);
          }}
          aria-disabled={busy}
          aria-expanded={making}
          aria-label="New agent"
          p="$1"
          rounded="$2"
          hoverStyle={{ bg: "$raised" }}
        >
          <Plus size={14} aria-hidden />
        </Box>
        ) : null}
      </XStack>

      {open && making ? (
        <YStack
          pl="$4"
          pr="$3"
          py="$2"
          gap="$2"
        >
          <XStack items="center" gap="$2">
            {/* The face is the control that sets it — press the picture to
                change the picture, which is where a reader looks for it. */}
            <Box
              render="button"
              onClick={() => picking.current?.click()}
              aria-label="Pick a picture"
              rounded={9999}
            >
              <Face src={avatar} emoji={emoji} name={name || "?"} size={32} person />
            </Box>
            <input
              ref={picking}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Text
              render={
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) void add();
                    if (e.key === "Escape") setMaking(false);
                  }}
                  placeholder="Name"
                  aria-label="Agent name"
                  autoFocus
                />
              }
              {...FIELD}
              flex={1}
              minW={0}
              px={8}
            />
          </XStack>

          <XStack items="center" gap="$2">
            <Text
              render={
                <input
                  value={emoji}
                  onChange={(e) => {
                    setEmoji(e.target.value);
                    if (e.target.value) setAvatar("");
                  }}
                  placeholder="🙂"
                  aria-label="Emoji"
                />
              }
              {...FIELD}
              width={44}
              text="center"
              px={4}
            />
            {/* WHICH MIND. The catalog is the org's own, so this offers what
                actually answers rather than a name that has to match one. */}
            <YStack flex={1} minW={0}>
              <ModelPicker models={listed} scope="chat" value={model} onChange={setModel} size="sm" />
            </YStack>
            <Box
              render="button"
              onClick={() => {
                if (!busy) void add();
              }}
              aria-disabled={busy || !name.trim()}
              opacity={busy || !name.trim() ? 0.5 : 1}
              px="$2.5"
              py="$1.5"
              rounded="$2"
              borderWidth={1}
              borderColor="$borderColor"
              hoverStyle={{ bg: "$raised" }}
            >
              <Text fontSize="$1" color="$ink">
                {busy ? "Adding" : "Add"}
              </Text>
            </Box>
          </XStack>

          {wrong ? (
            <Text fontSize="$1" color={BAD} numberOfLines={2}>
              {wrong}
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {open ? (
        <YStack pl="$4" gap="$0.5">
          {/* The section keeps its `+` and its way into the directory in every
              state — those are how a roster STOPS being empty, and hiding them
              while it is empty is what made an empty org a dead end. */}
          {broke ? (
            <Note>{say(broke, "this org's roster")}</Note>
          ) : waiting && empty ? (
            <Note>Reading the roster.</Note>
          ) : empty ? (
            <Note>{show === "agents" ? "No agents yet. Add one with +." : "No one here yet. Invite a teammate."}</Note>
          ) : null}

          {folk.map((person) => {
            const called = person.displayName || person.name;
            return (
              <SidebarItem
                key={person.id}
                icon={<Face name={called} src={person.avatar} size={20} person />}
                onPress={() => {
                  const threadId = createDirectChat({
                    id: person.id,
                    name: called,
                    avatar: person.avatar,
                  });
                  openThread(threadId);
                  navigate?.("/chat");
                  onPick?.();
                }}
              >
                <YStack minW={0}>
                  <Text fontSize="$2" color="$ink" numberOfLines={1}>
                    {called}
                  </Text>
                  {person.email ? (
                    <Text fontSize="$1" color="$soft" numberOfLines={1}>
                      {person.email}
                    </Text>
                  ) : null}
                </YStack>
              </SidebarItem>
            );
          })}

          {shown.map((agent) => (
            <XStack key={agent.id} items="center" gap="$1">
              <YStack flex={1} minW={0}>
                <SidebarItem
                  active={room.includes(called(agent.name))}
                  icon={
                    <Face
                      src={(agent as any).avatar}
                      emoji={(agent as any).emoji}
                      name={agent.name}
                      size={18}
                    />
                  }
                  onPress={() => {
                    setArming(null);
                    const threadId = createDirectChat({
                      id: agent.id,
                      name: called(agent.name),
                      isAgent: true,
                      avatar: (agent as any).avatar || (agent as any).emoji,
                    });
                    openThread(threadId);
                    withAgents([called(agent.name)]);
                    navigate?.("/chat");
                    onPick?.();
                  }}
                >
                  {called(agent.name)}
                </SidebarItem>
              </YStack>
              <Box
                render="button"
                onClick={() => {
                  if (busy) return;
                  if (arming === agent.id) void drop(agent.id, called(agent.name));
                  else setArming(agent.id);
                }}
                aria-label={
                  arming === agent.id
                    ? `Remove ${called(agent.name)}`
                    : `Remove ${called(agent.name)}?`
                }
                p="$1"
                rounded="$2"
                opacity={arming === agent.id ? 1 : 0.45}
                hoverStyle={{ opacity: 1, bg: "$raised" }}
              >
                {arming === agent.id ? (
                  <Text fontSize="$1" color={BAD}>
                    Remove
                  </Text>
                ) : (
                  <Minus size={13} aria-hidden />
                )}
              </Box>
            </XStack>
          ))}

          {/* The other way an agent arrives: somebody else already wrote it. */}
          <SidebarItem
            icon={<Blocks size={13} aria-hidden />}
            onPress={() => {
              setArming(null);
              onPick?.();
              navigate?.("/contacts");
            }}
          >
            Browse the directory
          </SidebarItem>
        </YStack>
      ) : null}
    </YStack>
  );
}

/** A phone's tab bar: the rail along the foot, above the home indicator. */
const TABS_HEIGHT = "calc(56px + env(safe-area-inset-bottom))"

/** A column's width, px: the floor a drag holds, the ceiling, and the default a double-click returns to. */
const FLOOR = 200
const CEIL = 480
/** Per-reader, per-browser. A width that resets is a width you set every load. */
const SPAN = "hanzo.sidebar.span"
const BESIDE = "hanzo.aside.span"
/** The column beside a room: its default width, px. */
const BESIDE_WIDTH = 380
/** The rooms' sidebar: its default width, px. */
const SIDEBAR_WIDTH = 244

/**
 * Where a room's own column goes, when it has one.
 *
 * The frame owns the COLUMN — its width, its edge, whether it is open — and the
 * room owns what is IN it, which is the only split that lets the shell stay
 * ignorant of sources and previews and whatever a room grows next. A slot rather
 * than a prop because the content belongs to the room's own state: passed up
 * through the router as a prop, the sources of an answer would have to live
 * somewhere both the route and the pane can see, and that is the conversation
 * itself moved out of the component holding it.
 */
const Slot = createContext<HTMLElement | null>(null)

/** Whether the room is drawn in the app's frame (`Paned framed`), where what
 *  floats on the frame's ground is cut as a pane. */
export const Framed = createContext(false)

/** Puts its children in the column beside the room. Draws nothing where the
 *  frame has no column open. */
export function Beside({ children }: { children: ReactNode }) {
  const slot = useContext(Slot)
  if (!slot) return null
  // WHAT IS BESIDE THE ROOM CANNOT PUT SOMETHING BESIDE THE ROOM. A portal
  // keeps the REACT tree it was written in, so a room rendered in this column
  // still sees this slot and would draw its own column into the column it is
  // already in. Handing its contents an empty slot ends that by construction
  // rather than by a rule somebody has to remember.
  return createPortal(<Slot.Provider value={null}>{children}</Slot.Provider>, slot)
}

/**
 * A PANE AND THE COLUMN BESIDE IT. The room draws the pane; the column is open
 * while `useOpen().aside` names one, and `Beside` fills it. The rooms' frame and
 * the app at `/` lay a room out with this, so a room's column is one mechanism.
 * `swap` stands in the pane in the room's place (a chosen Settings row).
 *
 * `framed` is the app at `/`: both are panes floating on the frame's ground
 * (app/_web.tsx), filled with `--pane-fill` and cut by `pane()`, and the edge
 * that sizes the column sits in the gutter between them. In a room they lie on
 * the paper ladder instead. In the rooms' shell the two are its `pane` and
 * `side` grid areas. `bare` leaves the framed pane uncut, for a room that floats
 * panes of its own: a Dev run, which @hanzo/build draws as two.
 */
export function Paned({
  children,
  swap,
  framed = false,
  bare = false,
}: {
  children: ReactNode;
  swap?: ReactNode;
  framed?: boolean;
  bare?: boolean;
}) {
  const { aside, showAside } = useOpen();
  const beside = useSpan(BESIDE, BESIDE_WIDTH, FLOOR, CEIL);
  // State and not a ref: a ref set during commit does not re-render, so the
  // portal would have nowhere to go on the pass that created its target.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!aside) setSlot(null);
  }, [aside]);
  return (
    <>
      <YStack
        render="main"
        data-slot="pane"
        gridArea="pane"
        {...(framed
          ? bare
            ? null
            : { ...pane(), overflow: "hidden" as const }
          : { ...sheet(0), borderLeftWidth: 1, borderColor: "var(--edge, var(--white-06))" })}
        flex={1}
        minW={0}
        minH={0}
      >
        {swap ?? (
          <Framed.Provider value={framed}>
            <Slot.Provider value={slot}>{children}</Slot.Provider>
          </Framed.Provider>
        )}
      </YStack>
      {aside ? (
        <YStack
          render="aside"
          data-slot="side"
          gridArea="side"
          {...pane(framed ? undefined : sheet(1).backgroundColor)}
          // In the frame the gutter stands between the pane and this column.
          ml={framed ? "var(--pane-gap)" : undefined}
          ref={beside.ref}
          // inline-style: `--span`, the width a drag rewrites on the element itself (span.ts); no prop sets a variable.
          style={beside.style}
          position="relative"
          width="var(--span)"
          // Half the WINDOW. Half of an `auto` grid track is half of this
          // column's own width, so the rooms' shell drew it at half its span
          // beside an empty strip of the same size.
          maxW="50vw"
          shrink={0}
          minH={0}
          display="none"
          $lg={{ display: "flex" }}
        >
          <Grip
            side="right"
            span={beside.span}
            floor={FLOOR}
            ceil={CEIL}
            reset={BESIDE_WIDTH}
            onSpan={beside.move}
            onKeep={beside.keep}
            onShut={() => showAside(null)}
            label="Resize side panel"
            // In the gutter the frame leaves between the panes; a room has none.
            l={GUTTER_START}
            width={GUTTER}
          />
          {/* The column above is the landmark; this is the box the room
              projects into, a container and not a second region. It carries the
              corner, so what scrolls in it is cut to the pane. */}
          <YStack
            flex={1}
            minH={0}
            overflowY="auto" overflowX="hidden"
            rounded="var(--pane-round)"
            ref={(el) => setSlot(el instanceof HTMLElement ? el : null)}
          />
        </YStack>
      ) : null}
    </>
  );
}

/**
 * THE RAIL: where you can go, as marks with their names under them. It is the
 * sidebar's collapsed form on a laptop — drawn only while the sidebar is shut,
 * because an open sidebar lists the same places at its top — and the tab bar
 * along the bottom of a phone. It carries no organization: the workspace
 * switcher is the one at the top of the sidebar.
 */
/**
 * A row that LEAVES this app for another address, in this tab.
 *
 * Its arrow points up and to the left at rest and turns up and to the right —
 * the way every row that opens somewhere else points — as the reader reaches for
 * it: hovered, focused, or pressed. A press also holds the turn, so the arrow
 * stays pointed while the page leaves. Reduced motion turns it at once, by the
 * site-wide rule that shortens every transition.
 */
function Leave({ href, children }: { href: string; children: ReactNode }) {
  const [turned, setTurned] = useState(false);
  const [near, setNear] = useState(false);
  return (
    <SidebarItem
      data-leave=""
      onMouseEnter={() => setNear(true)}
      onMouseLeave={() => setNear(false)}
      onFocus={() => setNear(true)}
      onBlur={() => setNear(false)}
      onPressIn={() => setNear(true)}
      icon={
        <YStack data-arrow="" transition="quickest" rotate={turned || near ? "90deg" : "0deg"}>
          <ArrowUpLeft size={15} aria-hidden />
        </YStack>
      }
      onPress={() => {
        setTurned(true);
        window.location.assign(href);
      }}
    >
      {children}
    </SidebarItem>
  );
}

function Rail({
  mode,
  places,
  team,
  open,
  navigate,
  onSettings,
  onMore,
}: {
  mode: Mode;
  places: Place[];
  /** The sidebar is open, and lists the places itself: from a tablet up the rail steps aside. */
  open: boolean;
  /** The workspace's address, drawn as one tile after the places where the
   *  rooms live on another host. A link, so it opens in this tab. */
  team?: string;
  navigate?: (route: string) => void;
  onSettings: () => void;
  onMore: () => void;
}) {
  return (
    <YStack
      data-slot="rail"
      render="nav"
      aria-label="Places"
      {...sheet(0)}
      gridArea="rail"
      minH={0}
      borderRightWidth={1}
      borderColor="var(--edge, var(--white-06))"
      $md={open ? { display: "none" } : undefined}
      $max-md={{
        flexDirection: "row",
        items: "center",
        borderRightWidth: 0,
        borderTopWidth: 1,
        borderTopColor: "var(--border)",
      }}
      // Clear of the home indicator on a phone; zero on a flat screen.
      pb={HOME_INDICATOR}
    >

        {/* A phone lays the places out as equal tabs, four and More; the rest
            wait in the finder. */}
        <YStack
          data-slot="places"
          {...bare}
          items="center"
          gap="$0.5"
          flex={1}
          minW={0}
          minH={0}
          overflowY="auto"
          pt="$2"
          $max-md={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: "minmax(0, 1fr)",
            justifyItems: "stretch",
            overflow: "hidden",
          }}
        >
          {places.map((place, i) => {
            const here = place.id === mode;
            return (
              <Box
                key={place.id}
                render="button"
                onClick={() => navigate?.(place.route)}
                aria-label={place.label}
                aria-current={here ? "page" : undefined}
                title={place.title}
                display="flex"
                $max-md={{ display: i < 4 ? "flex" : "none", width: "auto", minW: 0 }}
                flexDirection="column"
                width={56}
                minH={44}
                py="$1"
                rounded="$2"
                items="center"
                justify="center"
                gap={2}
                bg={here ? "$edge" : undefined}
                hoverStyle={{ bg: here ? "$edge" : "$hover" }}
              >
                <place.icon size={18} aria-hidden />
                <Text fontSize={12} lineHeight={14} color={here ? "$ink" : "$quiet"} numberOfLines={1}>
                  {place.label}
                </Text>
              </Box>
            );
          })}
          {team ? (
            <XStack $max-md={{ display: places.length < 4 ? "flex" : "none", width: "auto", minW: 0 }}>
            <Text render={<a href={team} aria-label="Workspace" title="Hanzo Team" />} display="flex" width={56} color="inherit">
              {/* `Box` is a block until told otherwise. */}
              <Box
                display="flex"
                flex={1}
                flexDirection="column"
                minH={44}
                py="$1"
                rounded="$2"
                items="center"
                justify="center"
                gap={2}
                hoverStyle={{ bg: "$hover" }}
              >
                <LayoutGrid size={18} aria-hidden />
                <Text fontSize={12} lineHeight={14} color="$quiet" numberOfLines={1}>
                  Workspace
                </Text>
              </Box>
            </Text>
            </XStack>
          ) : null}
          <Box
            data-slot="more"
            render="button"
            onClick={onMore}
            aria-label="More places"
            title="More"
            display="none"
            $max-md={{ display: "flex", width: "auto", minW: 0 }}
            flexDirection="column"
            width={56}
            minH={44}
            py="$1"
            rounded="$2"
            items="center"
            justify="center"
            gap={2}
            hoverStyle={{ bg: "$hover" }}
          >
            <Search size={18} aria-hidden />
            <Text fontSize={12} lineHeight={14} color="$quiet">
              More
            </Text>
          </Box>
        </YStack>

      <YStack items="center" pb="$2">
          <Box
            render="button"
            onClick={onSettings}
            aria-label="Settings"
            title="Settings"
            display="flex"
            flexDirection="column"
            width={56}
            minH={44}
            py="$1"
            rounded="$2"
            items="center"
            justify="center"
            gap={2}
            hoverStyle={{ bg: "$hover" }}
          >
            <Settings2 size={18} aria-hidden />
            <Text fontSize={12} lineHeight={14} color="$quiet">
              Settings
            </Text>
          </Box>
      </YStack>
    </YStack>
  );
}

/**
 * Chat's column: start a chat, the projects, then every conversation. The app
 * is `/`, whole, with a rail of its own (app/page.tsx), so a project pressed
 * here opens there, through Dev's door.
 */
function App({
  filter,
  onPick,
  navigate,
}: {
  filter: string;
  onPick?: () => void;
  navigate?: (route: string) => void;
}) {
  const { empty } = useOpen();
  const open = (slug: string) => {
    navigate?.(dev(slug));
    onPick?.();
  };
  return (
    <>
      <SidebarNewChat
        onPress={() => {
          empty();
          onPick?.();
        }}
      />
      <SidebarFolder name="Projects" open={filter ? true : undefined}>
        <Projects filter={filter} onPick={open} />
      </SidebarFolder>
      <Chats filter={filter} onPick={onPick} />
    </>
  );
}

/** What a place holds, for the list column. */
function Index({
  mode,
  owner,
  filter,
  onPick,
  navigate,
}: {
  mode: Mode;
  owner: string;
  filter: string;
  onPick?: () => void;
  navigate?: (route: string) => void;
}) {
  const rooms = (
    <>
      <Rooms onPick={onPick} navigate={navigate} />
      <Team filter={filter} onPick={onPick} navigate={navigate} />
    </>
  );
  if (mode === "chat") return <App filter={filter} onPick={onPick} navigate={navigate} />;
  if (mode === "home")
    return (
      <>
        <Chats filter={filter} onPick={onPick} />
        {rooms}
        <Bots show="people" owner={owner} filter={filter} onPick={onPick} navigate={navigate} />
        <Bots show="agents" owner={owner} filter={filter} onPick={onPick} navigate={navigate} />
      </>
    );
  if (mode === "bots") return <Bots show="agents" owner={owner} filter={filter} onPick={onPick} navigate={navigate} />;
  if (mode === "contacts") return <Bots show="people" owner={owner} filter={filter} onPick={onPick} navigate={navigate} />;
  if (mode === "inbox") return rooms;
  if (mode === "tasks") return <Projects filter={filter} onPick={onPick} />;
  return <Chats filter={filter} onPick={onPick} />;
}

function Frame({
  mode,
  children,
  navigate,
  back,
  forward,
}: {
  mode: Mode;
  children: ReactNode;
  navigate?: (route: string) => void;
  back?: () => void;
  forward?: () => void;
}) {
  const { user, isAuthenticated, isLoading } = useIam();
  // Bumping this REMOUNTS whichever list is drawn, and a fresh mount re-reads.
  // It is how "New" refreshes without this component holding a `reload` for a
  // hook it no longer runs.
  const hydrated = useHydrated();
  const [finding, setFinding] = useState(false);
  /**
   * WHICH SETTINGS ROW IS OPEN, and null for none. ONE value, not two.
   *
   * The rail swaps its rooms for the settings list while this holds a row, and
   * the room draws that row's pane. Both read the same answer, so a pane deep in
   * the tree asking for Channels and the column's own Settings row are the same
   * act — which is why there is no second `panel` state beside this one.
   */
  const { settings: settingsPane, showSettings } = useOpen();
  // The profile is a COLUMN, not a modal, so it is not one of the panels above:
  // those lift off the window and dim it, this one stands in the row beside the
  // room. It is the slot the thread view will share.
  const [profiling, setProfiling] = useState(false);
  // Every organization, for a SuperAdmin to step into (components/workspace/Support.tsx).
  const [supporting, setSupporting] = useState(false);
  /**
   * The sidebar is open by default on desktop and stays open.
   *
   * WHAT THE READER KEPT ARRIVES AFTER MOUNT, for the reason `useSpan` reads
   * its width there: this page is prerendered, so an initializer that reads
   * localStorage or the window's width renders one tree on the server and a
   * different one on the first client pass. React answered that by throwing the
   * server's tree away — hydration error #418, measured on /dev at 390 where
   * the server sent "Close sidebar" and the client drew "Open sidebar" — and a
   * regenerated tree came back with the rail at zero width.
   */
  const [asked, setAsked] = useState(true);
  useEffect(() => {
    let kept: string | null = null;
    try {
      kept = localStorage.getItem("hanzo:sidebar:open");
    } catch {
      // No store is the width of the window, which is a state and not a failure.
    }
    setAsked(kept !== null ? kept === "true" : window.innerWidth >= 768);
  }, []);
  const [peeking, setPeeking] = useState(false);

  /**
   * How wide the reader keeps the sidebar.
   *
   * The stored value is read after mount and not during render, for the reason
   * `asked` starts null: this page is prerendered, and a render that reads
   * localStorage produces different HTML on the server and the client.
   */
  const side = useSpan(SPAN, SIDEBAR_WIDTH, FLOOR, CEIL);
  const { aside, showAside } = useOpen();
  // The whole org state, because the account control at the foot takes it as
  // one value — the switcher is @hanzo/iam's and it reads what it needs.
  const orgState = useOrganizations();
  const { currentOrg, currentOrgId } = orgState;
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const a = new URLSearchParams(window.location.search).get("aside");
      if (a && a !== aside) showAside(a);
    }
  }, [aside, showAside]);


  // WHAT THE SEARCH OPENS ONTO. The threads this reader has and the rooms the
  // org keeps, in one list, because "recent" is a question about where you have
  // been rather than about which store the answer came from. Both hooks already
  // run for the sidebar, so this costs no request of its own.
  // Which rooms this reader's rail carries: Chat and Dev for everyone, the tiered
  // rooms only where the identity opens the tier and the reader has not hidden it.
  const tiers = useTiers();
  const [hidden] = useHidden();

  const shown = asked || peeking;
  const toggle = () => {
    setPeeking(false);
    setAsked((open) => !open);
  };
  const dismiss = () => {
    setPeeking(false);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setAsked(false);
    }
  };
  const onPick = typeof window !== "undefined" && window.innerWidth < 1024 ? dismiss : undefined;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  /**
   * THE SURFACES THAT ARE NOT ROOMS, said once.
   *
   * Connectors is a page, Skills and Usage are panes of Settings, Terminals is
   * another product at its own host, Docs is a page. The column groups them
   * under "More" — where a reader coming from hanzo.app looks — and the palette
   * offers the same set, so this says WHAT they are and each surface says only
   * how it draws them. Written twice they had already parted: Settings was in
   * one list and not the other.
   *
   * ONE VERB PER ROW, and no href beside it. A row that carried both would be
   * two ways to reach one place, and the two would answer differently the day
   * one of them learned to close the sheet behind it.
   */
  const tools = useMemo(
    () => [
      {
        id: "connectors",
        label: "Connectors",
        icon: Blocks,
        go: () => {
          navigate?.(site("/integrations"));
          dismiss();
        },
      },
      {
        id: "skills",
        label: "Skills",
        icon: Workflow,
        go: () => showSettings("skills"),
      },
      // TERMINALS ARE TABS, and Tabs is its own product at its own host —
      // hanzo.app's row pointed there too. A new tab for the reason that row
      // used one: a reader who follows it inside this one loses the project
      // they were building to reach a shell.
      {
        id: "terminals",
        label: "Terminals",
        icon: SquareTerminal,
        go: () => window.open(TABS, "_blank", "noopener"),
      },
      {
        id: "usage",
        label: "Usage",
        icon: Activity,
        go: () => showSettings("usage"),
      },
      {
        id: "docs",
        label: "Docs",
        icon: BookOpen,
        go: () => {
          navigate?.(site("/docs"));
          dismiss();
        },
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings2,
        go: () => showSettings(FIRST),
      },
    ],
    [navigate, dismiss, showSettings],
  );

  /**
   * A SETTINGS ROW, PRESSED.
   *
   * A row that names a destination goes there and closes the list behind it; a
   * row that names a pane opens it and, on a phone, puts the drawer away —
   * the sheet covers the room the pane is about to fill.
   */
  const pick = (row: SettingsRow) => {
    if (!row.href) {
      showSettings(row.id);
      dismiss();
      return;
    }
    if (row.href.startsWith("http")) {
      window.open(row.href, "_blank", "noopener");
      return;
    }
    showSettings(null);
    navigate?.(row.href);
    dismiss();
  };

  /**
   * WHERE THE PALETTE CAN GO WITHOUT ASKING ANYONE.
   *
   * The rooms this identity may open, and the surfaces above. The lists that
   * have to be read — conversations, projects — are `Find`'s, which is why they
   * are not here: this half is known before anyone types.
   */
  const onApex = apex(useHost());
  const places = useMemo(
    () => [CHAT, ...PLACES].filter((place) => shows(place, tiers, hidden, onApex)),
    [tiers, hidden, onApex],
  );
  const doors: OrgCommandItem[] = useMemo(
    () => [
      // HOME LEADS, and the palette is the only way to it: it is off the rail
      // by design and no control anywhere else points at it, which left 400
      // lines of dashboard reading live data that nobody could reach.
      ...[HOME, CHAT, ...PLACES]
        .filter((place) => shows(place, tiers, hidden, onApex))
        .map((place) => ({
          // The LABEL, not the title: `title` is what a browser tab says, and
          // Home's is the brand — one row reading "Hanzo" among Chat, Dev and
          // Drive names the company rather than the room.
          id: place.id,
          title: place.label,
          category: "Rooms",
          icon: <place.icon size={15} aria-hidden />,
          href: place.route,
        })),
      ...tools.map((tool) => ({
        id: tool.id,
        title: tool.label,
        category: "Workspace",
        icon: <tool.icon size={15} aria-hidden />,
        action: tool.go,
      })),
    ],
    [tiers, hidden, onApex, tools],
  );

  // The org IS the workspace. Naming it twice is how the bar and the rail come
  // to disagree about which one you are standing in.
  const workspace = currentOrg?.displayName || currentOrg?.name || "Hanzo";
  const owner = currentOrgId ?? "";

  // The two folders' rows, narrowed by the column's filter like every other list.
  const products = CONSOLE_PRODUCTS.filter((prod) => matches(prod.label, filter));
  const more = tools.filter((tool) => matches(tool.label, filter));

  // The static export prerenders the signed-out room, so the rail's identity
  // half stays quiet until React owns the page. `isLoading` alone is not enough:
  // during prerender it is already false and `user` is already null, which would
  // ship "Sign in" baked into HTML a signed-in reader then sees flash.
  const settled = hydrated && !isLoading;

  const { user: account } = useAccount();
  const signedIn = isAuthenticated || Boolean(user) || Boolean(account) || hasSession();


  const list = (
    // THE SIDEBAR IS A SHEET, and the rail underneath it is the desk. Its own
    // default is `$panel` with a hairline down its right side, which is the
    // wireframe look design's ladder exists to end: a raised surface that is
    // ALSO outlined is drawn twice, and a screen of those reads as one flat
    // field with lines ruled across it. Raise it and drop the line — the tint
    // step and the lit top edge say the same thing without the ruling.
    <Sidebar
      ref={side.ref}
      // A phone's sheet is never wider than 280, whatever the laptop kept.
      // inline-style: `--span`, the width a drag rewrites on the element itself (span.ts); no prop sets a variable.
      style={side.style}
      $md={{ width: "var(--span)" }}
      $max-md={{ width: "100%", maxW: 280 }}
      {...sheet(0)}
      borderRightWidth={1}
      borderColor="var(--edge, var(--white-06))"
      position="relative"
    >
      <Grip
        side="left"
        span={side.span}
        floor={FLOOR}
        ceil={CEIL}
        reset={SIDEBAR_WIDTH}
        onSpan={side.move}
        onKeep={side.keep}
        onShut={() => setAsked(false)}
        label="Resize sidebar"
      />
      {/* THE WORKSPACE LEADS THE SIDEBAR: switching it changes everything below,
          so it sits above everything below. It is the one switcher — the account
          menu at the foot is about the person, not the workspace. */}
      <XStack data-slot="mode-switch" items="center" px="$2" pt="$2" minW={0}>
        <ModeMark
          mode={mode === "dev" ? "dev" : "chat"}
          onChat={() => navigate?.("/chat")}
          onDev={() => navigate?.(dev())}
        />
      </XStack>
      <XStack data-slot="workspace-switcher" items="center" gap="$2" px="$2" pt="$1" pb="$1" minW={0}>
        {/* THE MARK GOES HOME, and only home. A plain link: the session lives
            in this origin's storage, so the homepage opens signed in. */}
        <Text
          render={
            <a
              href="/"
              onClick={(e) => {
                if (!navigate || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigate("/");
              }}
              aria-label={`${brand()} home`}
              title="Home"
            />
          }
          // On the gui element, not the anchor: gui stamps its own `data-slot` over the element it renders into.
          data-slot="home"
          display="flex"
          items="center"
          justify="center"
          width={28}
          height={28}
          $touchable={{ width: 40, height: 40 }}
          color="inherit"
        >
          <HanzoMark size={18} />
        </Text>
        {settled && isAuthenticated ? (
          <XStack shrink={1} minW={0}>
            <OrgProjectSwitcher {...orgState} alwaysShow />
          </XStack>
        ) : null}
      </XStack>
      {/* WHERE YOU CAN GO, as rows. The rail draws these as marks only while the
          sidebar is shut; open, they lead the sidebar the way claude.ai lists
          chats and code. */}
      {/* On a phone the tab bar below already lists the places. */}
      <YStack data-slot="places-list" px="$2" pb="$2" $max-md={{ display: "none" }}>
        {places.filter((place) => matches(place.label, filter)).map((place) => (
          <SidebarItem
            key={place.id}
            icon={<place.icon size={16} aria-hidden />}
            active={place.id === mode}
            onPress={() => {
              navigate?.(place.route);
              onPick?.();
            }}
          >
            {place.label}
          </SidebarItem>
        ))}
        {matches("Settings", filter) ? (
          <SidebarItem icon={<Settings2 size={16} aria-hidden />} onPress={() => showSettings(FIRST)}>
            Settings
          </SidebarItem>
        ) : null}
      </YStack>
      {/* The local filter stays at the top, where the list it narrows begins. */}
      <XStack px="$3" pb="$2">
        <XStack
          flex={1}
          height={30}
          items="center"
          gap="$2"
          px="$2"
          rounded="$2"
          borderWidth={1}
          borderColor="$borderColor"
        >
          <Search size={13} aria-hidden />
          <Text
            render={
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setFilter("");
                }}
                // FILTER, not Search. Two controls that both said Search did two
                // different things: this one narrows the list beside you, and the
                // bar above opens the palette that finds anything anywhere.
                placeholder="Filter"
                aria-label="Filter sidebar"
              />
            }
            flex={1}
            minW={0}
            bg="transparent"
            borderWidth={0}
            outlineStyle="none"
            color="inherit"
            fontSize="$2"
          />
        </XStack>
      </XStack>

      {/* THE COLUMN HAS TWO LEVELS, and only one is drawn.

          The rooms are the first; a chosen settings row makes the second stand
          in its place. A swap rather than an overlay: the pane a row opens fills
          the room, so a column still listing rooms would name one place while
          the page showed another. The filter above and the account below belong
          to the column itself and stay through both. */}
      {settingsPane ? (
        <SidebarScroll>
          <SettingsList
            active={settingsPane}
            filter={filter}
            onPick={pick}
            onBack={() => showSettings(null)}
          />
        </SidebarScroll>
      ) : (
        <>
        <SidebarScroll>
          <>
            {/* WHAT THIS PLACE HOLDS. Chat lists everyone you can talk to —
                recent conversations, channels, people, agents — so a person or
                an agent is one press away; every other place lists its own
                things: runs, projects, rooms. */}
            {settled ? (
              <Index mode={mode} owner={owner} filter={filter} onPick={onPick} navigate={navigate} />
            ) : null}

              {/* A folder narrows with the column: while filtering it opens on its
                  matches, and one with none is not drawn at all. */}
              {products.length ? (
              <SidebarFolder name="Cloud & Platform" open={filter ? true : undefined}>
                {products.map((prod) => (
                  <SidebarItem
                    key={prod.id}
                    icon={<prod.icon size={13} aria-hidden />}
                    onPress={() => window.open(prod.href, "_blank", "noopener")}
                  >
                    {prod.label}
                  </SidebarItem>
                ))}
              </SidebarFolder>
              ) : null}

              {more.length ? (
              <SidebarFolder name="More" open={filter ? true : undefined}>
                {more.map((tool) => (
                  <SidebarItem
                    key={tool.id}
                    icon={<tool.icon size={13} aria-hidden />}
                    onPress={tool.go}
                  >
                    {tool.label}
                  </SidebarItem>
                ))}
              </SidebarFolder>
              ) : null}
          </>
        </SidebarScroll>
        </>
      )}

      {/* THE FOOT BELONGS TO THE CREDENTIAL, NOT TO THE USERINFO RESPONSE.
          It was gated on `user`, which is the PROFILE — so a reader holding a
          live session whose userinfo had not come back (or had failed) lost the
          whole foot: no invite, no billing, and no account row at all. Holding
          a token is what makes somebody signed in; what they are called arrives
          after, and `Account` already says "You" until it does. */}
      {settled && onApex ? <Leave href={signedIn ? ENTRY : WORKSPACE}>Workspace</Leave> : null}
      {settled ? (
        signedIn ? (
          <>
            {/* SUPPORT MODE is drawn for the person IAM signs as a SuperAdmin and
                nobody else; IAM answers anyone else only their own organizations
                and refuses them the step in. */}
            {superAdmin() ? (
              <SidebarItem
                icon={<Building2 size={15} aria-hidden />}
                onPress={() => setSupporting(true)}
              >
                All organizations
              </SidebarItem>
            ) : null}
            <SidebarItem
              icon={<UserPlus size={15} aria-hidden />}
              onPress={() => window.open(invite(), "_blank", "noopener")}
            >
              Invite Teammates
            </SidebarItem>
            {/* THE TWO ROWS hanzo.app KEPT AT ITS FOOT, and both already have a
                home here: sharing is the referral page, and a plan is chosen at
                billing. Inviting a teammate and sharing Hanzo are different
                errands — one adds somebody to your org, the other hands the
                product to somebody who has none — which is why hanzo.app drew
                them separately and so does this. */}
            <SidebarItem
              icon={<Share2 size={15} aria-hidden />}
              onPress={() => {
                navigate?.(site("/referral"));
                dismiss();
              }}
            >
              Share Hanzo
            </SidebarItem>
            <SidebarItem
              icon={<Sparkles size={15} aria-hidden />}
              onPress={() => window.open(BILLING, "_blank", "noopener")}
            >
              Upgrade
            </SidebarItem>
            {/* WHO YOU ARE, at the foot: the person's menu — profile,
                appearance, usage, API keys, security, sign out. The workspace
                switcher is at the top, and credits live under Billing, so
                neither is here. */}
            <Account
              onToggleCollapse={toggle}
              onProfile={() => setProfiling(true)}
              onAppearance={() => showSettings("general")}
              onUsage={() => showSettings("usage")}
              onKeys={() => showSettings("keys")}
            />
          </>
        ) : null
      ) : null}
    </Sidebar>
  );

  return (
    // THE SHELL IS A GRID: the rail down the left, the bar across the top, and
    // under it the list, the pane and the side, each placed by its area. On a
    // phone the grid turns — bar, pane, and the rail along the bottom as the tab
    // bar — and the list is a sheet between them. An open sidebar lists the
    // places itself, so from a tablet up the rail's column closes.
    <YStack
      data-slot="workspace"
      data-hydrated={settled ? "true" : undefined}
      data-sidebar={asked ? "open" : "shut"}
      display="grid"
      gridTemplateColumns={`${asked ? 0 : 64}px auto minmax(0, 1fr) auto`}
      gridTemplateRows="44px minmax(0, 1fr)"
      gridTemplateAreas={'"rail bar bar bar" "rail list pane side"'}
      $max-md={{
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: `44px minmax(0, 1fr) ${TABS_HEIGHT}`,
        gridTemplateAreas: '"bar" "pane" "rail"',
      }}
      position="relative"
      width="100%"
      height="100dvh"
      overflow="hidden"
      bg="$background"
      backgroundImage="var(--pane-ground)"
    >
      <Rail
        mode={mode}
        places={places}
        open={asked}
        team={onApex ? (signedIn ? ENTRY : WORKSPACE) : undefined}
        navigate={navigate}
        onSettings={() => showSettings(FIRST)}
        onMore={() => setFinding(true)}
      />
        <XStack
          render="header"
          data-slot="bar"
          gridArea="bar"
          {...sheet(0)}
          height={44}
          shrink={0}
          items="center"
          px="$3"
          gap="$3"
          borderBottomWidth={1}
          borderColor="var(--edge, var(--white-06))"
        >
          {/* A BUDGET, NOT A SIZE. 180 is what the two clusters reserve so the
              search between them sits centred on a laptop — but stated as `width` it
              is also a FLOOR, and two 180px floors plus the search do not fit a
              390px phone: the right-hand cluster was measured reaching 396. As a
              maximum that can shrink, the centring is unchanged where there is room
              and the row simply gets narrower where there is not. */}
          {/* LEADING: sidebar toggle (if collapsed) + back/forward navigation arrows left aligned */}
          <XStack
            items="center"
            gap="$1"
            shrink={0}
          >
            <SidebarIconButton
              {...TAP}
              label={shown ? "Close sidebar" : "Open sidebar"}
              onPress={toggle}
              onMouseEnter={() => setPeeking(true)}
            >
              <PanelLeft size={16} aria-hidden />
            </SidebarIconButton>

            {/* Not on a phone: the browser's own back gesture is there, and
                the bar's width belongs to the search. */}
            {back || forward ? (
              <XStack
                display="none"
                $md={{ display: "flex" }}
                items="center"
                gap="$1"
                shrink={0}
              >
                <SidebarIconButton {...TAP} label="Back" onPress={() => back?.()}>
                  <ArrowLeft size={16} aria-hidden />
                </SidebarIconButton>
                <SidebarIconButton
                  {...TAP}
                  label="Forward"
                  onPress={() => forward?.()}
                >
                  <ArrowRight size={16} aria-hidden />
                </SidebarIconButton>
              </XStack>
            ) : null}
          </XStack>

        <XStack flex={1} justify="center">
          <YStack width={440} maxW="100%" position="relative">
            {/* ONE ELEMENT, ONE HEIGHT. This was a row of one height nested in
                a button of another, and the two disagreed — the button measured
                32 and the row inside it 28, so the contents sat high in a field
                that was not the height either of them asked for. A button IS a
                row here, so it is written as one. */}
            <Box
              render="button"
              onClick={() => setFinding(true)}
              display="flex"
              flexDirection="row"
              data-slot="find"
              items="center"
              // A phone keeps the glyph and gives up the words: a chord is not
              // pressable there, and the label wrapped onto the key cap.
              $max-md={{ justify: "center" }}
              gap="$2"
              width="100%"
              height={CONTROL}
              px="$2.5"
              rounded="$2"
              borderWidth={1}
              borderColor="$borderColor"
              hoverStyle={{ bg: '$hover' }}
            >
              <Search size={13} aria-hidden color="var(--soft, var(--muted-foreground))" />
              <Text fontSize="$1" color="$soft" $max-md={{ display: "none" }}>
                Search {workspace}
              </Text>
              {/* THE KEY CAP. Its fill was a raw `rgba(255,255,255,0.08)`, and
                  this config only admits token values — so the cap shipped as
                  bare text on no ground at all. `$edge` is what the icon
                  buttons already hover with, and it survives to the page. */}
              <XStack
                ml="auto"
                items="center"
                justify="center"
                height={18}
                px="$1"
                rounded="$1"
                bg="$edge"
                $max-md={{ display: "none" }}
              >
                <Text fontSize="$1" fontWeight="600" color="$soft">
                  ⌘K
                </Text>
              </XStack>
            </Box>
          </YStack>
        </XStack>

        <XStack
          shrink={0}
          minW={0}
          justify="flex-end"
          items="center"
          gap="$2"
        >
          {/* THE WAY IN, for somebody who has not taken it.

              A 44px TARGET AROUND A 28px CONTROL. The button keeps the tap area
              every control in this row has; the border and the fill sit on the
              box inside it. Carried on the button itself, that 44px minimum
              became the VISIBLE size — a bordered rectangle half again the
              height of the search field, while the icon buttons beside it wear
              the same 44 invisibly and look right. */}
          {settled && !signedIn ? (
            <Box
              {...TAP}
              render="button"
              onClick={() => enter(LOGIN)}
              display="flex"
              items="center"
              justify="center"
              cursor="pointer"
            >
              <XStack
                items="center"
                justify="center"
                height={CONTROL}
                px="$2.5"
                rounded="$2"
                borderWidth={1}
                borderColor="$borderColor"
                hoverStyle={{ bg: '$hover' }}
              >
                <Text fontSize="$1" fontWeight="600" color="$ink">
                  Sign in
                </Text>
              </XStack>
            </Box>
          ) : null}

          {/* WHAT STANDS BESIDE THE ROOM: the work behind an answer, a preview
              of what a run built. Drawn where the column is — from `$lg`, the
              breakpoint `side` below uses — because below it these would
              toggle a column nobody can see. */}
          <XStack display="none" $lg={{ display: "flex" }} items="center" gap="$1">
            <SidebarIconButton
              {...TAP}
              label={aside === "roster" ? "Hide directory & roster" : "Show directory & roster"}
              onPress={() => showAside(aside === "roster" ? null : "roster")}
            >
              <Users size={16} aria-hidden />
            </SidebarIconButton>
            <SidebarIconButton
              {...TAP}
              label={aside === "tasks" ? "Close side panel" : "Open side panel"}
              onPress={() => showAside(aside === "tasks" ? null : "tasks")}
            >
              <PanelRight size={16} aria-hidden />
            </SidebarIconButton>
          </XStack>
        </XStack>
      </XStack>
      {/* THE PAGE UNDER A SHEET THAT LIFTED — a phone only; on a laptop the
          list is a column and dims nothing. */}
      {shown ? (
        <Box
          render="button"
          aria-label="Close sidebar"
          onClick={dismiss}
          {...scrim}
          data-slot="scrim"
          position="absolute"
          t={44}
          r={0}
          b={TABS_HEIGHT}
          l={0}
          z="var(--z-scrim)"
          $md={{ display: "none" }}
        />
      ) : null}
      {/* ONE list column, in the grid when asked for and laid over the pane
          while the reader only peeks. */}
      {shown ? (
        <XStack
          data-slot="list"
          gridArea="list"
          position={asked ? "relative" : "absolute"}
          {...(asked ? {} : { top: 44, bottom: 0, left: 64 })}
          // A phone's list is a sheet between the bar and the tab bar.
          $max-md={{ position: "fixed", t: 44, r: 0, b: TABS_HEIGHT, l: 0, width: "100%" }}
          z="var(--z-drawer)"
          bg="$background"
          onMouseEnter={() => setPeeking(true)}
          onMouseLeave={() => {
            if (!asked) setPeeking(false);
          }}
        >
          {list}
        </XStack>
      ) : null}
        {/* A CHOSEN SETTINGS ROW IS WHAT THE ROOM SHOWS, and the room is put
            away while it does. Not drawn over it: a pane that covered the room
            would be the takeover this replaced, and a room left mounted under
            it would go on running its lists for a reader who is reading
            something else. What the workspace is holding — which thread, which
            run — lives in `open.ts`, above every component, so coming back
            opens the same work. */}
        <Paned swap={settingsPane ? <SettingsPane id={settingsPane} /> : undefined}>{children}</Paned>
        <Profile open={profiling} onClose={() => setProfiling(false)} />
        {supporting ? <SupportPicker onClose={() => setSupporting(false)} /> : null}

        {finding ? (
          <Find
            doors={doors}
            onClose={() => setFinding(false)}
            navigate={navigate}
          />
        ) : null}
    </YStack>
  );
}
