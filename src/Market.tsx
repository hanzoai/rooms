'use client'

// The shelf: agents an org can bring into Hanzo, and the ones it already has.
//
// EVERY ROW IS REAL. The listings come from the platform's canonical copy of
// registry.modelcontextprotocol.io — tens of thousands of published servers —
// so this file names no vendor and hardcodes no catalogue. A brand appears here
// the day its publisher pushes an MCP server, and disappears when they pull it,
// without this surface being edited.
//
// INSTALL IS THE PLATFORM'S ONE INSTALL. `POST /v1/tools/mcp/servers` with a
// listing id creates the SAME MCPServer row that typing a URL by hand creates,
// so an org has one place its servers live however they got there.
//
// A STDIO-ONLY LISTING CANNOT BE INSTALLED HERE and the card says so rather
// than offering a button that fails: a remote endpoint is something this app can
// reach, a stdio package is a process someone still has to run.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { say } from './failure'
import { Check, Search } from 'lucide-react'
import type { McpListing, McpServer } from '@hanzo/ai'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { useIam } from '@hanzo/iam/react'
import { hasSession } from './lib/session'
import { useAi } from './lib/ai'

/** A listing reachable over HTTP is one this app can connect on its own. */
const reachable = (listing: McpListing): boolean =>
  (listing.transports ?? []).includes('streamable-http')

/** Labels a namespace carries that name no brand: `com.cloudflare.mcp` is
 *  Cloudflare, and `io.sanity.www` is Sanity. */
const PLUMBING = new Set(['mcp', 'www', 'api', 'app', 'cloud', 'io', 'server'])

const label = (listing: McpListing): string => {
  if (listing.title) return listing.title
  // A listing without a title still has a publisher, and a reverse-DNS vendor
  // names it — but the LAST label is not always the brand: `com.cloudflare.mcp`
  // ends in the word every entry here would end in. So read from the right and
  // take the first label that is a name rather than plumbing.
  const brand = (listing.vendor ?? '')
    .split('.')
    .reverse()
    .find((part) => part && !PLUMBING.has(part))
  if (brand) return brand.charAt(0).toUpperCase() + brand.slice(1)
  return listing.name?.split('/').pop() || listing.id
}

function Empty({ children }: { children: string }) {
  return (
    <YStack flex={1} items="center" justify="center" p="$6">
      <Text fontSize="$3" color="$soft" text="center">
        {children}
      </Text>
    </YStack>
  )
}

/** The publisher's mark, or its initial. Never a generated face for a brand. */
function Mark({ listing }: { listing: McpListing }) {
  return (
    <YStack
      width={40}
      height={40}
      shrink={0}
      rounded="$3"
      bg="$panel"
      items="center"
      justify="center"
      overflow="hidden"
    >
      {listing.logo ? (
        <img src={listing.logo} alt="" width={40} height={40} />
      ) : (
        <Text fontSize="$4" fontWeight="500" color="$soft">
          {label(listing).slice(0, 1).toUpperCase()}
        </Text>
      )}
    </YStack>
  )
}

function Card({
  listing,
  installed,
  onInstall,
  busy,
}: {
  listing: McpListing
  installed: boolean
  onInstall: () => void
  busy: boolean
}) {
  const canInstall = reachable(listing)
  return (
    <YStack
      width={300}
      gap="$3"
      p="$4"
      borderWidth={1}
      borderColor="$borderColor"
      rounded="$4"
    >
      <XStack gap="$3" items="flex-start">
        <Mark listing={listing} />
        <YStack flex={1} minW={0} gap="$1">
          <Text fontSize="$3" fontWeight="500" color="$ink" numberOfLines={1}>
            {label(listing)}
          </Text>
          <Text fontSize="$1" color="$soft" numberOfLines={1}>
            {listing.vendor ?? ''}
          </Text>
        </YStack>
      </XStack>

      <Text fontSize="$2" color="$soft" numberOfLines={3}>
        {listing.description || 'No description published.'}
      </Text>

      {installed ? (
        <XStack items="center" gap="$2">
          <Check size={14} aria-hidden />
          <Text fontSize="$2" color="$soft">
            Installed
          </Text>
        </XStack>
      ) : canInstall ? (
        <Box
          render="button"
          onClick={onInstall}
          self="flex-start"
          px="$3"
          py="$2"
          rounded="$3"
          borderWidth={1}
          borderColor="$borderColor"
          hoverStyle={{ bg: '$hover' }}
        >
          <Text fontSize="$2" color="$ink">
            {busy ? 'Installing' : 'Install'}
          </Text>
        </Box>
      ) : (
        // Honest, and specific: this is not "unavailable", it is a package that
        // needs a process. Naming which one keeps the row useful.
        <Text fontSize="$1" color="$soft">
          Ships as a {(listing.packages ?? [])[0]?.registry ?? 'stdio'} package — needs a
          runner before it can be connected.
        </Text>
      )}
    </YStack>
  )
}

