"use client";

// /chat's pane: the conversation.
//
// `@hanzo/ai` holds the thread and `@hanzo/ui/chat` draws it — `<Chat {...useChat()} />`
// is one call by design, and the two packages were shaped to make exactly that
// call typecheck. Nothing about the conversation is written here.
//
// WHO CAN SEND: an account. `/v1/agents/chat` answers a signed-out caller
// "a validated principal is required" — measured on production, with and
// without the publishable key the bundle ships and with a browser's own Origin
// — so a visitor's first message comes back refused however the room is drawn.
// The room says that in the reader's words and offers the way past it; what it
// must not do is describe an account they do not have.
//
// The free MODEL is a separate question and still exists: `anonymous` opens on
// the free pool, so what changes at sign-in is the menu, not the room.
//
// The FREE lane is about PRICE, not identity: a free turn spends no balance and
// is data-shared in exchange, which is what the consent block asks about, at
// SEND rather than on arrival — consent is owed when someone sends, not when
// they walk in. Signing in is what buys the paid models and a history that
// follows you; it is never the price of asking a question.
//
// This file used to branch on `isAuthenticated` and hand a visitor a composer
// whose only action was a trip to hanzo.id, captioned "Sign in to send". The
// branch is gone. If the gateway refuses an anonymous free turn, that answer
// belongs in the thread where the reader can see it, not in a caption that
// pre-emptively refuses on the gateway's behalf.

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { capped, detail, familyOf, planRequired, plainly, refused } from "./failure";
import { Prose } from "./Prose";
import {
  useAgent,
  useAi,
  useChat,
  useModels,
  type ChatMessage,
} from "@hanzo/ai/react";
import {
  freeCopy,
  grantConsent,
  hasConsent,
  isFree,
} from "@hanzo/ai";
import { ASK, Chat as ChatSurface, Code, Failure, Parts, words, type Said } from "@hanzo/ui/chat";
import { compose, images, partsOf } from "./lib/attach";
import { channel, drop, hold, spend, take, usePane } from "./pane";
import { Face, brief as roomBrief, join, roleOf, roomTurn, roster as rosterLine, rosterOf, speakers, speaksOf, voiceOf } from "./cast";
import { SpeakButton, cleanForSpeech } from "./speech";
import { Crew, HOUSE, useCrew } from "./crew";
import { called } from "./team";
import { Anchor, Box, Button, Text, Tooltip, TooltipContent, TooltipTrigger, View, XStack, YStack } from "@hanzo/ui";
import { Control } from "@hanzo/composer";
import { useIam, useIamToken } from "@hanzo/iam/react";
import { hasSession, org } from "./lib/session";
import { chats, clock, sku, useLimits } from "./lib/limits";
import { Meters } from "./meters";
import { useHydrated } from "./lib/hydrated";
import { base, served } from "./lib/ai";
import { onServed, type Served } from "./lib/served";
import { REFUSED, speech, useDictation, useTalk, useVoice, Voice } from "@hanzo/voice";
import { ArrowUp, AudioLines, Image as ImageMark, Mic, Paperclip, Square, Star, PanelRight, X } from "lucide-react";
import { ENSO, FREE } from "./lib/ai";
import { openThread, showSettings, useOpen } from "./open";
import { Beside, Framed } from "./Shell";
import { pane } from "./ground";
import { RightPane, usePinned } from "./RightPane";
import { Take } from "./copy";
import { Share } from "./Share";
import { useStarred } from "./stars";
import { useModel } from "./model";
import { Enso, nameOf, useEffort } from "./enso";
import { checkoutUrl } from './lib/pay';
import { onFree, planName } from './lib/plans';
import { Upgrade, useFree, type Ask } from './Upgrade';
import { enter, LOGIN } from './lib/destination';
import { first } from './lib/first';
import { BAD, mix } from "./lib/mix";
import { brand, site } from './where'

/** The veil under the free lane's consent sheet. */
const SCRIM = mix("var(--pure-black)", 72, "srgb");

// NO REASONING PANEL HERE. Every assistant turn opened a "Thinking" disclosure
// listing seven steps — "Planning CSS extraction for chat styles", "Designing
// responsive top bar grid layout" — typed into this file as a literal array.
// They were the same seven under every answer in every conversation, and they
// described the writing of this component rather than anything a model did. A
// reasoning trace belongs to a turn; when the wire carries one it can be drawn
// from the turn, and until then the answer stands on its own.
//
// The queued-message box went with it: a second unmounted component, holding
// the file's last use of the chevrons imported for the panel.

/**
 * The room's reading measure: the design system's prose width, which is what
 * the Width setting (@hanzo/appearance) retunes. 48rem is 768px, the width this
 * room has always read at, so an untouched setting changes nothing.
 */
const MEASURE = "var(--container-prose, 48rem)";

/**
 * WHAT AN EMPTY ROOM OFFERS.
 *
 * A blank field asks the reader to invent the first move, and the commonest
 * answer to "what can I help with?" is not knowing what to ask for. These are
 * four shapes of question rather than four topics — read the code you have,
 * find the fault in what it printed, plan the thing you have not built, and
 * shorten something long — so between them they say what kind of help this is
 * without claiming a skill nobody verified.
 *
 * Pressing one FILLS the field and does not send it. Each is the opening of a
 * question the reader has to finish with their own material, and sending it as
 * written would ask about nothing.
 */
const STARTERS = [
  "Explain what this code does",
  "Find the fault in this stack trace",
  "Plan how to ship this feature",
  "Summarise this document",
];

/**
 * The store, or null when the browser will not give us one.
 *
 * Reading `window.localStorage` THROWS `SecurityError` where site data is
 * blocked — third-party contexts, Safari's Block All Cookies, a hardened
 * profile — and this is called from inside a send handler, so an unguarded
 * access takes the send down rather than the storage.
 */
const store = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * The text this screen arrived with, TYPED INTO THE COMPOSER — never sent.
 *
 * `?q=` means "a question came with the page", and the previous answer to that
 * was to send it on mount. That was wrong in a way one send did not fix: a link
 * is not consent to spend. The
 * question reached two routes (/chat and, once /models mounted `Ask`, that page
 * too), so `hanzo.ai/models?q=…` was a URL that spent a stranger's credits on
 * text a stranger chose and wrote it into their history. Prefilling removes the
 * whole class rather than capping it at one — a human presses send, or nothing
 * is spent.
 *
 * `q` is still CONSUMED from the address: it has done its job once it is in the
 * box, and leaving it there means a reload re-types over whatever was written
 * since.
 */
function useOpening(): { text: string; thread: string | null } {
  const [text, setText] = useState("");
  const [thread, setThread] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const url = new URL(window.location.href);
    const asked = url.searchParams.get("q");
    // A conversation carried in from hanzo.chat. The free chat records the thread
    // under the reader's own account and sends its id, never the transcript; this
    // room opens that thread once the reader is signed in. Struck from the bar
    // like `?q=`, for the same reasons.
    const carried = url.searchParams.get("thread");
    if (asked !== null || carried !== null) {
      url.searchParams.delete("q");
      url.searchParams.delete("thread");
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }

    const found = (asked || "").trim();
    if (found) setText(found);
    const id = (carried || "").trim();
    if (id) setThread(id);
  }, []);

  return { text, thread };
}

/** Types an arriving question into a composer once it lands. */
function useSeed(initial: string | undefined, set: (t: string) => void) {
  const apply = useRef(set);
  apply.current = set;
  useEffect(() => {
    if (initial) apply.current(initial);
  }, [initial]);
}

/** The circle both controls are cut from: @hanzo/composer's `Control`, at the
 *  30px a line of this composer's footer row holds. */
const ROUND = 30;

export function Chat() {
  const { isAuthenticated, isLoading } = useIam();
  const hydrated = useHydrated();
  // Read HERE, not in the child, and it stays here now that there is one child:
  // two components consuming `?q=` meant whichever mounted first stripped it and
  // the one that ended up on screen found nothing.
  const { text: opening, thread: carried } = useOpening();

  const settled = hydrated && !isLoading;
  const signedIn = isAuthenticated || hasSession();

  // The carried thread opens once there is somebody to open it for. Before
  // sign-in it waits; `rememberDestination` already keeps `?thread=` through the
  // trip to the issuer and back, so the id arrives here a second time and opens.
  useEffect(() => {
    if (carried && settled && signedIn) openThread(carried);
  }, [carried, settled, signedIn]);

  // The client is the SHELL's — one per room, so the thread and the roster share
  // a session rather than each minting its own. `Thread` is therefore only ever
  // mounted under the provider the shell already put above it.
  //
  // ONE room, for everyone. `anonymous` changes which models are on offer and
  // nothing else — the composer, the consent and the transcript are the same
  // components either way, because a visitor is having the same conversation.
  //
  // The conversations are NOT drawn here. `Threads` is the list and the shell
  // owns the column it sits in — one sidebar for six rooms, already built, and a
  // second one in this pane would be two designs for one job. This file draws
  // the conversation; the shell draws the room.
  return <Thread initial={opening} anonymous={settled && !signedIn} />;
}

