# @hanzo/rooms

The workspace rooms — Home, Chat, Inbox, Contacts, Meet, Cal, Drive, Board,
Work, Bots, Settings — and the frame that holds them (Room, Shell,
Orgs), once, for every surface. hanzo.ai and hanzo.team import them; neither
keeps a copy. Repo `github.com/hanzoai/rooms`, npm `@hanzo/rooms`.

## Why its own package and its own repo

`@hanzo/ui` is presentational: data in, events out, no fetch. The rooms are
connected — an IAM session, an `@hanzo/ai` client, billing and plan reads — and
bring `@hanzo/ai`, `@hanzo/voice`, `@hanzo/build`, `@hanzo/usage` and
`@hanzo/personas`. They sit beside `@hanzo/ui` the way `@hanzo/build` does
(`hanzoai/build`), in a repo of their own: the `hanzoai/ui` workspace re-resolves
its whole peer graph on any lockfile change, and a re-resolve there turns 21
latent type errors in `pkg/ui` on, so a new package inside it could not land
without breaking the ui release.

## What a host passes

Two halves, because two kinds of caller read them.

```ts
// Once, at module scope, in a module the host's root imports (pure: where.ts).
import { configure } from '@hanzo/rooms'
configure({ site: '', home: '/home', signUp: '/signup', api, iam, key, plans })
```

```tsx
// Where the rooms render (client: host.tsx).
<Rooms router={useRouter()} path={usePathname()} route={route} Link={NextLink}>
  <Room mode="cal"><CalScheduler /></Room>
</Rooms>
```

The app's addresses are paths (lib/host.ts, "The app's addresses" below): Chat
is `/chat[/<id>]`, Dev `/dev[/<place>]`. `useDevHost` reads Dev's place from
`path`; the host serves its one Chat page and its one Dev page for every path
under each (hanzo.ai: lib/edge.ts `APP`). `dev(ref)` opens Dev on a run, a
repository or a site from any surface.

| address | hanzo.ai | hanzo.team |
|---|---|---|
| `site` — where the app's pages live (`/dev`, `/legal/*`, `/pricing`) | `''` | `https://hanzo.ai` |
| `home` — the rooms' Home | `/home` | `/` |
| `brand` — the product's name wherever a room prints it: the sidebar's wordmark, Home's and Chat's titles, the composer's placeholder, the setup, the shared page (`brand()`) | `Hanzo AI` (default) | `Hanzo Team` (`@hanzogui/shell/registry` `brandName`) |
| `signUp` | `/signup` | `/start` |
| `Landing`, `Signup` — the front door of a workspace rooted at `/` | — | team's components |
| `team` — every room behind the per-seat Team plan, organizations founded through `Start` | — | `true` |
| `track` — the host's own funnel call, where it boots its own tags | — (@hanzo/event's tag manager) | `lib/analytics/tags` |
| `plans` — the first-paint plan catalogue | build data | — (the live `GET /v1/billing/plans`) |

- A string a room prints that names the product reads `brand()` at render
  time, never a literal: "Hanzo AI" written into a room is "Hanzo AI" on
  hanzo.team.
- Plain modules read addresses through `where()` / `site()` and must import
  them from `./where`, never `./host`: `host.tsx` is `'use client'`, and a
  server component calling a client module's export throws ("Attempted to call
  site() from the server").
- A module-level constant must not capture an address: `configure()` may run
  after the module evaluates. Read at call time (`get route()`, `invite()`,
  `dev()`, `signUp()`).
- The session is IAM's (`@hanzo/iam/react`; the host mounts `IamProvider`).
- The look is `@hanzo/appearance`'s. The host mounts `<Look />` once at its
  root, inside `IamProvider`: it applies the person's layers for the org in
  scope on every page and syncs them with IAM when signed in (`useLook`). The
  Settings panel is the Appearance panel, theme row included. No theme library
  is imported.
- Navigation to another origin (`site()` on hanzo.team) is a document load in
  `Room`; same-origin routes go through the host's router.
- A module a server page renders (`ProviderMark`) carries no `'use client'` and
  imports gui primitives from `./ui`, never `@hanzo/ui`: the root barrel would
  register its whole client surface on the route (81 KB on a model page).

## Rules the rooms keep

- No place hides behind a More. Column draws Dev's places from @hanzo/build's
  `nav` (≥ 0.2.53), the one list every rail draws, each a row under a quiet
  group label (Work, Make, Run, Setup); Shell draws its Setup rows the same way,
  under the rooms. Collapsed, Column keeps every place as a mark.
