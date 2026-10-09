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
<Rooms router={useRouter()} search={useSearchParams()} path={usePathname()} route={route} Link={NextLink}>
  <Room mode="cal"><CalScheduler /></Room>
</Rooms>
```

Dev's address is a PATH under `/dev` (lib/host.ts `app`, `under`): `/dev` New,
`/dev/sess_<id>` a run, `/dev/<org>/<repo>` a project (a repository on the
forge), `/dev/-/<screen>`, `/dev/<slug>` a deployed site. `useDevHost` reads it
from `path`; the host serves its one Dev page for every path under `/dev`
(hanzo.ai: lib/edge.ts `APP`). `dev(ref)` opens Dev on a run, a repository or a
site from any surface.

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
  `plans`, `pay` (the pay site and money, apart from the plan catalogue), `share`, `coding`, `todo`, `durable`, `tags`, `host` (estate routing),
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

## Build and ship

`pnpm build` = team strings → `tsc` → `scripts/specifiers.mjs` (every relative
import fully specified, so Node's ESM loader resolves dist outside a bundler).
Gates: `pnpm typecheck`, `pnpm lint:design` (ratchet in
`hanzo-design.allow.json`), `pnpm build`. Publish: bump `version`, push main;
`.github/workflows/publish.yml` publishes what npm does not serve.

## Plan usage

`lib/limits.ts` is @hanzo/ui's `useLimits` reading `GET /v1/ai/limits` with
`scope()`; `lib/served.ts` hands every `/v1/chat/{completions,public}` answer to
`observe`, so `X-Hanzo-Usage`/`-Fallback` and a `billing_error` refusal update it
at once. Chat draws no bar and no near note; once the reader is turned away (a
fallback reply or a billing refusal) one `LimitedBanner` over the composer carries
the server's actions in its order — Continue with credits writes
`setCreditsAfterAllowance(true)` and asks the last question again on the reader's
pick, a switch goes through `choose` — plus See usage. `Enso`'s picker marks a
paused model "Paused" (its class `limited`, or a `paused` entry naming it) and
still picks it, and a refusal is said in the thread in the server's words.
Settings → Usage (also the account menu's Usage) draws `PlanUsage` with the
credits switch. `paidPlan` decides whether limits name a paid plan (the free plan
answers `"free"`). Shares only: no amount, count or cap is drawn anywhere.

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

Every picker here is `@hanzo/ui/models` `ModelPicker` over the whole catalog
(`parseModels` of `GET /v1/models`): Hanzo's families first, then every maker.
Chat's `Enso` panel is unscoped — all of it, Kai included, a model that does not
converse saying what it does — and a listed pick is sent as picked; only a name
the catalog does not list falls to `served`. The agent form is
`scope="chat"`. A model's class and family are the catalog's fields, never read
from its id. A premium pick holds for the conversation and is never remembered
as the default (`Chat`'s `picked`); Settings' default picker offers no premium
model. Nothing gates a pick on the plan: the gateway refuses or answers from Enso, and the room shows that. The live web rides a turn whose
model the catalog files under Enso or Zen (`house`).

## What each app still owns

hanzo.ai: its marketing site, the app at `/` (`_web.tsx`), the plan snapshot,
`lib/models` (the catalogue; naming comes from `@hanzo/rooms/lib/models`).
hanzo.team: its landing, sign-up, sign-in gate, the `/agents` page, and its own
`lib/host` (BRAND, BOOKING), `lib/auth/client` (its sign-in flow) and
`lib/analytics/tags` (its GA4/Pixel boot).