/**
 * The same conversation, embedded in a page that is not /chat.
 *
 * R8: there were TWO live chat surfaces with different consent semantics — this
 * one asks at SEND and fails closed, the other gated on ARRIVAL through a
 * separate copy of the consent code. Two answers to one question is how they
 * drift, so /models mounts this and the second surface is gone. It carries no
 * heading of its own: the host page already has one, and a second `<h1>` is the
 * defect that took the landings off /chat and /dev.
 *
 * The host supplies the `AiProvider`, because the host is what knows whether it
 * already has one.
 */
export function Ask({
  placeholder,
  idle,
}: {
  placeholder?: string;
  idle?: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useIam();
  const hydrated = useHydrated();
  const { text: opening } = useOpening();
  const signedIn = isAuthenticated || hasSession();

  if (!(hydrated && !isLoading)) return <>{idle}</>;
  return (
    <Thread
      placeholder={placeholder}
      initial={opening}
      anonymous={!signedIn}
      heading={null}
    />
  );
}

/**
 * The resting placeholder.
 *
 * The package defaults to "Ask anything" and argues for it against
 * "Message <model>" — a name that moves renames the control every time the
 * model does. This is not that: it is the PRODUCT's name — the host's brand,
 * Hanzo AI or Hanzo Team — and it is already how this file addresses a
 * character (`Message ${persona.name}`). `label` stays "Ask anything", so the
 * accessible name does not move when the placeholder does.
 */
const message = (): string => `Message ${brand()}`;

/** The id the room's system turn is held under in the thread. */
const ROOM = "room";

/** The models that route a turn rather than name the one that answers it. */
const ROUTERS = new Set(["enso", "enso-auto", "enso-free", "hanzo/enso", "auto", "free"]);

/** The id of the turn drawn in the thread when a turn is refused. */
const FAILED = "failed";

/** The turns with the room's system turn first, or without one for an empty room. */
function seated(turns: ChatMessage[], turn: string | null): ChatMessage[] {
  const rest = turns.filter((one) => one.id !== ROOM);
  return turn ? [{ id: ROOM, role: "system", content: turn }, ...rest] : rest;
}

/** An answer that came back with nothing in it. */
const blank = (one: ChatMessage): boolean =>
  one.role === "assistant" && !String(one.content ?? "").trim() && !one.tool_calls?.length;

/** What an unanswered question met: a refusal, an empty answer, or a stream that said nothing. */
interface Failed {
  error: Error | null;
  empty?: boolean;
  stalled?: boolean;
}

/**
 * The agents a question speaks to: those it names, or the whole room when it
 * names nobody — the rule the room's brief gives the model (cast.tsx `brief`).
 */
export function addressed(question: string, room: string[]): string[] {
  const named = room.filter((name) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "iu").test(question),
  );
  return named.length ? named : room;
}

/**
 * Which kind of refusal a failed turn met, read off the platform's own codes:
 * the caller's wallet (`insufficient_balance`, the ai service's spend check), a visitor's
 * spent free messages (`public_allowance_spent`), or a model provider that did
 * not answer (`providers_exhausted`, or any 5xx that is not the balance lookup).
 */
export function refusalOf(error: Error): { wallet: boolean; visitor: boolean; provider: boolean } {
  const status = (error as { status?: unknown }).status;
  const body = (error as { body?: unknown }).body as { code?: unknown; error?: { code?: unknown } } | null | undefined;
  const codes = [body?.code, body?.error?.code, (error as { code?: unknown }).code].filter(
    (one): one is string => typeof one === "string",
  );
  const has = (code: string) => codes.includes(code);
  return {
    wallet: has("insufficient_balance"),
    visitor: has("public_allowance_spent"),
    provider:
      !has("balance_unavailable") &&
      !has("insufficient_balance") &&
      (has("providers_exhausted") || (typeof status === "number" && status >= 500)),
  };
}

/** What the server said about a failure, folded under its plain line. */
function Why({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <YStack gap="$1">
      <XStack render="button" aria-expanded={open} onPress={() => setOpen((v) => !v)} cursor="pointer">
        <Text fontSize="$2" color="$soft">
          {open ? "Hide details" : "Details"}
        </Text>
      </XStack>
      {open ? (
        <Text fontSize="$2" color="$soft">
          {text}
        </Text>
      ) : null}
    </YStack>
  );
}

/**
 * How long a turn may stream without a word before it is stopped and said to
 * have failed. Long enough for a model that reasons at High effort before it
 * writes, which streams no words while it does.
 */
const STALL = 300_000;

/**
 * The conversation. One component for a visitor and for an account.
 *
 * `anonymous` opens on the free pool and offers only what the free pool can
 * answer, because listing a paid model to someone with no balance is an offer
 * that fails at send. Everything else — the transcript, the composer, the
 * consent — is identical, which is the point: signing in later changes the
 * models on the menu, not the room.
 */
