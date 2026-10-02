# @hanzo/rooms

The workspace rooms — Home, Chat, Inbox, Contacts, Meet, Cal, Drive, Board,
Work, Bots, Guide, Settings — and the frame that holds them (Room, Shell,
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
configure({ site: '', home: '/home', signUp: '/signup', api, iam, key })
configure({ plans, integrations })       // only where the rooms draw — heavy
```

```tsx
// Where the rooms render (client: host.tsx).
<Rooms router={useRouter()} search={useSearchParams()} route={route} Link={NextLink}>
  <Room mode="cal"><CalScheduler /></Room>
</Rooms>
```

| address | hanzo.ai | hanzo.team |
|---|---|---|
| `site` — where the app's pages live (`/dev`, `/legal/*`, `/pricing`) | `''` | `https://hanzo.ai` |
| `home` — the rooms' Home | `/home` | `/` |
| `signUp` | `/signup` | `/start` |
| `Landing`, `Signup` — the front door of a workspace rooted at `/` | — | team's components |
| `plans`, `integrations` — first-paint catalogue, Directory's apps | build data | build data |

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

## Layout

- `src/*.tsx` — the rooms, as `components/workspace/*` was in hanzo.ai; each is
  a subpath (`@hanzo/rooms/CalScheduler`).
- `src/bots/*` — the Bots room.
- `src/lib/*` — the workspace's infrastructure, one copy for every host:
  `session`, `destination`, `api`, `ai` (useAi), `account`, `tier`, `limits`,
  `plans`, `share`, `coding`, `todo`, `durable`, `tags`, `host` (estate routing),
  `mix`, `hydrated` … Apps import these from the package
  (`@hanzo/rooms/lib/session`) and keep no copy.
- `src/team.gen.ts` — the core team's persona files as strings, generated from
  `@hanzo/personas` by `scripts/team.mjs`, so no host needs an asset loader.

## Build and ship

`pnpm build` = team strings → `tsc` → `scripts/specifiers.mjs` (every relative
import fully specified, so Node's ESM loader resolves dist outside a bundler).
Gates: `pnpm typecheck`, `pnpm lint:design` (ratchet in
`hanzo-design.allow.json`), `pnpm build`. Publish: bump `version`, push main;
`.github/workflows/publish.yml` publishes what npm does not serve.

## What each app still owns

hanzo.ai: its marketing site, the app at `/` (`_web.tsx`), the integrations and
plan data, `lib/models` (the catalogue; naming comes from `@hanzo/rooms/lib/models`).
hanzo.team: its landing, sign-up, sign-in gate, the `/agents` page, and its own
`lib/host` (BRAND, BOOKING), `lib/auth/client` (its sign-in flow) and
`lib/analytics/tags` (its GA4/Pixel boot).