export function Market({ scope }: { scope: 'all' | 'installed' }) {
  const { client } = useAi()
// SIGNED IN IS THE CREDENTIAL, NOT THE PROFILE. This gated on `user`, which is
// the answer to a userinfo REQUEST — and `IamProvider` swallows that request's
// failure, so a blip or a slow reply left `isAuthenticated` true and `user`
// null, and this pane told somebody holding a perfectly good token to sign in.
// The token is what the API accepts; the profile is decoration on top of it.
  const { isAuthenticated, isLoading } = useIam()
  const [ask, setAsk] = useState('')
  const [listings, setListings] = useState<McpListing[] | null>(null)
  const [mine, setMine] = useState<McpServer[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  // The shelf is org-scoped, so a signed-out reader has none to read. Asking
  // anyway answers 403 and the SDK's sentence is written for whoever wired the
  // client, not for a reader.
  const ready = Boolean(client && isAuthenticated)

  const reload = useCallback(() => {
    if (!ready || !client) return
    client.tools
      .mcp()
      .then(setMine)
      .catch(() => setMine([]))
  }, [client, ready])

  useEffect(reload, [reload])

  useEffect(() => {
    if (!ready || !client) return
    let live = true
    // The catalog is the one paginated surface here, so it is read whole and
    // the page size is stated rather than left to the default.
    client.tools
      // BROWSING SHOWS THE SHELF; SEARCHING SHOWS THE WAREHOUSE.
      //
      // The registry holds tens of thousands of servers, and a grid of all of
      // them is a directory listing rather than a storefront — the first screen
      // would be whatever sorts first alphabetically. So an empty box asks for
      // the curated ones and typing asks the whole catalog: same route, one
      // parameter, and the count below says which shelf you are looking at.
      .catalog({ q: ask || undefined, featured: ask ? undefined : true, limit: 60 })
      .then((page) => {
        if (!live) return
        setListings(page.catalog ?? [])
        setTotal(page.total ?? 0)
      })
      .catch((e: Error) => live && setFailed(e.message))
    return () => {
      live = false
    }
  }, [client, ready, ask])

  const installed = useMemo(
    () => new Set(mine.map((server) => server.listing).filter(Boolean) as string[]),
    [mine],
  )

  const install = useCallback(
    async (listing: McpListing) => {
      if (!client) return
      setBusy(listing.id)
      try {
        await client.http.json({
          method: 'POST',
          path: '/v1/tools/mcp/servers',
          body: { listing: listing.id },
        })
        reload()
      } catch (e) {
        setFailed((e as Error).message)
      } finally {
        setBusy(null)
      }
    },
    [client, reload],
  )

  const shown = useMemo(() => {
    const all = listings ?? []
    return scope === 'installed' ? all.filter((l) => installed.has(l.id)) : all
  }, [listings, installed, scope])

  const signedIn = isAuthenticated || hasSession()
  if (isLoading) return <Empty>&nbsp;</Empty>
  if (!signedIn) return <Empty>Sign in to browse agents you can add.</Empty>
  if (failed) return <Empty>{say(failed, 'the marketplace')}</Empty>

  return (
    <YStack flex={1} minH={0}>
      <YStack p="$5" gap="$2" borderBottomWidth={1} borderColor="$borderColor">
        <Text fontSize="$7" lineHeight="$7" fontWeight="500" color="$ink">
          Put AI to work in Hanzo
        </Text>
        <Text fontSize="$3" color="$soft">
          Browse agents that bring your tools into Hanzo.
        </Text>

        <XStack
          mt="$2"
          width={420}
          maxW="100%"
          height={36}
          items="center"
          gap="$2"
          px="$3"
          rounded="$3"
          borderWidth={1}
          borderColor="$borderColor"
        >
          <Search size={14} aria-hidden />
          <Text
            render={<input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Search agents" />}
            flex={1}
            bg="transparent"
            borderWidth={0}
            outlineStyle="none"
            color="inherit"
          />
        </XStack>
      </YStack>

      {!listings ? (
        <Empty>Reading the shelf.</Empty>
      ) : shown.length === 0 ? (
        <Empty>
          {scope === 'installed'
            ? 'No agents installed yet.'
            : ask
              ? 'Nothing in the registry matches that.'
              : 'The shelf is empty — the catalog has not been synced yet.'}
        </Empty>
      ) : (
        <YStack flex={1} minH={0} overflowY="auto" overflowX="hidden" p="$5" gap="$3">
          {/* The count is the whole match, not the page — the server says so and
              a card grid that implies otherwise reads as a complete catalogue. */}
          <Text fontSize="$1" color="$soft">
            {scope === 'installed'
              ? `${shown.length} installed`
              : ask
                ? `${shown.length} of ${total} matching`
                : `${shown.length} featured`}
          </Text>
          <XStack flexWrap="wrap" gap="$3">
            {shown.map((listing) => (
              <Card
                key={listing.id}
                listing={listing}
                installed={installed.has(listing.id)}
                busy={busy === listing.id}
                onInstall={() => void install(listing)}
              />
            ))}
          </XStack>
        </YStack>
      )}
    </YStack>
  )
}