function Thread({
  placeholder = message(),
  initial,
  anonymous = false,
  heading,
}: {
  placeholder?: string;
  initial?: string;
  anonymous?: boolean;
  /** The empty transcript's heading. `null` renders none — for a host page that
   *  already carries an `<h1>` of its own. */
  heading?: string | null;
}) {
  /**
   * The model, and WHO decides it.
   *
   * `useState(anonymous ? FREE : ENSO)` read the flag ONCE, on the first render
   * — which is the render before hydration settles, where `anonymous` is always
   * false. So every visitor opened on ENSO while the composer beside them said
   * "Enso Free", `isFree(model)` was false, and the two things that hang off it
   * both went quiet: the data-sharing notice never appeared, and the consent
   * block never asked. A visitor was sending on the paid pool having agreed to
   * nothing, because a state initialiser cannot see a value that arrives later.
   *
   * A CHOICE, or the identity. `null` is "nobody has chosen", which is a
   * different fact from either model and the only one that can defer to a flag
   * that settles after mount. Picking from the menu still wins, permanently.
   */
  const [asking, setAsking] = useState<string | null>(null);
  // STARRED HERE, READ IN THE COLUMN — the shape a room and a project already
  // have. hanzo.chat called it a bookmark; the word this site uses is starred,
  // and one word for one act is what keeps the three lists reading alike.
  const [starred, star] = useStarred("threads");
  // The setter is taken now, not just the value: the override moved from
  // Settings into the composer's own panel, so this is where it is written.
  const [preferred, setPreferred] = useModel();
  const [effort, setEffort] = useEffort();
  const ai = useAi();
  // In the app's frame the composer floats on the pane as a pane of its own.
  const framed = useContext(Framed);
  const opened = useOpen();
  const { thread: open, open: reopen, agents: room, openAgent, seat, emptied, aside, showAside, showSettings } = opened;
  // The conversation's key in `pane.ts`, the one the column beside it reads.
  const at = channel(opened);
  // The first of them: what a surface that addresses one person reads.
  const withWhom = room[0] ?? null;
  // Whether the column beside this conversation is showing its summary, and the
  // switch for it. Kept per conversation by `pane.ts`, so the header's control
  // reflects THIS room rather than the last one that was open.
  const [pinned, flipPin] = usePinned();
  /**
   * WHO YOU ARE TALKING TO, when it is somebody rather than the plain model.
   *
   * Pressing a name in the roster selected a RUN, which this pane never reads,
   * so the chat opened saying nothing about them. `agent` names them, the detail
   * carries their `instructions`, and those instructions ARE the attachment:
   * seeded as the thread's system turn they ride with every message on the wire,
   * so the reply comes back in their voice rather than the house one. No second
   * send path and no `preset` running parallel to `messages` — a conversation
   * already has a place for who is speaking, and this is it.
   */
  // THE COLUMN'S OWN LIST, because that is what draws the faces beside this
  // room. `useAgent` asks the API for one agent BY REF and an agent is
  // addressed here by the name a reader picked, so it answers null for every
  // row whose id is not its name — which is why the hero had no picture and no
  // sentence for an agent the column had just drawn a memoji for.
  const { agents: roster, loading: gathering } = useCrew();
  // THE HANDLE A NAME IS FILED UNDER. The room holds the names a person reads
  // ("Dev"); the platform files a core member under its lower-case handle
  // ("dev"), so a read goes out under the org's own spelling.
  const handle = useCallback(
    (name: string) => (Array.isArray(roster) ? roster : []).find((one) => one.name.toLowerCase() === name.toLowerCase())?.name ?? name,
    [roster],
  );
  const { agent: read, loading: reading } = useAgent(withWhom && !gathering ? handle(withWhom) : null);
  // THIS agent's record only: the hook keeps the last agent's row while it reads
  // the next, so a row whose name is not the one in the room is not theirs.
  const persona = read && withWhom && read.name?.toLowerCase() === withWhom.toLowerCase() ? read : null;
  // Until the record answers, the model they are pinned to is unknown, so a send
  // waits for it rather than going out on the reader's own model.
  const resolving = Boolean(withWhom) && (gathering || reading);
  const resolvingNow = useRef(resolving);
  resolvingNow.current = resolving;
  // THE ROOM'S FACES, by name: what the column's own list says each one looks
  // like, which is what the header, the hero and a reply's byline all draw.
  const faces = useMemo(() => {
    const rows = Array.isArray(roster) ? roster : [];
    return Object.fromEntries(room.map((name) => [name, rows.find((one) => one.name.toLowerCase() === name.toLowerCase())]));
  }, [roster, room]);
  const mate = withWhom ? faces[withWhom] : undefined;
  // ONE SPELLING PER AGENT. A core member is named as hanzoai/personas names
  // them whatever the org's handle ("des" is Des, `called`); any other agent is
  // named as the org spells it, so a face pressed before the org's agents arrive
  // is named again once they do, and its row, picture and brief are the org's.
  useEffect(() => {
    const rows = Array.isArray(roster) ? roster : [];
    const named = room.map((name) => called(rows.find((one) => one.name.toLowerCase() === name.toLowerCase())?.name ?? name));
    if (named.some((name, i) => name !== room[i])) seat(named);
  }, [roster, room, seat]);
  // WHO A REPLY MAY NAME: the room, the org's agents and the house crew. A turn
  // said while someone was in the room stays split by speaker after they leave.
  const known = useMemo(
    () => [...new Set([...room, ...(Array.isArray(roster) ? roster.map((one) => called(one.name)) : []), ...HOUSE])],
    [room, roster],
  );
  // EVERYONE ELSE IN THE ROOM. `useAgent` reads the first by ref; the rest are
  // read here once each and kept, so a member who steps out and back in does
  // not cost a second read. A name the platform does not hold reads null and
  // falls to what the cast says of them.
  const [briefs, setBriefs] = useState<Record<string, string | null>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const name of room) {
      const ref = handle(name);
      if (name === withWhom || asked.current.has(ref)) continue;
      asked.current.add(ref);
      ai.agents
        .get(ref)
        .then((found) => setBriefs((all) => ({ ...all, [name]: found?.instructions?.trim() || null })))
        .catch(() => {
          asked.current.delete(ref);
          setBriefs((all) => ({ ...all, [name]: null }));
        });
    }
  }, [ai, room, withWhom, handle]);
  // THE SYSTEM TURN: one brief as it is, or the whole room. The org's row
  // speaks for an agent it holds — the cloud keeps a core member's row in step
  // with hanzoai/personas, and an agent the org made under the same name keeps
  // its own brief — and a core member the org holds no row for speaks as
  // hanzoai/personas writes them (`speaksOf`), so a visitor pressing Feynman
  // gets Feynman rather than the house model.
  const brief = useMemo(
    () =>
      roomBrief(
        room.map((name) => ({
          name,
          says: (name === withWhom ? persona?.instructions?.trim() : briefs[name]) || speaksOf(name) || null,
        })),
      ),
    [room, withWhom, persona?.instructions, briefs],
  );
  // AN AGENT BRINGS ITS OWN MODEL. It is a field on the row, so choosing one
  // for them would be answering a question they have already answered. The
  // default for plain chats lives in Settings, so this room has no second model
  // control that can drift from it.
  //
  // NAMED, THEN CHECKED AGAINST WHAT THE GATEWAY SERVES. `enso` is the house
  // router and the right preference, but a deployment carrying a different
  // catalogue does not answer to it — and an unserved name reaches the agents
  // round as a completion for a model nobody has, which the round returns as a
  // bare "not found", after it has already recorded the question. `served`
  // keeps the house name where it is served and otherwise falls to the first
  // model that is, so a room on any catalogue can be spoken to.
  // A SPEECH MODEL NEVER ANSWERS A CHAT TURN. The catalog lists the
  // transcriber and the voice beside the chat models; one that names its
  // outputs and names no text (`chats`) is neither offered nor fallen back to.
  const { models: catalog } = useModels();
  const models = useMemo(() => catalog.filter(chats), [catalog]);
  // HANZO MODELS ALONE are offered here, to everyone: an Enso or Zen id
  // (`sku`). A preference kept from before for any other model is not one this
  // room offers, so the house router is asked for instead, and `served` keeps
  // to the house models wherever the catalog carries one. An agent's own model
  // is sent as it is named, never swapped for another the catalog lists; the
  // gateway says which model answered (`servedBy`).
  const offered = useMemo(() => models.filter((m) => sku(m.id)), [models]);
  const wanted = sku(preferred) ? preferred : ENSO;
  const model = persona?.model || served(models, anonymous ? FREE : wanted);
  // WHAT THE PLAN HAS LEFT, as shares of the session, the day and the month
  // (lib/hanzo/limits.ts). Read again whenever a send settles, below.
  const { limits, reload: reread } = useLimits(!anonymous, org());
  const held = Boolean(limits?.plan);
  // A MODEL THE FREE PLAN DOES NOT INCLUDE IS ASKED FOR, NOT CHOSEN. On Free,
  // picking a model the plan's row does not run (`onFree`) leaves the choice
  // where it was and opens the upgrade, titled with the model; so does a turn
  // the gateway refuses `plan_required`. A plan the limits name is not Free,
  // whatever the tier says, so every Hanzo model is simply chosen on it.
  // `isFree` still drives the free-lane notice.
  const free = useFree(!anonymous) && !held;
  const [ask, setAsk] = useState<Ask | null>(null);
  const choose = (id: string) => (free && !onFree(id) ? setAsk({ model: nameOf(models, id) }) : setPreferred(id));
  // KEEPING THE CONVERSATION is the reader's account, not this pane's choice:
  // the store is per-org, so a signed-in reader has somewhere for it to go and
  // an anonymous one does not. `thread` names the conversation being continued
  // — the Recent they opened — so a reply lands in it rather than beside it.
  const chat = useChat({
    model,
    keep: !anonymous,
    // THE PILL THAT WAS CUT READ A SETTING NOTHING SET, and that was the right
    // reason to cut it. This is the other half: `params` is forwarded to the
    // completion, so the effort chosen on the bar rides the request. An
    // upstream that does not read `reasoning_effort` answers as it would have,
    // the way it does for `temperature`.
    params: { reasoning_effort: effort },
    ...(open ? { thread: open } : {}),
    onError: (e) => {
      const needs = planRequired(e);
      if (needs && free) setAsk({ ...needs, model: nameOf(models, model) });
    },
  });
  const { send, set, error, thread: kept } = chat;

  // Threads THIS pane opened by writing them. Their transcript is already on
  // the screen — it is what was just said — so the restore below has nothing to
  // fetch for one, and fetching anyway would race a live conversation to
  // replace it with the server's copy mid-sentence.
  const written = useRef(new Set<string>());
  // The room each thread last recorded, by thread, as the names joined.
  const recorded = useRef(new Map<string, string>());

  // A conversation that has just been written down becomes the OPEN one, so the
  // rail marks the room the reader is standing in. Only on the mint, which is
  // `kept` changing: when the reader opens another Recent, `open` moves first and
  // `kept` follows it a render later (the hook takes `thread` in an effect), and
  // reopening the stale `kept` then sent the two chasing each other until React
  // stopped the page (#185).
  const minted = useRef(kept);
  useEffect(() => {
    if (kept === minted.current) return;
    minted.current = kept;
    if (kept && kept !== open) {
      written.current.add(kept);
      reopen(kept);
    }
  }, [kept, open, reopen]);

  // The thread's turns, replaced wholesale or through an updater. `set` is the
  // hook's own state setter, so it takes either.
  const apply = useRef(set as React.Dispatch<React.SetStateAction<ChatMessage[]>>);
  apply.current = set as React.Dispatch<React.SetStateAction<ChatMessage[]>>;

  // THE ROOM'S SYSTEM TURN: who is in the conversation (`roster`), then how each
  // of them talks. It is the first turn every request carries and it follows the room, so
  // pressing a face adds them to the conversation that is open rather than
  // starting another; the turns already said stay where they are.
  const turn = useMemo(() => roomTurn(room, brief), [room, brief]);
  const turnNow = useRef(turn);
  turnNow.current = turn;
  const roomNow = useRef(room);
  roomNow.current = room;
  useEffect(() => {
    apply.current((held) => seated(held, turn));
  }, [turn]);

  // A NEW CONVERSATION holds the room's turn and nothing else: on arrival, on
  // "New chat" (`emptied` counts the presses, so a press on an empty room still
  // lands), and when the open thread is left for none.
  useEffect(() => {
    if (open) return;
    apply.current(seated([], turnNow.current));
  }, [open, emptied]);

  // A RECENT THAT OPENS. `threads.get` answers null for an id this caller may
  // not read — the route replies 200 with no messages rather than 404 — so an
  // empty transcript is read as absent instead of drawn as a real but blank
  // conversation. The last roster turn it holds names its room, which is seated
  // as it arrives; a thread that never recorded one has nobody in it.
  //
  // Its own effect, apart from the room's turn: a character arriving while the
  // read is out must not abort it.
  useEffect(() => {
    if (!open) return;
    // Our own. The turns are on the screen already.
    if (written.current.has(open)) return;
    const stop = new AbortController();
    void ai.threads
      .get(open, { signal: stop.signal })
      .then((found) => {
        const turns = (found?.messages ?? []).map((m, i) => ({
          // A store row always has an id; a turn without one is keyed by its place.
          id: m.id || `${open}#${i}`,
          role: m.role as ChatMessage["role"],
          content: m.content,
        }));
        let names: string[] = [];
        for (const one of turns) {
          const held = one.role === "system" ? rosterOf(one.content) : null;
          if (held) names = held;
        }
        recorded.current.set(open, names.join("\n"));
        // The room already seated keeps its briefs; another is seated by name
        // and its briefs follow as they are read.
        const same = names.join("\n") === roomNow.current.join("\n");
        seat(names);
        apply.current(
          seated(
            turns.filter((one) => !(one.role === "system" && rosterOf(one.content))),
            same ? turnNow.current : roomTurn(names, null),
          ),
        );
      })
      .catch(() => apply.current(seated([], turnNow.current)));
    return () => stop.abort();
  }, [ai, open, seat]);

  // WHO IS IN THE CONVERSATION IS KEPT WITH IT. A thread records its room as a
  // roster turn when it is first written down with somebody in it, and again
  // whenever the room changes; reopening it — after a reload, on another
  // device — seats the same faces. The briefs are not recorded: they are read
  // fresh from the agents each time the room is seated.
  useEffect(() => {
    if (!open || anonymous) return;
    const now = room.join("\n");
    const was = recorded.current.get(open);
    if (was === now) return;
    // A thread read back from the store is seated by the read above; until it
    // lands there is nothing to compare against.
    if (was === undefined && !written.current.has(open)) return;
    recorded.current.set(open, now);
    if (was === undefined && room.length === 0) return;
    void ai.threads.record([{ role: "system", content: rosterLine(room) }], open).catch(() => {
      recorded.current.delete(open);
    });
  }, [ai, open, room, anonymous]);

  // `send` is read through a ref and NEVER through a dependency array. Its
  // identity changes on every `setMessages` — `useChat` closes over `messages` —
  // so an effect depending on it re-runs after each streamed token.
  const latest = useRef(send);
  // The images held for a turn ride with it at the moment it is sent, queued or
  // not, and are spent once: a retry is the words again, not the pictures.
  latest.current = (text: string) => send(text, outgoing.current.splice(0));

  // THE COMPOSER'S DRAFT IS HELD HERE, so an arriving question can be typed into
  // it. `Chat` owns a draft of its own and spreads `composer` after it, so
  // passing value/onChange/onSend takes that ownership over rather than fighting
  // it.
  const [draft, setDraft] = useState("");
  // FILES WITH THE NEXT MESSAGE, held by `pane.ts` for this conversation: the
  // paperclip, a drop anywhere on the room, a paste into the field and the
  // column's `+` all go through its one `hold`, so the chips here and the rows
  // under Sources are one list. An image rides as a picture the model reads, a
  // text file as its words (lib/attach); anything else is refused by name.
  const { held: files, refused: turnedAway } = usePane(at);
  const [dragging, setDragging] = useState(false);
  const outgoing = useRef<string[]>([]);
  const depth = useRef(0);
  useSeed(initial, setDraft);

  // DICTATION through Hanzo's own ear: the mic records and each pause is
  // posted to /v1/audio/transcriptions (`zen-scribe`), and what was said lands
  // AFTER what the draft already held (`useDictation`) — a pause between two
  // sentences never loses the first. `speech()` defaults to the Hanzo gateway
  // and `base()` is the one place a host is read from, so pointing a local
  // cloud at one points both. The token is the reader's own — the package never
  // invents a credential — and a refusal is worn by `<Voice/>`, never passed off
  // as a transcript.
  const { token } = useIamToken();
  const ear = useMemo(() => speech({ ...base(), ...(token ? { token } : {}) }), [token]);
  const voice = useVoice({ speech: ear, ...useDictation(draft, setDraft) });

  // TALK MODE: a hands-free conversation on Hanzo's realtime socket, /v1/voice.
  // The mic streams up, the answer streams back as speech with its words in
  // `talk.reply`, and talking over it stops it. Its own conversation, so its
  // turns are drawn above the composer rather than posted into the thread.
  const talk = useTalk({ ...base(), ...(token ? { token } : {}), org: org() ?? undefined });

  // WHILE THE MIC IS OPEN, A FINISHED REPLY IS READ ALOUD by the platform's
  // voice, through the conversation's own mouth so speaking over it stops it.
  // A room's reply is read part by part, each in its speaker's cast voice.
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !chat.streaming && voice.open) {
      const msgs = chat.messages;
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && typeof lastMsg.content === "string") {
        const parts = room.length > 1 ? speakers(lastMsg.content, room) : [{ who: withWhom, text: lastMsg.content }];
        // A part spoken over ends the reading rather than handing on to the next.
        void (async () => {
          for (const part of parts) {
            const said = cleanForSpeech(part.text);
            if (said && !(await voice.say(said, voiceOf(part.who ?? withWhom ?? undefined)))) break;
          }
        })();
      }
    }
    wasStreaming.current = chat.streaming;
  }, [chat.streaming, voice.open, voice.say, chat.messages, withWhom, room]);

  // A SEND THAT WAITS ONE RENDER. `send` closes over the turns it was rendered
  // with, so a send that first tidies the thread is held here and made from the
  // next render, where the tidied turns are the ones it sends.
  const [queued, setQueued] = useState<string | null>(null);
  useEffect(() => {
    if (queued === null || resolving) return;
    setQueued(null);
    void latest.current(queued);
  }, [queued, resolving]);
  const streaming = useRef(false);
  streaming.current = chat.streaming;
  const turns = useRef(chat.messages);
  turns.current = chat.messages;

  /**
   * WHAT EACH UNANSWERED QUESTION WAS TOLD, by the question's own turn id: the
   * refusal it met, or that its answer came back empty, or that it streamed
   * nothing until `STALL`. A question with no entry here and no answer after it
   * — a thread read back from the store — is still said to have gone unanswered.
   */
  const [failures, setFailures] = useState<Record<string, Failed>>({});
  const note = useCallback((failed: Failed) => {
    const id = [...turns.current].reverse().find((m) => m.role === "user")?.id;
    if (id) setFailures((all) => ({ ...all, [id]: failed }));
  }, []);
  useEffect(() => {
    if (error && !chat.streaming) note({ error });
  }, [error, chat.streaming, note]);
  // EVERY SEND THAT SETTLES re-reads the plan's limits: a stream that ended, a
  // stop, or a refusal — a 429 for a spent window included, which is read
  // again on the pass that delivers it. An error with no stream before it
  // still counts, so a refusal raised before the first frame is not missed.
  const counting = useRef(false);
  useEffect(() => {
    if (chat.streaming) {
      counting.current = true;
      return;
    }
    if (!counting.current && !error) return;
    counting.current = false;
    reread();
  }, [chat.streaming, error, reread]);
  const wasBusy = useRef(false);
  useEffect(() => {
    const held = turns.current[turns.current.length - 1];
    if (wasBusy.current && !chat.streaming && !error && held && blank(held)) note({ error: null, empty: true });
    wasBusy.current = chat.streaming;
  }, [chat.streaming, error, note]);

  /**
   * Sends a question. A new question takes any empty answer off the thread
   * first, because an upstream may refuse a request carrying an assistant turn
   * with nothing in it. `again` names an unanswered question to ask once more:
   * it leaves its place in the thread and is asked at the end, so it is asked
   * once and not twice.
   */
  const speak = useCallback((text: string, again?: string) => {
    if (!text) return;
    // Activation: the first question this browser asks (a retry is not one).
    if (!again) first("chat_message");
    if (!streaming.current && (again || resolvingNow.current || turns.current.some(blank))) {
      apply.current((held) => held.filter((one) => one.id !== again && !blank(one)));
      if (again)
        setFailures((all) => {
          const { [again]: _gone, ...rest } = all;
          return rest;
        });
      setQueued(text);
      return;
    }
    void latest.current(text);
  }, []);

  // A TURN THAT NEVER SPEAKS IS STOPPED. A stream that stays open with nothing
  // in it would leave a Stop button and no answer for as long as the upstream
  // holds the connection; after `STALL` it is ended and its question is said to
  // have gone unanswered, with Try again.
  useEffect(() => {
    if (!chat.streaming) return;
    const clock = window.setTimeout(() => {
      const held = turns.current[turns.current.length - 1];
      if (held && blank(held)) {
        note({ error: null, stalled: true });
        chat.stop();
      }
    }, STALL);
    return () => window.clearTimeout(clock);
    // Armed once per turn; `chat.stop` is the hook's stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.streaming]);

  // WHICH MODEL ANSWERED each reply, by the reply's turn id, as the gateway named
  // it while the reply streamed (lib/served.ts).
  const [servedBy, setServedBy] = useState<Record<string, Served>>({});
  useEffect(
    () =>
      onServed((heard) => {
        const answer = [...turns.current].reverse().find((m) => m.role === "assistant");
        if (answer && streaming.current) setServedBy((all) => ({ ...all, [answer.id]: heard }));
      }),
    [],
  );
  const byline = (id: string) => {
    const heard = servedBy[id];
    // A router named back as itself says nothing about who answered.
    if (!heard || (heard.served === heard.asked && ROUTERS.has(heard.asked))) return null;
    const fell = heard.asked && heard.asked !== heard.served && !ROUTERS.has(heard.asked);
    return (
      <Text fontSize="$1" color="$soft">
        answered by {heard.served}
        {fell ? ` · ${heard.asked} was unavailable` : ""}
      </Text>
    );
  };

  // WHAT WAS SAID, which is not everything the thread holds. The persona rides
  // as a system turn so the wire carries it; drawing it would print a character
  // brief in the transcript as though somebody had typed it, and would make a
  // room nobody has spoken in look like a conversation already under way.
  const said = useMemo(
    () => chat.messages.filter((m) => m.role !== "system"),
    [chat.messages],
  );
  // THE LIKENESS, WHERE ONE WAS DRAWN FOR THIS CHARACTER. `cast.tsx` is the one
  // table of who looks like what, and it says a name it does not hold "is not a
  // problem" — that name wears initials, never another character's face.
  // WHAT THE AGENT CARRIES, THEN WHAT WE CAST. The cast answers for a character
  // it has a part for; an agent named after its job — "Hanzo Researcher" — has
  // no part, so the hero drew nothing while the column beside it drew the
  // record's own picture. Its own answer comes first, which is the order
  // `Face` already states for every other surface.
  const portrait = mate?.avatar ?? persona?.avatar ?? roleOf(withWhom)?.portrait;

  /** Whether the field has focus, so the FRAME can wear the ring the field is
   *  no longer allowed to draw. `:focus-within` would say this in CSS; the
   *  stylesheet that would hold it cannot reach past gui's own rule, so the
   *  state is read where the event is. */

  const guarded = useCallback(
    (text: string) => {
      const s = store();
      // FAILS CLOSED. This read `s && !hasConsent(s)`, so a browser that gives
      // us no store answered "no consent needed" and sent a data-shared turn
      // having asked nobody. No store means no record, and no record means ask.
      if (isFree(model) && (!s || !hasConsent(s))) {
        setAsking(text);
        return;
      }
      speak(text);
    },
    [model, speak],
  );

  /** The draft and the held files, sent as one turn. */
  const submit = () => {
    const text = draft.trim();
    if (!text && !files.length) return;
    const going = spend(at);
    outgoing.current = images(going);
    setDraft("");
    guarded(compose(text, going));
  };

  /*
    WHAT AN UNANSWERED QUESTION LOOKS LIKE: a turn of its own directly under it,
    naming who was asked, saying what went wrong in the reader's words, and
    offering Try again. Every question ends in an answer or in one of these,
    never in nothing: the thread drawn is `shown`, which puts one after every
    question with no answer after it.

    The refusals the reader can act on keep the server's sentence and its way
    out — Add credit only for the caller's OWN wallet (`insufficient_balance`),
    Upgrade for a plan limit, Sign in for a visitor. A model provider that did
    not answer (`providers_exhausted`, or any 5xx on the turn) is ours, and says
    so plainly with Try again; the upstream account named inside it is not the
    reader's to fund.
  */
  const shown = useMemo(() => {
    const out: ChatMessage[] = [];
    const held = said.filter((one, i) => !blank(one) || (chat.streaming && i === said.length - 1));
    held.forEach((one, i) => {
      out.push(one);
      if (one.role !== "user") return;
      const next = held[i + 1];
      if (!next || next.role === "user") out.push({ id: `${FAILED}:${one.id}`, role: "assistant", content: "" });
    });
    // A question on its way out has no answer yet and no failure either.
    if (queued !== null && out.length && String(out[out.length - 1].id).startsWith(`${FAILED}:`)) out.pop();
    return out;
  }, [said, chat.streaming, queued]);

  const failure = (question: ChatMessage) => {
    const failed = failures[question.id];
    const text = words(question.content as Said);
    const whom = addressed(text, room);
    const wrong = failed?.error ?? null;
    const how = wrong ? refusalOf(wrong) : null;
    // A SPENT WINDOW is the plan holder's own limit, said with its reset and,
    // below the top plan, the next plan's checkout. Asking again before the
    // reset meets the same answer, so it offers no Try again.
    const cap = wrong ? capped(wrong) : null;
    const next = cap?.href ? planName(limits?.upgrade) : null;
    const resign = !cap && !!wrong && (refused(wrong) || /audience not allowed|invalid access token/i.test(wrong.message));
    const lift = free ? planRequired(wrong) : null;
    const said = !failed
      ? "No answer came back for this question."
      : failed.stalled
        ? `${nameOf(models, model)} sent nothing for ${STALL / 60_000} minutes, so the turn was stopped.`
        : failed.empty
          ? `${nameOf(models, model)} answered with nothing.`
          : cap
            ? `You've used ${cap.limit === "session" ? "this session's" : "today's"} limit.${cap.resets ? ` Resets at ${clock(cap.resets)}.` : ""}`
            : resign
            ? anonymous
              ? "Sign in to ask this."
              : "Your session needs to be refreshed. Sign in to reconnect."
            : how?.provider
              ? `${familyOf(model) || nameOf(models, model)} is unavailable right now.`
              : plainly(wrong, "this conversation");
    return (
      <Failure onRetry={resign || cap ? undefined : () => speak(text, question.id)}>
        <YStack gap="$2">
          <Text fontSize="$3" color="$ink">
            {whom.length ? `No answer from ${join(whom)}. ` : ""}
            {said}
          </Text>
          {how?.provider && wrong ? <Why text={detail(wrong)} /> : null}
          {cap?.href || resign || lift || how?.wallet || how?.visitor ? (
            <XStack gap="$2" flexWrap="wrap">
              {cap?.href ? (
                <Anchor href={cap.href}>
                  <Button size="sm" variant="outline">
                    {next ? `Upgrade to ${next}` : "Upgrade"}
                  </Button>
                </Anchor>
              ) : resign ? (
                <Button
                  size="sm"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      localStorage.removeItem("hanzo_iam_access_token");
                      localStorage.removeItem("hanzo_iam_refresh_token");
                    }
                    enter(LOGIN);
                  }}
                >
                  Sign in
                </Button>
              ) : lift ? (
                <Button size="sm" variant="outline" onClick={() => setAsk({ ...lift, model: nameOf(models, model) })}>
                  Upgrade
                </Button>
              ) : how?.visitor ? (
                <Button size="sm" variant="outline" onClick={() => enter()}>
                  Sign in to keep going
                </Button>
              ) : (
                <Anchor href={checkoutUrl()}>
                  <Button size="sm" variant="outline">
                    Add credit
                  </Button>
                </Anchor>
              )}
            </XStack>
          ) : null}
        </YStack>
      </Failure>
    );
  };

  // The agreement is asked OVER the room, not instead of it. Returning the
  // consent on its own replaced the whole pane: the question the reader had
  // just typed left the screen, and the first thing a stranger saw of the
  // product was a page about training data. The room stays; the sheet sits on
  // top of it, and the question is still there behind it.
  const consent =
    asking === null ? null : (
      <Consent
        question={asking}
        onAgree={() => {
          const s = store();
          // Nothing to persist into is not a reason to refuse the turn the
          // reader just agreed to; it means the question is asked again next
          // time, which is the honest cost of a browser that stores nothing.
          if (s) grantConsent(s);
          const held = asking;
          setAsking(null);
          if (held) speak(held);
        }}
        onCancel={() => {
          setAsking(null);
        }}
      />
    );

  return (
    <YStack
      flex={1}
      minH={0}
      width="100%"
      position="relative"
      data-slot="chat-room"
      // Entered and left once for every child crossed, so the veil follows a
      // count rather than the last event.
      onDragEnter={(e: React.DragEvent) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e: React.DragEvent) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e: React.DragEvent) => {
        depth.current = 0;
        setDragging(false);
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        void hold(at, Array.from(e.dataTransfer.files));
      }}
    >
      {dragging ? (
        <YStack
          aria-hidden
          position="absolute"
          t={0}
          r={0}
          b={0}
          l={0}
          z={10}
          items="center"
          justify="center"
          bg="var(--surface-scrim)"
          borderWidth={2}
          borderStyle="dashed"
          borderColor="$borderColor"
          rounded="var(--pane-round)"
          pointerEvents="none"
        >
          <XStack items="center" gap="$2" px="$4" py="$2.5" rounded="$10" bg="$background" borderWidth={1} borderColor="$borderColor">
            <Paperclip size={15} aria-hidden />
            <Text fontSize="$4" color="$ink">
              Drop files to attach
            </Text>
          </XStack>
        </YStack>
      ) : null}
      {/* The conversation's own row: its star, who is in it, and its address. */}
      <XStack
        height={48}
        items="center"
        justify="space-between"
        px="$3"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <XStack items="center" gap="$2" minW={0}>
          {/* THE SAME STAR AS A PROJECT'S, said the same way — see Build.tsx.
              This one named itself "Star conversation" whatever the state, so
              the label was wrong the moment a reader starred anything, and the
              only signal that the press had worked was the icon turning
              yellow: a state carried by COLOUR ALONE, which a screen reader
              cannot read at all. The label says what the press will do and
              aria-pressed says where it stands. */}
          <Box
            render="button"
            onClick={() => open && star(open)}
            aria-label={
              open && starred.has(open) ? "Unstar this conversation" : "Star this conversation"
            }
            aria-pressed={!!open && starred.has(open)}
            p="$1.5"
            rounded="$2"
            hoverStyle={{ bg: '$hover' }}
          >
            <Star size={15} aria-hidden color={open && starred.has(open) ? "var(--foreground)" : "var(--muted-foreground)"} fill={open && starred.has(open) ? "currentColor" : "none"} />
          </Box>
          {/* WHO IS AT THE OTHER END, or nothing at all.
              `withWhom || "Jobs"` put a name and a photograph on a room the
              reader had chosen nobody for — the same defect the empty state
              below already fixed once, still standing up here. The badge beside
              it read "VIP · AI" for everyone, which is not a fact about any
              agent: no row carries a tier, so there is nothing to draw. */}
          {room.length ? (
            // EVERYONE IN THE CONVERSATION, each with the control that lets
            // them out. The strip under the composer adds and removes the same
            // people; either place changes the one room. The row scrolls
            // sideways on a narrow screen rather than pushing the header's
            // controls off it, and a phone shows faces without names.
            <XStack
              role="list"
              aria-label="Agents in this chat"
              items="center"
              gap="$1.5"
              minW={0}
              overflowX="auto"
              // The row scrolls without drawing a bar; gui types no `scrollbarWidth`.
              $platform-web={{ scrollbarWidth: "none" }}
            >
              {room.map((name) => (
                <XStack
                  key={name}
                  role="listitem"
                  items="center"
                  gap="$1.5"
                  pl="$1"
                  pr="$0.5"
                  py="$0.5"
                  rounded={999}
                  borderWidth={1}
                  borderColor="$borderColor"
                  shrink={0}
                >
                  <Face
                    src={faces[name]?.avatar ?? (name === withWhom ? portrait : undefined)}
                    emoji={faces[name]?.emoji ?? (name === withWhom ? persona?.emoji : undefined)}
                    name={name}
                    size={22}
                  />
                  <Text fontSize="$2" fontWeight="600" color="$color" numberOfLines={1} display="none" $sm={{ display: "flex" }}>
                    {name}
                  </Text>
                  <Box
                    render="button"
                    onClick={() => openAgent(name)}
                    aria-label={`Remove ${name} from this chat`}
                    title={`Remove ${name}`}
                    width={24}
                    height={24}
                    rounded={999}
                    items="center"
                    justify="center"
                    hoverStyle={{ bg: "$hover" }}
                  >
                    <X size={13} aria-hidden color="var(--soft, var(--muted-foreground))" />
                  </Box>
                </XStack>
              ))}
            </XStack>
          ) : null}
        </XStack>

        <XStack items="center" gap="$1">
          {/* THE SUMMARY'S OWN CONTROL, in the conversation's header rather than
              inside the column it acts on — a control that hides a pane cannot
              live in the pane it hides, or pressing it takes away the thing you
              would press to bring it back.

              It opens the column first where there is none, because a summary
              has nowhere to appear until the frame has given the room a column;
              two presses to reach "column open, summary hidden" is the honest
              cost of one button answering one question. `aria-pressed` is that
              question — is the summary showing — and not the pin's own flag,
              which stays true while the column is shut. */}
          <Box
            render="button"
            onClick={() => {
              if (aside === null) {
                showAside("tasks");
                if (!pinned) flipPin();
                return;
              }
              flipPin();
            }}
            aria-label="Toggle pinned summary"
            aria-pressed={aside !== null && pinned}
            // NOT ON A PHONE, because there is nothing for it to show there.
            // The frame draws the column only above `$lg` — it spends the whole
            // width on the room below that (`Shell.tsx`) — so this control
            // would press, change the stored pin, and move nothing on screen.
            // A button whose effect is invisible is a button that does nothing.
            // Same breakpoint as the column, so the two cannot drift apart.
            display="none"
            $lg={{ display: "flex" }}
            p="$2"
            rounded="$2"
            hoverStyle={{ bg: "$hover" }}
          >
            <PanelRight size={15} color="var(--soft, var(--muted-foreground))" />
          </Box>
          {open ? <Share thread={open} /> : null}
        </XStack>
      </XStack>


      {/* The frame owns the column; this is what /chat puts in it. The roster
          of agents lives here rather than in the shell, because it is this
          room's — a shell that draws one room's pane can serve only that room.
          `Work` reads the same conversation and sits under it. */}
      <Beside>
        <RightPane said={said} onClose={() => showAside(null)} />
        <Work persona={persona ?? null} room={room} model={model} messages={said} />
      </Beside>

      {isFree(model) ? (
        <Text
          fontSize="$2"
          color="$soft"
          text="center"
          maxW={MEASURE}
          mx="auto"
          px="$4"
          py="$2"
        >
          {freeCopy.notice}{" "}
          <Anchor href={site("/legal/privacy")}>{freeCopy.noticeCta}</Anchor>
        </Text>
      ) : null}
      <ChatSurface
        {...chat}
        messages={shown}
        send={guarded}
        // AN EMPTY ROOM CENTRES ITS COMPOSER. While nothing has been said the
        // opening (the heading and the starters) and the composer sit as one
        // group in the middle of the height, with or without the plan bars in
        // the composer's foot; the moment a turn exists the transcript takes the
        // height and the composer docks under it.
        center
        // AS IT WAS WRITTEN. The package renders a turn's words plainly and
        // says so — it ships no markdown pipeline because the plugin set is the
        // surface's to choose — so an answer arrived here reading "```ts" with
        // the backticks on screen. `Prose` is the site's one renderer, reading
        // with the same `marked` the legal pages parse with and drawing every
        // token in gui elements, and the shared view draws through it too.
        body={(turn) => {
          if (String(turn.id).startsWith(`${FAILED}:`)) {
            const question = shown.find((one) => one.id === String(turn.id).slice(FAILED.length + 1));
            return question ? failure(question) : null;
          }
          // A QUESTION THAT CARRIED PICTURES draws them beside its words.
          if (turn.role === "user" && Array.isArray(turn.content))
            return <Parts parts={partsOf(turn.content)} prose={(text) => <Prose text={text} />} />;
          const said = typeof turn.content === "string" ? turn.content : "";
          // WHO IS ANSWERING, while the answer has no words yet: the agents the
          // question addresses, or the whole room when it names nobody.
          if (turn.role === "assistant" && !said && chat.streaming && room.length) {
            const q = [...shown].reverse().find((one) => one.role === "user");
            const whom = addressed(words(q?.content as Said), room);
            return (
              <Text fontSize="$2" color="$soft">
                {join(whom)} {whom.length > 1 ? "are" : "is"} answering…
              </Text>
            );
          }
          // A ROOM'S ANSWER IS SEVERAL PEOPLE'S. Each opens a line with their
          // name, as the brief asks, so each is drawn under their own face and
          // read in their own voice. A reply that names nobody is drawn whole.
          const parts = turn.role === "assistant" ? speakers(said, known) : null;
          if (parts && parts.some((part) => part.who)) {
            // Asked and silent: an agent the question addressed who has no part
            // in this reply.
            const at = shown.findIndex((one) => one.id === turn.id);
            const q = shown.slice(0, at).reverse().find((one) => one.role === "user");
            const silent =
              room.length > 1 && !(chat.streaming && at === shown.length - 1)
                ? addressed(words(q?.content as Said), room).filter(
                    (name) => !parts.some((part) => part.who?.toLowerCase() === name.toLowerCase()),
                  )
                : [];
            return (
              <YStack gap="$3">
                {parts.map((part, i) => (
                  <YStack key={i} gap="$1">
                    {part.who ? (
                      <XStack items="center" gap="$2">
                        <Face src={faces[part.who]?.avatar} emoji={faces[part.who]?.emoji} name={part.who} size={20} />
                        <Text fontSize="$2" fontWeight="600" color="$ink">
                          {part.who}
                        </Text>
                      </XStack>
                    ) : null}
                    <Prose text={part.text} />
                    {part.text ? (
                      <XStack ml="$-1" items="center" gap="$2">
                        <Take text={part.text} says="this answer" />
                        <SpeakButton text={part.text} agentName={part.who ?? withWhom ?? undefined} />
                      </XStack>
                    ) : null}
                  </YStack>
                ))}
                {silent.length ? (
                  <Text fontSize="$2" color="$soft">
                    No answer from {join(silent)} in this reply.
                  </Text>
                ) : null}
                {byline(turn.id)}
              </YStack>
            );
          }
          return (
            <YStack gap="$1">
              <Prose text={said} />
              {/* TAKE THE ANSWER WITH YOU. `Take` copies the SOURCE — the
                  markdown the model wrote — rather than what is on screen,
                  which is what makes an answer paste into an editor with its
                  fences and its table still in it. It rests dim and comes up on
                  hover or focus, so a keyboard and a thumb can reach it too.

                  Only an answer, and only one with words in it: your own turn
                  is already in your hands, and a control under an empty bubble
                  offers to copy nothing. */}
              {turn.role === "assistant" && said ? (
                <XStack ml="$-1" items="center" gap="$2">
                  <Take text={said} says="this answer" />
                  <SpeakButton text={said} agentName={withWhom} />
                </XStack>
              ) : null}
              {turn.role === "assistant" && said ? byline(turn.id) : null}
            </YStack>
          );
        }}
        // The page's ONE heading, and it belongs to the empty transcript rather
        // than to a signed-out branch — the branch is gone, and the heading went
        // with it when it did. `Ask` passes its own, because the page embedding
        // it already has an `<h1>` and a second is the defect that took the
        // landings off /chat and /dev.
        empty={
          heading === null ? undefined : (
            // Centred with the composer by `center` above: the free space is
            // split above and below the [heading, composer] group, so it sits
            // in the middle of whatever height the window happens to have, and
            // stays right when the sidebar, the notice line or an error banner
            // changes what is left over.
            <YStack data-slot="opening" items="center" width="100%" py="$6">
              {/* THE PORTRAIT IS A DM'S, AND ONLY A DM'S. It used to draw for
                  everyone, because `withWhom || "jobs"` gave a reader who had
                  chosen nobody a 160px photograph of somebody — and the heading
                  under it said their name. A fresh /chat is not a conversation
                  with anyone yet. */}
              {room.length > 1 ? (
                <XStack items="center" justify="center" mb="$4">
                  {room.map((name, i) => (
                    <Box key={name} ml={i ? -16 : 0} rounded={40} borderWidth={2} borderColor="$background" z={room.length - i}>
                      <Face src={faces[name]?.avatar} emoji={faces[name]?.emoji} name={name} size={72} />
                    </Box>
                  ))}
                </XStack>
              ) : portrait ? (
                <Box
                  width={160}
                  height={160}
                  rounded={24}
                  overflow="hidden"
                  borderWidth={2}
                  borderColor="var(--white-15)"
                  boxShadow="0 10px 24px color-mix(in srgb, var(--pure-black) 70%, transparent)"
                  mb="$4"
                  bg="var(--neutral-900)"
                >
                  <View render={<img src={portrait} alt={withWhom} />} width="100%" height="100%" objectFit="cover" />
                </Box>
              ) : null}

              {/* A face for an agent with no picture at all — the glyph it
                  picked, or its initial. The block above draws the picture when
                  there is one, so only one of the two ever stands here. */}
              {room.length === 1 && !portrait ? (
                <Box mb="$3">
                  <Face emoji={mate?.emoji ?? persona?.emoji} name={withWhom} size={72} />
                </Box>
              ) : null}

              <Text
                render="h1"
                fontSize="$7"
                lineHeight="$7"
                fontWeight="700"
                color="$ink"
                text="center"
                mb="$1"
              >
                {join(room) || heading || "What can I help with?"}
              </Text>

              {/* WHAT THE AGENT ROW SAYS ABOUT ITSELF, and only that. The
                  fallback under this read gave two colleagues a job title each —
                  "Engineering Lead @ Hanzo", "Admin & Founder @ Hanzo" — and
                  anyone else a blurb about product vision. Those were typed
                  here, not read from anywhere: a claim about an identifiable
                  person, shipped in the bundle, that nobody they name has seen.
                  A persona with no description gets a name and no sentence. */}
              {room.length === 1 && (mate?.description ?? persona?.description) ? (
                <Text
                  fontSize="$3"
                  color="$soft"
                  text="center"
                  maxW={500}
                  mb="$4"
                  lineHeight="$4"
                >
                  {mate?.description ?? persona?.description}
                </Text>
              ) : null}

              {/* STARTER CHIPS */}
              <XStack
                flexWrap="wrap"
                justify="center"
                gap="$2"
                maxW={560}
                px="$3"
                pb="$4"
              >
                {STARTERS.map((one) => (
                  <Box
                    key={one}
                    render="button"
                    onClick={() => {
                      setDraft(`${one} `);
                    }}
                    px="$3"
                    py="$2"
                    rounded="$4"
                    borderWidth={1}
                    borderColor="$borderColor"
                    hoverStyle={{ bg: "$raised" }}
                  >
                    <Text fontSize="$2" color="$soft">
                      {one}
                    </Text>
                  </Box>
                ))}
              </XStack>
            </YStack>
          )
        }
        // The transcript reads at the same measure. `Thread` defaults to 768
        // itself; handing it the column here is what lets Width reach it.
        column={{ maxW: MEASURE }}
        composer={{
          value: draft,
          onChange: setDraft,
          onSend: submit,
          // A CHARACTER IS WHO YOU ARE WRITING TO, so the field says so — and
          // `label` keeps the accessible name constant while it does, which is
          // the reason the component ships both: a placeholder that changes with
          // the room would otherwise rename the control every time you switch.
          placeholder: room.length ? `Message ${join(room)}` : placeholder,
          label: ASK,
          // CENTRED WHILE NOTHING HAS BEEN SAID, docked once something has —
          // `center` on the surface, which spaces the pair from outside it,
          // because with a foot the composer is a shell around this frame and
          // a margin given here would land inside the shell.
          // THE SAME MEASURE THE REST OF THIS FILE READS AT. The notice line and
          // the error block are centred. A line of prose has a
          // comfortable length and a field people write prose into has the same
          // one.
          width: "calc(100% - 32px)",
          maxW: `calc(${MEASURE} - 3rem)`,
          mx: "auto",
          ...(framed ? pane() : null),
          // THE COMPONENT'S OWN SHAPE, and nothing here reaching into it.
          //
          // This carried about twenty style props that rebuilt it into a single
          // capsule: `flexDirection: "row"` above all, which lays the footer row
          // BESIDE a `flex: 1` field instead of under it. The footer row has no
          // width of its own in that arrangement, so send left the viewport at
          // every size but the widest — measured at 1280 it ended at 1315, at
          // 834 at 902, at 390 at 466, and on a phone the field stood 200px tall
          // where a line is 24. Each override was answering damage from the one
          // before it.
          //
          // Composer is a field over a footer row. CHOOSING a model is a
          // preference and not part of every message, so Settings owns the
          // choice — but the row still NAMES what is about to answer, because
          // `served()` may not send what was asked for.
          //
          // That fallback is written against this: a preference the gateway
          // does not carry gives way to a model it does, "because a chat that
          // works on a model the reader can see beats a chat that refuses on a
          // name nobody serves". Measured on production, neither `enso` nor
          // `free` is in the catalogue — every turn lands on the first served
          // model — so without this the substitution happens in silence and the
          // sentence justifying it is not true.
          //
          // Pressing it opens the pane that owns the choice, which is the one
          // place to change it.
          // Everything that is not the field, at the end of the row: Enso, the
          // mic, send. Send is drawn here because this slot replaces the
          // package's button and `streaming` still has to become stop; it keeps
          // `data-slot="composer-send"` so a driver finds it, and it is the same
          // `Control` circle as the mic, filled.
          // THE PAPERCLIP is the column's "Attach files", one press closer: the
          // same `take`, into the same `hold`.
          children: (
            <Tooltip>
              <TooltipTrigger>
                <Control type="button" size={ROUND} aria-label="Attach files" onClick={() => take(at)}>
                  <Paperclip size={15} aria-hidden />
                </Control>
              </TooltipTrigger>
              <TooltipContent>
                <Text fontSize="$2">Attach files</Text>
              </TooltipContent>
            </Tooltip>
          ),
          // A file or an image pasted into the field is held like a picked one;
          // words paste as words.
          field: {
            onPaste: (e: React.ClipboardEvent) => {
              if (!e.clipboardData?.files?.length) return;
              e.preventDefault();
              void hold(at, Array.from(e.clipboardData.files));
            },
          },
          // WHAT GOES WITH THE MESSAGE, above the frame: one chip a file, each
          // with its own remove, and the reason any file was refused.
          head:
            files.length || turnedAway || talk.open || talk.refusal ? (
              <YStack width="calc(100% - 32px)" maxW={`calc(${MEASURE} - 3rem)`} mx="auto" gap="$1.5">
                {files.length ? (
                  <XStack gap="$1.5" flexWrap="wrap" role="list" aria-label="Attached files" data-slot="composer-attached">
                    {files.map((one) => (
                      <XStack
                        key={one.id}
                        role="listitem"
                        items="center"
                        gap="$1.5"
                        pl="$2.5"
                        pr="$1"
                        py="$1"
                        rounded="$10"
                        borderWidth={1}
                        borderColor="$borderColor"
                        bg="$hover"
                        maxW={260}
                      >
                        {one.kind === "image" ? (
                          <ImageMark size={12} aria-hidden color="var(--muted-foreground)" />
                        ) : (
                          <Paperclip size={12} aria-hidden color="var(--muted-foreground)" />
                        )}
                        <Text fontSize="$2" color="$ink" numberOfLines={1}>
                          {one.name}
                        </Text>
                        <Box
                          render="button"
                          aria-label={`Remove ${one.name}`}
                          onClick={() => drop(at, one.id)}
                          p="$1"
                          rounded="$10"
                          hoverStyle={{ bg: "$raised" }}
                        >
                          <X size={12} aria-hidden />
                        </Box>
                      </XStack>
                    ))}
                  </XStack>
                ) : null}
                {turnedAway ? (
                  <Text role="alert" fontSize="$2" color={BAD}>
                    {turnedAway}
                  </Text>
                ) : null}
                {/* TALK MODE'S OWN TURNS: what Hanzo is saying, or why it cannot. */}
                {talk.open || talk.refusal ? (
                  <Text
                    role="status"
                    aria-live="polite"
                    data-slot="composer-talk-reply"
                    fontSize="$2"
                    color={talk.refusal ? BAD : "$soft"}
                  >
                    {talk.refusal
                      ? REFUSED.lost
                      : talk.reply
                        ? `Hanzo: ${talk.reply}`
                        : talk.state === "listening"
                          ? "Listening — speak, and Hanzo answers aloud."
                          : "Connecting…"}
                  </Text>
                ) : null}
              </YStack>
            ) : undefined,
          send: (
            <XStack items="center" gap="$2">
              <Enso
                effort={effort}
                onEffort={setEffort}
                model={wanted}
                onModel={choose}
                models={offered}
              />
              <Control asChild size={ROUND}>
                <Voice voice={voice} says={{ idle: "Dictate", listening: "Dictating — click to stop" }}>
                  {(state) => (
                    <Mic
                      size={15}
                      fill={state === "idle" ? "none" : "currentColor"}
                    />
                  )}
                </Voice>
              </Control>
              <Control asChild size={ROUND}>
                <Voice
                  voice={talk}
                  data-slot="composer-talk"
                  says={{
                    idle: "Talk with Hanzo",
                    listening: "In conversation — click to hang up",
                    speaking: "Hanzo is speaking — talk to interrupt",
                  }}
                >
                  {() => <AudioLines size={15} />}
                </Voice>
              </Control>
              <Control
                type="button"
                size={ROUND}
                fill
                data-slot="composer-send"
                aria-label={chat.streaming ? "Stop" : "Send"}
                opacity={chat.streaming || draft.trim() || files.length ? 1 : 0.4}
                onClick={() => (chat.streaming ? chat.stop() : submit())}
              >
                {chat.streaming ? (
                  <Square size={13} fill="currentColor" />
                ) : (
                  <ArrowUp size={15} strokeWidth={2.5} />
                )}
              </Control>
            </XStack>
          ),
          // WHAT THE PLAN HAS LEFT, under the frame and at its measure, for a
          // plan holder only: Free keeps the free lane's own notice.
          foot:
            held && limits && (limits.session || limits.day || limits.month) ? (
              <YStack width="calc(100% - 32px)" maxW={`calc(${MEASURE} - 3rem)`} mx="auto">
                <Meters limits={limits} />
              </YStack>
            ) : undefined,
        }}
      />
      {/* The crew sits under the composer: who you can talk to, and the
          outline that makes one more. Below the field rather than in the hero
          above it, so the question stays the first thing on the page. */}
      <Crew />
      {isFree(model) ? (
        <XStack
          items="center"
          justify="center"
          py="$1"
          px="$3"
          borderTopWidth={1}
          borderColor="$borderColor"
          bg="$background"
        >
          <Text fontSize="$1" color="$soft">
            Free chat is data-shared to train models. <Anchor href={site("/privacy")} fontSize="$1" color="$ink">Privacy</Anchor>
          </Text>
        </XStack>
      ) : null}
      {consent}
      <Upgrade ask={ask} onClose={() => setAsk(null)} />
    </YStack>
  );
}