- Skills, connectors, plugins and agents have one home, Dev's Customize: Shell's
  Customize row and Settings' Plugins and Skills rows lead there (`app()`), and
  Directory lists only Works with and Channels. A list is the registry's answer
  or a plain line saying why there is none — never rows standing in for it.
- A scroller says `overflowY="auto" overflowX="hidden"` (or the reverse for a
  strip that scrolls sideways), never `overflow="scroll"`: a classic scrollbar
  draws its track and steppers whether or not anything overflows. The bars
  themselves are @hanzo/design's (base.css ≥ 0.5.34).
- A pane is cut by `pane()` (ground.ts) on design's first paper rung,
  `--shadow-sheet-1`, over the floor's `--glass`: the second rung's drop and
  `--glass-strong` read as a gradient through a translucent pane.
- Files go with a chat message by the paperclip or a drop on the room
  (`lib/attach`): an image as an `image_url` part through @hanzo/ai's
  `send(text, images)` (≥ 0.6.20), a text file fenced under its name, any other
  kind refused by name.

## A conversation's menu

`thread.tsx` `ConversationMenu` wraps a list of conversation rows — the
column's Recents and the shell's /chat list — and mounts ONE menu for all of
them: gui's ContextMenu (a right-click at the cursor, a long-press on touch)
and one gui Menu whose triggers are every row's ⋯ (a gui Menu takes many
triggers and anchors to the one pressed), plus the Rename, Delete and Share
dialogs (`Share.tsx` `ShareDialog`, the header's panel in a dialog). A row
(`ThreadRow`) is its markup and a trigger. Entries: Rename (Ctrl+Alt+R), Pin
or Unpin (Ctrl+Alt+P), Share…, Copy link, Open in new tab, Archive or
Unarchive, Delete. The address of a conversation is `site(talk(id))`; a
⌘/Ctrl-click or a middle-click on a row opens it in a new tab.

- The keys act on the row whose menu is open, else on the conversation the
  pane holds — never while the reader types, inside a dialog or one of the
  menu's dialogs is open, and once a press, not per key repeat (`chord.ts`).
  They match the letter on the key (`e.key`), and the key's place (`e.code`)
  only where Option or AltGr made it another character. One capture-phase
  listener on the page serves every list.
- A change shows at once and is taken back with a toast on a refusal or after
  15 s without an answer (`pending.ts`): every `useThreadList` draws the
  changes in flight over what it read. One conversation's changes go to the
  store one after another, and a refusal takes back that change alone. A
  settled change is kept until every list has read after it, by one clock that
  stamps reads and answers, so no list flashes its older read. A new client
  (another reader or organization) drops them (`bind`).
- Stars from before pins were the server's (`hanzo.starred-threads`) are asked
  for as pins once a page, after the first list read answers, and forgotten
  once the store takes any (`stars.ts` `carry`); a store without the route
  keeps them for a later visit.
- Never `@hanzo/ui/product/menu`'s ContextMenu here: it portals its panel under
  gui's `pointer-events: none` host and takes no click.

## Layout

- `src/*.tsx` — the rooms, as `components/workspace/*` was in hanzo.ai; each is
  a subpath (`@hanzo/rooms/CalScheduler`).
- `src/bots/*` — the Bots room.
- `src/lib/*` — the workspace's infrastructure, one copy for every host:
  `session`, `destination`, `api`, `ai` (useAi), `account`, `tier`, `limits`,
  `plans`, `pay` (the pay site and money, apart from the plan catalogue), `share`, `coding`, `todo`, `durable`, `tags`, `host` (estate routing and the app's addresses),
  `mix`, `hydrated` … Apps import these from the package
  (`@hanzo/rooms/lib/session`) and keep no copy.
- `src/team.gen.ts` — the core team's persona files as strings, generated from
  `@hanzo/personas` by `scripts/team.mjs`, so no host needs an asset loader.
- `src/lib/integrations.ts` — the integrations catalogue, the one copy:
  hanzo.ai's /integrations pages render it, Directory's "Works with" tab lists
  it (loaded when the tab opens).
- `src/lib/terms.ts` — the Terms and AUP versions (`POLICY`), the one copy:
  hanzo.ai's legal pages print them, every sign-up card records them.
- `assets/` — the files the rooms name by path: the cast's portraits
  (`assets/agents`, `/agents/<id>.png` in `cast.tsx`) and the Bots room's
  avatars (`assets/bots`). A host serves the directory at its root: it copies
  `@hanzo/rooms/assets` into `public/` on `prebuild`/`predev` and keeps no
  copy in git.

## The app's addresses

`lib/host.ts` is the one module that writes and reads the web app's addresses,
and they are paths: `/chat`, `/chat/<id>` (`talk`), `/dev` and every builder
place under it (`app`, from @hanzo/build/route `href`): `/dev/run/<id>`,
`/dev/projects`, `/dev/projects/<org>/<repo>` a repository,
`/dev/projects/<slug>` a deployed site, `/dev/issues`, `/dev/artifacts`,
`/dev/machines`, `/dev/environments`, `/dev/customize[/<tab>]`,
`/dev/settings[/<section>]` … `place` reads a path back, `go` moves the app with
a history entry, `dev(ref)` is the door from anywhere (through `site()`), `page`
folds a record for analytics, and `remember`/`resume` keep the mode `/`
reopens. Retired addresses — `/?at=`, `/?chat=`,
`/dev?run=|project=|view=|at=`, and the builder's own grammar under /dev that
0.1.35–0.1.38 wrote (`/dev/sess_<id>`, `/dev/-/<place>`, `/dev/<org>/<repo>`,
`/dev/<slug>`) — are answered by the edge with a 301 to their paths (hanzo.ai
`lib/edge.ts`); nothing here reads them. The rooms' own links to hanzo.team's
/chat (`/chat?q=`, `/chat?thread=`) are that app's addresses and stay as they
are.

## Build and ship

`pnpm build` = team strings → `tsc` → `scripts/specifiers.mjs` (every relative
import fully specified, so Node's ESM loader resolves dist outside a bundler).
Gates: `pnpm typecheck`, `pnpm lint:design` (ratchet in
`hanzo-design.allow.json`), `pnpm build`. Publish: bump `version`, push main;
`.github/workflows/publish.yml` publishes what npm does not serve.

## Plan usage

The plan is named, read and drawn once, in @hanzo/build (≥ 0.2.53), and the
rooms mount it: `label` names a plan by family with its rung as a small tag
(`max-20x` reads Max, 20x; never a slug or an id), `useStanding` reads the
tier, the limits, the free allowance and the balance, `Meter` leads every
account menu (`Me` in the app's column, `Account` in the shell), `Plan` is
Settings → Usage and `Credits` is Settings → Billing. A plan's meter is its
session, day and month as shares, never money; Free reads the free allowance
left today; only an account with no plan and money in its balance sees the
balance, its meter. Credits live in Billing only.

`lib/limits.ts` is @hanzo/ui's `useLimits` reading `GET /v1/ai/limits` with
`scope()`; `lib/served.ts` hands every `/v1/chat/{completions,public}` answer to
`observe`, so `X-Hanzo-Usage`/`-Fallback` and a `billing_error` refusal update it
at once. Chat draws no bar; once the reader is turned away one `LimitedBanner`
over the composer says `paused()`: the plan by name and when it comes back, then
two ways — Continue with credits (writes `setCreditsAfterAllowance(true)` and
asks the last question again) where the org holds credit, else Add credits; and
the upgrade — plus See usage, which opens the shell's Settings → Usage, or the
builder's Usage (`useDevHost` answers `showSettings` there). A switch goes
through the chip's pick. The model picker marks a paused model "Paused" (its
class `limited`, or a `paused` entry naming it) and still picks it, and a
refusal is said in the thread in the server's words. The pure half (`label`,
`spent`, `ways`) is `@hanzo/build/plan`, so it loads in Node.

## The live web

`lib/web.ts` `researched` is the client's fetch. A turn on an Enso or Zen model
carries `WEB` as a mark; the turn is looked up BEFORE the model is asked —
`POST /v1/websearch {q, language}` with the top two pages read through
`/v1/crawl`, and the pages the turn names — and the model is asked once WITHOUT
tools, so the answer streams: the gateway answers a request that offers tools
whole. The model asks for no lookups of its own.

- Search is the default. `needs` skips only code, arithmetic, a passage set
  under a short instruction ending in a colon (200+ characters of prose, not a
  list, no question mark anywhere in the turn), a greeting, and a turn carrying
  files (attached or carried) or a picture, whose words never go to an outside
  engine. It reads the text's shape, never topic words: a list of English "now"
  words passed over "чума россия новости".
- Links the person points at (a short line, not inside a quote) are read first;
  a question about them also searches. `opened` reads an address by its parts,
  never words inside them: a path segment that is an action (accept,
  unsubscribe, resetpassword…) or carries another address, an action as a query
  value, a click/unsubscribe relay host, or a user name keeps it closed, and the
  model is told it was withheld; otherwise it opens without its credential and
  tracker parameters (t, token, fbclid, long opaque values). A query says an
  address as its host and path words (a withheld one as its host alone), never
  its query string. `language` reads the script, then the commonest words, then
  the reader's languages.
- What was found goes at the END OF THE LEADING SYSTEM TURN, between random
  markers. Not a system turn of its own: hanzoai/ai's text pipeline keeps only
  the last system turn and would drop the room's. Not the user turn: `enso-auto`
  routes on `lastUserText`. The empty-answer re-ask rides there too.

## Voice

Every voice path runs on `@hanzo/voice` against the platform's speech
services, with the reader's IAM bearer (`useIamToken`) and the host from
`base()`: `/v1/audio/transcriptions` and `/v1/audio/transcript` (`zen-scribe`)
listen, `/v1/audio/speech` (`zen-voice-mini`) reads, `/v1/voice` converses. The browser's recogniser and speechSynthesis only
stand in when the platform refuses, and the refusal is shown (`<Voice/>`'s
label, `SpeakButton`'s, Meet's status line).

- Chat's mic dictates into the draft (`useDictation`: each utterance lands
  after what the draft held). While it is open a finished reply is read through
  the machine's `say`, part by part in each speaker's voice, and a part spoken
  over ends the reading.
- Chat's talk button is talk mode (`useTalk`, the realtime socket `/v1/voice`):
  hands-free, the answer spoken back, its words drawn above the composer
  (`composer-talk-reply`). Its own conversation; nothing posts into the thread.
- Meet's hands-free is the dictation machine: each utterance is answered and the
  answer read by `say`, so barge-in stops it. Meet's Transcribe is the live
  transcript (`useTranscript`, `/v1/audio/transcript`): settled text goes into
  the notes, the decoding tail shows under them (`live-caption`).
- Listen (`SpeakButton`), the Meet speaker test and briefing use `speakAgent`,
  called from the click so Safari lets the reply play.
- `cast.tsx` voices are speech-service ids (`am_michael`, `bf_emma`): first
  letter accent, second register. Never OpenAI names.
- The model picker never offers a model whose `outputs` lacks `text`.

## Models

The model and the effort are ONE choice for Chat and Dev, kept in this browser
by @hanzo/build (`useMind`, `hanzo.mind` = `{model, effort}`, Enso and Medium by
default). Chat's composer draws @hanzo/build's chip (`Tune`): the effort (Low,
Medium, High — what `reasoning_effort` and a coding run's `effort` both take;
a model the catalog lists as not reasoning offers none), a sentence saying
what serves the ask, and `@hanzo/ui/models` `ModelPicker` over the whole catalog
(`GET /v1/models`, read once and shared with Dev): Hanzo's families first, then
every maker. A listed pick is sent as picked; only a name the catalog does not
list falls to `served`. A model's class and family are the catalog's fields,
never read from its id. A premium pick holds for the conversation and is never
kept (`usePick`); Settings' default picker writes the same choice and offers no
premium model. Nothing gates a pick on the plan: the gateway refuses or answers
from Enso, and the room shows that. The live web rides a turn whose model the
catalog files under Enso or Zen (`house`).

## Chat and Dev are drawn alike

- The composer is @hanzo/build's `prompt` (Chat passes it to `@hanzo/ui/chat`
  `Chat`'s `composer`): the field, then in the frame the paperclip, the chip,
  dictation, talk and send; as wide as the words above it (`measure`, the
  prose measure less the thread's gutters); cut as a pane in the app's frame.
- Under an answer, @hanzo/build's `Reply`: copy the markdown, Listen (the
  speaker's cast voice, `speakAgent`), and Open what it wrote in the side
  panel; `Served` says which model answered when it was not the one asked for.
  Code blocks are `@hanzo/ui/chat` `Code` (`Prose`).
- The crew's faces stand under the composer only while nothing has been said.
- The side panel is @hanzo/build's `Panel`: Chat's kinds are Artifacts and
  Sources (`RightPane.tsx` `useKinds`), page tabs render an artifact from its
  own bytes, a file or an address. Tabs, order and the chosen one are kept per
  conversation (`useDeck`, `chat:<channel>`); open or shut is kept on a laptop
  (`hanzo.side.chat.open`), where the frame's column holds it (`Beside`), and a
  phone opens it as a sheet. The header's Panel button and ⌘. / Ctrl+. toggle it.
  An answer that finishes writing a page while the panel is open opens it there.
- `pane.ts` holds only what goes with the next message (files, refusals).

## What each app still owns

hanzo.ai: its marketing site, the app at `/` (`_web.tsx`), the plan snapshot,
`lib/models` (the catalogue; naming comes from `@hanzo/rooms/lib/models`).
hanzo.team: its landing, sign-up, sign-in gate, the `/agents` page, and its own
`lib/host` (BRAND, BOOKING), `lib/auth/client` (its sign-in flow) and
`lib/analytics/tags` (its GA4/Pixel boot).