/** The agreement free asks for, in @hanzo/ai's words so every surface says one thing. */
function Consent({
  question,
  onAgree,
  onCancel,
}: {
  /** What the reader asked, shown back so the sheet answers about THAT turn. */
  question?: string;
  onAgree: () => void;
  onCancel: () => void;
}) {
  return (
    <YStack
      position="absolute"
      t={0}
      l={0}
      r={0}
      b={0}
      items="center"
      justify="center"
      p="$4"
      z={40}
      bg={SCRIM}
    >
    <YStack
      width="100%"
      maxW={512}
      px="$5"
      py="$5"
      gap="$4"
      rounded="$4"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$background"
    >
      <Text render="h2" fontSize="$6" fontWeight="500" color="$ink">
        {freeCopy.consentTitle}
      </Text>
      {question ? (
        <Text fontSize="$3" color="$soft" numberOfLines={2}>
          Your question is waiting: &ldquo;{question}&rdquo;
        </Text>
      ) : null}
      <Text fontSize="$4" color="$soft">
        {freeCopy.consentBody}
      </Text>
      <YStack gap="$2">
        {freeCopy.consentPoints.map((point) => (
          <Text key={point} fontSize="$3" color="$soft">
            {point}
          </Text>
        ))}
      </YStack>
      <XStack gap="$3" flexWrap="wrap">
        <Button onClick={onAgree}>{freeCopy.consentAgreeCta}</Button>
        <Button variant="outline" onClick={onCancel}>
          {freeCopy.consentCancelCta}
        </Button>
      </XStack>
      <Text fontSize="$2" color="$soft">
        {freeCopy.termsText} <Anchor href={site("/legal/terms")}>Terms</Anchor>
        {" · "}
        <Anchor href={site("/legal/privacy")}>Privacy</Anchor>
      </Text>
    </YStack>
    </YStack>
  );
}

function Work({
  persona,
  room,
  model,
  messages,
}: {
  persona: { name: string; description?: string } | null;
  /** Everyone in the conversation: each of them answers what is asked of them. */
  room: string[];
  model: string;
  messages: ChatMessage[];
}) {
  const done = useMemo(() => {
    // A result arrives as its own turn, keyed back to the call that asked for
    // it — so the pairing is a lookup and not an assumption about order.
    const back = new Map<string, string>();
    for (const m of messages) {
      if (m.role === "tool" && m.tool_call_id) {
        back.set(m.tool_call_id, typeof m.content === "string" ? m.content : "");
      }
    }
    return messages
      .flatMap((m) => m.tool_calls ?? [])
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        asked: call.function.arguments,
        got: back.get(call.id) ?? null,
      }));
  }, [messages]);

  /**
   * WHAT THE CONVERSATION MADE.
   *
   * A fenced block in an answer is a thing rather than a sentence — a file, a
   * command, a page — and read inline it scrolls away with the talk. Here it
   * keeps a label and a copy control, which is what somebody came to a code
   * block to do.
   *
   * Read from the turns rather than tracked as it arrives: the transcript is
   * already the record, and a second list of what was made would be a second
   * thing to keep in step with it.
   */
  const made = useMemo(() => {
    const out: { id: string; language: string; code: string }[] = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      const text = typeof m.content === "string" ? m.content : "";
      for (const block of text.matchAll(/```([\w.+-]*)\n([\s\S]*?)```/g)) {
        const code = block[2].replace(/\s+$/, "");
        if (code) out.push({ id: `${m.id}-${out.length}`, language: block[1] || "text", code });
      }
    }
    return out;
  }, [messages]);

  return (
    <YStack p="$3" gap="$4">
      <YStack gap="$1">
        <Text fontSize="$1" color="$soft" textTransform="uppercase">
          Answering
        </Text>
        {room.length ? (
          room.map((name) => (
            <XStack key={name} items="center" gap="$2">
              <Face name={name} size={22} />
              <Text fontSize="$2" color="$ink" numberOfLines={1}>
                {name}
              </Text>
            </XStack>
          ))
        ) : (
          <Text fontSize="$2" color="$ink" numberOfLines={1}>
            {model}
          </Text>
        )}
        {room.length === 1 && persona ? (
          <Text fontSize="$1" color="$soft" numberOfLines={3}>
            {persona.description || model}
          </Text>
        ) : null}
      </YStack>

      {made.length > 0 ? (
        <YStack gap="$2">
          <Text fontSize="$1" color="$soft" textTransform="uppercase">
            Artifacts
          </Text>
          {made.map((one) => (
            <Code key={one.id} language={one.language} value={one.code}>
              {one.code}
            </Code>
          ))}
        </YStack>
      ) : null}

      <YStack gap="$2">
        <Text fontSize="$1" color="$soft" textTransform="uppercase">
          Work
        </Text>
        {done.length === 0 ? (
          <Text fontSize="$2" color="$soft">
            Nothing was looked up for this conversation yet.
          </Text>
        ) : (
          done.map((call) => (
            <YStack
              key={call.id}
              gap="$1"
              p="$2"
              rounded="$3"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <Text fontSize="$2" color="$ink">
                {call.name}
              </Text>
              <Text fontSize="$1" color="$soft" numberOfLines={2}>
                {call.asked}
              </Text>
              {/* A call still in flight has no answer yet, which is a state and
                  reads as one. */}
              <Text fontSize="$1" color="$soft" numberOfLines={6}>
                {call.got ?? "Running…"}
              </Text>
            </YStack>
          ))
        )}
      </YStack>
    </YStack>
  );
}

/** The agreement free asks for, in @hanzo/ai's words so every surface says one thing. */
