'use client'

// The organization comes first.
//
// An organization owns every agent, credit and member. A signed-in reader who
// has none is shown one thing: make one. A reader with several picks the one
// they are working in when they arrive. And an organization whose plan is not
// live is asked for it before any room is drawn. Only past all three does the
// workspace render, and every request under it then carries that organization
// (lib/auth/session.ts `scope`, hooks/useAi.ts).
//
// FREE IS FOR ONE PERSON. A personal organization on the Free tier opens /chat
// and /dev on every host but hanzo.team; the workspace's own host asks every
// organization for a paid plan. A personal organization starts on Free and may
// upgrade at creation; a team organization is sold the per-seat Team plan, and
// that is the plan the subscribe ask offers. Plans are the catalog's, read live
// and seeded from @hanzo/plans for first paint. Checkout is hanzo.ai/pay in
// this tab; it returns here, and the tier is read again on return.
//
// THE FRONT DOOR. A workspace rooted at `/` (hanzo.team) draws its host's
// Landing for a stranger at Home (`front`) and its host's Signup at /start
// (`signup`). Behind either, a reader with no team names one, invites people
// and takes the per-seat plan (`Start`, `Plan`) instead of the create dialog
// and the subscribe ask; a personal organization on Free is offered a team,
// and an open one is sent on (`forward`). Without those props nothing here
// changes.

import { dev } from './lib/host'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useIam } from '@hanzo/iam/react'
import { Text, View, XStack, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { Minus, Plus, X } from 'lucide-react'
import { Waiting } from './waiting'
import { LOGIN, enter } from './lib/destination'
import { useAi } from './lib/ai'
import { useHost } from './lib/hostname'
import { useHydrated } from './lib/hydrated'
import { api } from './lib/api'
import { usePersonal, useTier } from './lib/tier'
import { ORG, PICKED, assumed, hasSession, org, orgs as claimed, pick, renew, scope } from './lib/session'
import { team as workspace } from './lib/host'
import { checkoutUrl, money } from './lib/pay'
import { cartUrl, charge, priced, usePlan, usePlans, type Interval, type SubscriptionPlan } from './lib/plans'
import { createInvitation, inviteLink } from './lib/invite'
import { countSignup } from './lib/intent'
import { track } from './lib/tags'
import { BAD, mix } from './lib/mix'
import { useRooms } from './host'
import { site, where } from './where'

/** A template to set up once the organization is live. */
const SETUP = 'hanzo:org:template'

interface Template { slug: string; title?: string; name?: string; category?: string; description?: string }

/** Checkout for a plan, coming back to this room. */
function checkout(plan: SubscriptionPlan): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://hanzo.ai'
  const path = typeof window !== 'undefined' ? window.location.pathname : '/chat'
  return checkoutUrl(plan.id, `${origin}${path}`)
}

export function Orgs({
  children,
  front = false,
  forward,
  signup = false,
}: {
  children: ReactNode
  /** Home at `/`: a stranger meets the host's Landing, a member with no team `<Landing member />`. */
  front?: boolean
  /** Where an open organization is sent instead of drawing `children`: /start sends it Home. */
  forward?: string
  /** A stranger is shown the host's Signup rather than the sign-in: /start. */
  signup?: boolean
}) {
  const hydrated = useHydrated()
  const { isAuthenticated, isLoading, accessToken } = useIam()
  const { Landing, Signup, team } = where()
  // The front door's own flow: naming a team, inviting it, the per-seat plan —
  // at hanzo.ai's Home and /start, and in every room of hanzo.team.
  const door = front || signup || Boolean(team)
  const arriving = useArrival(door, hydrated, isLoading, isAuthenticated)
  const members = useMemo(() => claimed(), [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps
  const [current, setCurrent] = useState<string | null>(() => org())
  useEffect(() => {
    setCurrent(org())
    const on = () => setCurrent(org())
    window.addEventListener(ORG, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(ORG, on)
      window.removeEventListener('storage', on)
    }
  }, [accessToken])
  const [picked, setPicked] = useState(false)
  // The team being set up in this page. Once its name is taken the setup owns
  // the screen until checkout, whatever `Orgs` reads of the new organization.
  const [founding, setFounding] = useState<string | null>(null)
  const { tier, wrong, reload } = useTier(Boolean(isAuthenticated && current), current)
  // A plan is live when billing READ one for this organization and it is not the free rung.
  const live = Boolean(tier?.tier && tier.tier.name !== FREE_TIER)
  // A Free organization off the workspace's host is asked what kind it is, and a
  // personal one opens: Free is the plan a person uses the app on alone. Behind
  // the front door every organization without a live plan is read for its kind:
  // a team is offered the plan, a personal one is offered a team.
  const onTeam = workspace(useHost())
  const free = door ? Boolean(tier) && !live : !live && !onTeam && tier?.tier?.name === FREE_TIER
  const personal = usePersonal(current, free)
  // A SuperAdmin IAM stepped into this organization sees its rooms whatever its
  // plan: support is there to see what the organization has, and what it spends
  // is billed to the operator's own books, never the organization's.
  const supporting = Boolean(current) && assumed() === current
  const open = live || (!door && free && personal === true) || supporting
  const { client } = useAi()

  useEffect(() => {
    try {
      setPicked(Boolean(localStorage.getItem(PICKED)))
    } catch {
      setPicked(true)
    }
  }, [accessToken])

  // Back from checkout: the plan may be live now.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible') reload()
    }
    document.addEventListener('visibilitychange', back)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('focus', back)
    }
  }, [reload])

  const choose = useCallback((o: string) => {
    pick(o)
    setPicked(true)
  }, [])

  // The organization a link arrives for. hanzo.ai opens the workspace at
  // `?signin&org=<the org it is working in>` (Me.tsx); once signed in, an org
  // the token's `orgs` names is chosen and the parameter leaves the address, the
  // way `?signin` does. An org the token does not name is ignored.
  useEffect(() => {
    if (!door || !hydrated || isLoading || !isAuthenticated) return
    const url = new URL(window.location.href)
    const asked = url.searchParams.get('org')
    if (asked === null) return
    url.searchParams.delete('org')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    if (members.includes(asked)) choose(asked)
  }, [door, hydrated, isLoading, isAuthenticated, members, choose])

  // One organization is not a choice.
  useEffect(() => {
    if (members.length === 1 && !picked) choose(members[0])
  }, [members, picked, choose])

  // The template chosen at creation, set up once the organization opens.
  useEffect(() => {
    if (!open || !client) return
    let slug: string | null
    try {
      slug = localStorage.getItem(SETUP)
      if (slug) localStorage.removeItem(SETUP)
    } catch {
      return
    }
    if (!slug) return
    client.http
      .json<{ id?: string }>({ method: 'POST', path: '/v1/projects/fork', body: { slug } })
      .then((made) => {
        if (made?.id) window.location.assign(dev())
      })
      .catch(() => {})
  }, [open, client])

  // NOTHING PRODUCT-SHAPED IS IN THE EXPORTED MARKUP. This branch is what the
  // static file holds and what hydration's first render must agree with, so
  // whatever it returns is what a reader sees before any answer exists. It used
  // to return the room, which put the whole paid interface on disk: the browser
  // painted it from the file, the SDK settled, billing answered, and only then
  // did the ask appear over the top of a product the reader had already been
  // shown. The veil is the same element in both renders, so there is no
  // mismatch and there is nothing to see. Home at `/` ships the host's Landing
  // instead, which is what a stranger there is shown and what a crawler reads.
  if (!hydrated) return front && Landing ? <Landing /> : <Veil />
  // Past hydration the room keeps its place in the tree in every branch that
  // draws it — the veil goes AFTER it — so a token refresh mid-session never
  // remounts what the reader had open. The veil is unconditional now: it was
  // hung only when a token was already in hand, which left a visitor arriving
  // without one looking at the room while the SDK decided.
  if (isLoading) return front && Landing && !hasSession() && !arriving ? <Landing /> : <>{children}<Veil /></>
  if (arriving && !isAuthenticated) return <SignIn to={LOGIN} />
  if (!isAuthenticated) return front && Landing ? <Landing /> : signup && Signup ? <Signup /> : <SignIn />
  if (founding) return <Start founded={founding} onFounded={setFounding} first={members.length === 0} />
  if (members.length === 0) {
    if (front && Landing) return <Landing member />
    return door ? <Start onFounded={setFounding} first /> : <Create />
  }
  if (!current || (members.length > 1 && !picked)) return <Pick members={members} onPick={choose} />
  // NOTHING OPENS WITHOUT A LIVE PLAN. Every branch here used to hand the room
  // over when the answer was anything but a plain "free": an error of any kind,
  // a read still in flight, a document with no plan in it. Each was a way in
  // without paying — a refusal, a slow network, or devtools blocking one request
  // all read as permission. The default is now the ask, and the room is the
  // exception rather than the fallback. The one exception to the plan is a
  // personal organization on Free, off hanzo.team, and its kind is read first.
  if (!tier && !wrong) return <>{children}<Veil /></>
  if (free && personal === null) return <>{children}<Veil /></>
  if (open) return forward ? <Forward to={forward} /> : <>{children}</>
  const swap = () => setPicked(false)
  if (door) {
    // A billing OUTAGE is ours; the plan is still the condition.
    if (!tier) return <Plan org={current} members={members} onSwitch={swap} outage={outage(wrong)} onRetry={reload} />
    if (personal) {
      if (front && Landing) return <Landing member />
      return <Start onFounded={setFounding} first={false} members={members} onSwitch={swap} />
    }
    return <Plan org={current} members={members} onSwitch={swap} />
  }
  // A billing OUTAGE is not a bill: it is ours, and saying "subscribe" to
  // someone who already has would be a lie. It still does not open the room.
  return <Subscribe org={current} members={members} onSwitch={swap} outage={outage(wrong)} onRetry={reload} />
}

/**
 * A link that asks to arrive signed in.
 *
 * A workspace on its own origin keeps its own session, so a person signed in on
 * hanzo.ai arrives there signed out and would meet the landing. hanzo.ai's
 * Workspace row sends `?signin` (lib/host `ENTRY`), and behind the front door
 * that draws the sign-in in place of the landing; the sign-in returns to this
 * page, which opens the workspace. The flag leaves the address at once, so the
 * page the sign-in returns to does not ask again.
 */
function useArrival(door: boolean, hydrated: boolean, isLoading: boolean, isAuthenticated: boolean): boolean {
  const [arriving, setArriving] = useState(false)
  useEffect(() => {
    if (!door || !hydrated) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('signin')) return
    url.searchParams.delete('signin')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    setArriving(true)
  }, [door, hydrated])
  useEffect(() => {
    if (arriving && !isLoading && isAuthenticated) setArriving(false)
  }, [arriving, isLoading, isAuthenticated])
  return arriving
}

// ── the screens ────────────────────────────────────────────────────────────────

/** Every screen here is one sheet over the room, ten above its modals, and the create dialog ten above that.
 *  gui carries a `calc()` to the page unchanged; its types only name custom properties. */
const SHEET = 'calc(var(--z-modal) + 10)' as `var(--${string})`
const DIALOG = 'calc(var(--z-modal) + 20)' as `var(--${string})`
/** The sheet's top inset: a share of the window's height, held between two lengths. */
const TOP = 'clamp(32px, 12vh, 120px)' as `var(--${string})`
const muted = 'var(--muted-foreground)'
/** The black that veils and shadows, at a share of itself. */
const shade = (share: number) => mix('var(--pure-black)', share, 'srgb')
/** A field in the create dialog. */
const FIELD = {
  width: '100%',
  fontSize: '$6',
  px: 16,
  py: 14,
  rounded: 12,
  borderWidth: 1,
  borderColor: 'var(--border)',
  bg: 'var(--background)',
  color: 'var(--foreground)',
} as const

/** The sheet every screen stands on: the whole viewport, scrolling, its column centred. */
function Page({ label, children }: { label: string; children: ReactNode }) {
  return (
    <YStack
      position="fixed"
      inset={0}
      z={SHEET}
      overflowY="auto"
      bg="var(--background)"
      pt={TOP}
      px={20}
      pb={48}
      role="region"
      aria-label={label}
    >
      {children}
    </YStack>
  )
}

/** The column a screen's words sit in. */
function Column({ children }: { children: ReactNode }) {
  return (
    <YStack width="100%" maxW={640} mx="auto">
      {children}
    </YStack>
  )
}

/** A hairline between the parts of a screen. */
function Rule({ mt = 20, mb = 20 }: { mt?: number; mb?: number }) {
  return <View height={1} bg="var(--border)" mt={mt} mb={mb} />
}

/** A screen's heading and the line under it; `lead` is the line's leading where it states one. */
function Heading({ title, lede, lead }: { title: ReactNode; lede: ReactNode; lead?: number }) {
  return (
    <>
      <Text render="h1" fontSize="$10" fontWeight="500" letterSpacing={-0.32} color="var(--text-primary)">
        {title}
      </Text>
      <Text render="p" mt={6} fontSize="$4" lineHeight={lead} color={muted}>
        {lede}
      </Text>
    </>
  )
}

/** The room, held back until the organization is known. */
function Veil() {
  return <View aria-hidden position="fixed" inset={0} z={SHEET} bg="var(--background)" />
}

/** An open organization, sent on. */
function Forward({ to }: { to: string }) {
  const { router } = useRooms()
  useEffect(() => router.replace(to), [router, to])
  return <Veil />
}

/** Which step of the setup this is, of how many. */
function Step({ at, of }: { at: number; of: number }) {
  return (
    <Text render="p" mb={10} fontSize="$2" fontFamily="$mono" color="$soft">
      Step {at} of {of}
    </Text>
  )
}

function Brand() {
  return (
    <Text fontSize="$6" fontWeight="500" mb={28} color="var(--foreground)">
      {where().brand ?? 'Hanzo'}
    </Text>
  )
}

/** The free rung's name in the billing catalog. */
const FREE_TIER = 'free'

/**
 * Whether a failed tier read is OUR fault. A 5xx or a network error is an
 * outage; a 401, 403 or 404 is an answer, and an answer that is not a paid plan
 * is not a reason to open the room.
 */
function outage(wrong: unknown): boolean {
  const status = (wrong as { status?: number } | null)?.status
  return status == null || status >= 500
}

/**
 * SIGNED OUT IS A TRIP TO SIGN IN, and nothing else.
 *
 * IAM owns every credential, so this room draws no form of its own: it sends
 * the reader to this site's sign-in (destination.ts `enter`), which asks
 * hanzo.id for a session first and draws IAM's form only when there is none.
 * `Room` wrote the address down on mount, so the sign-in returns to this room,
 * `?q=` included.
 */
function SignIn({ to }: { to?: string }) {
  useEffect(() => enter(to), [to])
  return (
    <Page label="Sign in">
      <Waiting title="Signing you in" lede="One moment." />
    </Page>
  )
}

/** No organization yet: the one thing to do. */
function Create() {
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(false)
  return (
    <Page label="Organizations">
      <Column>
        <Brand />
        <XStack items="flex-start" justify="space-between" gap={16} flexWrap="wrap">
          <YStack>
            <Text render="h1" fontSize="$10" fontWeight="500" letterSpacing={-0.32} color="var(--text-primary)">
              Organizations
            </Text>
            <Text render="p" mt={6} fontSize="$4" color={muted}>
              You do not belong to one yet.
            </Text>
          </YStack>
          <Button variant="primary" size="lg" onClick={() => setOpen(true)}>
            <Plus size={16} aria-hidden />
            New organization
          </Button>
        </XStack>
        <Rule />
        <YStack items="center" py={28}>
          <Text render="p" fontSize="$6" fontWeight="500" color="var(--foreground)" text="center">
            No organizations yet
          </Text>
          <Button variant="linkMuted" size="sm" mt={8} onClick={() => setDetails((d) => !d)}>
            {details ? '- Details' : '+ Details'}
          </Button>
          {details ? (
            <Text render="p" mt={12} maxW={440} fontSize="$4" color={muted} lineHeight={23.25} text="center">
              An organization owns every agent, credit and member. Create one and you are its owner.
            </Text>
          ) : null}
        </YStack>
        <Rule />
      </Column>
      {open ? <CreateDialog onClose={() => setOpen(false)} /> : null}
    </Page>
  )
}

/** Name it, pick what it runs and its plan: a paid plan goes to checkout, Free goes straight in. */
function CreateDialog({ onClose }: { onClose: () => void }) {
  const team = usePlan('team')
  // The personal ladder, Free first. hanzo.team offers no personal organization:
  // every room there runs on a paid plan.
  const ladder = usePlans('personal')
  const alone = !workspace(useHost())
  const [rung, setRung] = useState<string | null>(null)
  const chosen = ladder.find((p) => p.id === rung) ?? ladder.find((p) => !p.priceMonthly) ?? ladder[0] ?? null
  const personal = priced(chosen)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'org' | 'personal'>('org')
  // A team organization runs on the per-seat Team plan; a personal one on the
  // rung chosen below, Free unless another is. Checkout sets the seats and the term.
  const { plan, price } = kind === 'org' ? team : personal
  const seat = plan?.pricePerUser ? ' / seat' : ''
  const paid = (plan?.priceMonthly ?? 0) > 0
  // A row on the landing carries its template in the address, across sign-in.
  const [template, setTemplate] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('template') ?? ''
  })
  const [templates, setTemplates] = useState<Template[]>([])
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${api()}/v1/templates`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: Template[] } | null) => {
        if (Array.isArray(d?.data)) setTemplates(d.data.filter((t) => t?.slug))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plan || busy) return
    if (kind === 'org' && !name.trim()) {
      setRefused('Give it a name.')
      return
    }
    setBusy(true)
    setRefused(null)
    try {
      const r = await fetch(`${api()}/v1/account/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...scope() },
        body: JSON.stringify(kind === 'org' ? { name: name.trim() } : { personal: true }),
      })
      if (!r.ok) {
        let why = `Could not create it (${r.status}).`
        try {
          const body = (await r.json()) as { detail?: string; error?: string; message?: string }
          why = body.detail || body.error || body.message || why
        } catch {
          /* no body worth showing */
        }
        setRefused(why)
        setBusy(false)
        return
      }
      const made = (await r.json()) as { org?: string }
      try {
        if (template) localStorage.setItem(SETUP, template)
        localStorage.setItem(PICKED, '1')
      } catch {
        /* the next load re-derives both */
      }
      if (made?.org) pick(made.org)
      // Only a reader with no organization is offered this form, so its first
      // success is the account becoming a customer: the ONE sign-up conversion,
      // Free included — our signup_completed, GA4's sign_up, Meta's
      // CompleteRegistration (lib/analytics/tags.ts).
      countSignup()
      // The token in hand predates the organization; the next load mints one
      // that carries it. A paid plan is bought first, and checkout charges the
      // organization it names; Free goes straight in.
      renew()
      if (paid) window.location.assign(checkout(plan))
      else window.location.reload()
    } catch (err) {
      setRefused(err instanceof Error ? err.message : 'Could not create it.')
      setBusy(false)
    }
  }

  return (
    <YStack
      role="dialog"
      aria-modal
      aria-label="Create an organization"
      position="fixed"
      inset={0}
      z={DIALOG}
      bg={shade(28)}
      overflowY="auto"
      py="6vh"
      px={16}
      onClick={onClose}
    >
      <YStack
        render="form"
        {...{ onSubmit: submit }}
        onClick={(e) => e.stopPropagation()}
        width="100%"
        maxW={640}
        mx="auto"
        bg="var(--background)"
        rounded={16}
        boxShadow={`0 24px 64px ${shade(28)}`}
        pt={28}
        px={28}
        pb={20}
      >
        <XStack items="flex-start" justify="space-between" gap={12}>
          <YStack shrink={1} minW="auto">
            <Text render="h2" fontSize="$8" fontWeight="500" color="var(--text-primary)">
              Create an organization
            </Text>
            <Text render="p" mt={8} fontSize="$4" color={muted} lineHeight={22.5}>
              You are its owner. Agents, credits and members all hang off it; you can switch between organizations from the rail.
            </Text>
          </YStack>
          <Button type="button" variant="ghost" size="icon-sm" mr={-8} onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden />
          </Button>
        </XStack>

        <View render="fieldset" display="block" borderWidth={0} p={0} m={0} mt={22}>
          <Text render="legend" display="block" fontSize="$4" fontWeight="500" mb={10} color="var(--foreground)">
            Plan
          </Text>
          <View display="grid" gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={10}>
            {(
              [
                ['org', 'Organization', 'A team. Invite members, share agents and credit.', team],
                ['personal', 'Personal', 'Just you. Named after your account.', personal],
              ] as const
            ).filter(([k]) => alone || k === 'org').map(([k, label, hint, offer]) => (
              <XStack
                key={k}
                render="label"
                gap={10}
                items="flex-start"
                px={14}
                py={12}
                rounded={12}
                borderWidth={1}
                borderColor={kind === k ? 'var(--foreground)' : 'var(--border)'}
                cursor="pointer"
              >
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                <YStack shrink={1}>
                  <Text fontSize="$4" fontWeight="500" color="var(--foreground)">
                    {label}
                    {offer.plan ? (
                      <Text color={muted} fontWeight="400">
                        {' '}— {offer.plan.priceMonthly ? `${offer.price}${offer.plan.pricePerUser ? ' / seat' : ''} / month` : offer.plan.name}
                      </Text>
                    ) : null}
                  </Text>
                  <Text fontSize="$3" color={muted} mt={2}>
                    {hint}
                  </Text>
                </YStack>
              </XStack>
            ))}
          </View>
        </View>

        {kind === 'personal' && ladder.length > 1 ? (
          <View render="fieldset" display="block" borderWidth={0} p={0} m={0} mt={20}>
            <Text render="legend" display="block" fontSize="$4" fontWeight="500" mb={10} color="var(--foreground)">
              Personal plan
            </Text>
            <View display="grid" gap={8}>
              {ladder.map((p) => (
                <XStack
                  key={p.id}
                  render="label"
                  gap={10}
                  items="center"
                  px={14}
                  py={10}
                  rounded={12}
                  borderWidth={1}
                  borderColor={chosen?.id === p.id ? 'var(--foreground)' : 'var(--border)'}
                  cursor="pointer"
                >
                  <input type="radio" name="rung" value={p.id} checked={chosen?.id === p.id} onChange={() => setRung(p.id)} />
                  <Text fontSize="$4" fontWeight="500" color="var(--foreground)">
                    {p.name}
                  </Text>
                  {p.priceMonthly ? (
                    <Text ml="auto" fontSize="$3" color={muted}>
                      {priced(p).price} / month
                    </Text>
                  ) : null}
                </XStack>
              ))}
            </View>
          </View>
        ) : null}

        {kind === 'org' ? (
          <View render="label" display="block" mt={20}>
            <Text display="block" fontSize="$4" fontWeight="500" mb={8} color="var(--foreground)">
              Name
            </Text>
            <Text render={<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme" autoFocus />} {...FIELD} />
            <Text display="block" fontSize="$3" color={muted} mt={8}>
              What the rail and every invoice call it.
            </Text>
          </View>
        ) : null}

        {templates.length > 0 ? (
          <View render="label" display="block" mt={20}>
            <Text display="block" fontSize="$4" fontWeight="500" mb={8} color="var(--foreground)">
              Template
            </Text>
            <Text
              render={<select value={template} onChange={(e) => setTemplate(e.target.value)} />}
              {...FIELD}
            >
              <option value="">None — start empty</option>
              {templates.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.title || t.name || t.slug}
                  {t.category ? ` · ${t.category}` : ''}
                </option>
              ))}
            </Text>
            <Text display="block" fontSize="$3" color={muted} mt={8}>
              What it runs, set up as soon as the organization opens. Choose none to start empty.
            </Text>
          </View>
        ) : null}

        {plan && !paid ? (
          <Text render="p" mt={22} fontSize="$4" color={muted} lineHeight={23.25}>
            A personal organization starts on {plan.name} and opens as soon as it is made. Choose a paid plan above to go to checkout instead.
          </Text>
        ) : plan ? (
          <Text render="p" mt={22} fontSize="$4" color={muted} lineHeight={23.25}>
            {plan.pricePerUser
              ? `A team organization runs on ${plan.name} at ${price} per seat a month, at least ${Number(plan.limits?.minSeats ?? 1)} seats.`
              : `A personal organization runs on ${plan.name} at ${price} a month.`}{' '}
            Nothing in it works until that plan is live, so creating one takes you straight to checkout, where you choose the seats and the term.
            {' '}Each plan includes session and daily usage limits; usage never draws your credit balance.{' '}
            Payment is on the provider&apos;s hosted page.
          </Text>
        ) : null}

        {refused ? (
          <Text render="p" role="alert" mt={14} fontSize="$3" color="var(--foreground)">
            {refused}
          </Text>
        ) : null}

        {/* A Button's label never wraps, and the paid one is wider than a phone's column: the row wraps, and this label is a Text that does. */}
        <XStack justify="flex-end" gap={10} mt={24} flexWrap="wrap">
          <Button type="button" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="lg" shrink={1} py="$2" disabled={!plan || busy}>
            <Text fontFamily="$body" fontSize="$3" color="inherit" text="center">
              {busy ? 'Creating…' : paid ? `Create and subscribe — ${price}${seat} / month` : 'Create'}
            </Text>
          </Button>
        </XStack>
        <Rule mt={18} mb={8} />
        <Text render="p" text="right" fontSize="$2" color={muted} fontFamily="$mono">
          Esc to close
        </Text>
      </YStack>
    </YStack>
  )
}

/** Several organizations: which one, this time. */
function Pick({ members, onPick }: { members: string[]; onPick: (o: string) => void }) {
  return (
    <Page label="Choose an organization">
      <Column>
        <Brand />
        <Heading title="Choose an organization" lede={<>Everything you open — chats, agents, credit — is this one&apos;s.</>} />
        <Rule />
        <View display="grid" gap={10}>
          {members.map((o) => (
            <View
              key={o}
              render="button"
              onClick={() => onPick(o)}
              items="flex-start"
              px={16}
              py={14}
              rounded={12}
              borderWidth={1}
              borderColor="var(--border)"
              bg="transparent"
              cursor="pointer"
            >
              <Text fontSize="$4" color="var(--foreground)" text="left">
                {o}
              </Text>
            </View>
          ))}
        </View>
      </Column>
    </Page>
  )
}

/** The organization exists and its plan is not live: it is offered the per-seat Team plan. */
function Subscribe({
  org,
  members,
  onSwitch,
  outage,
  onRetry,
}: {
  org: string
  members: string[]
  onSwitch: () => void
  // True when billing could not be READ. The room still does not open — a plan
  // is the condition — but the reader is told it is ours to fix, not theirs.
  outage?: boolean
  onRetry?: () => void
}) {
  const { plan, price } = usePlan('team')
  const seat = plan?.pricePerUser ? ' / seat' : ''
  return (
    <Page label="Subscribe">
      <Column>
        <Brand />
        <Heading
          title={org}
          lead={22.5}
          lede={plan ? `This organization runs on the ${plan.name} plan at ${price}${seat} / month, and nothing in it works until that plan is live.` : 'Its plan is not live yet.'}
        />
        <Rule />
        <XStack gap={10} flexWrap="wrap">
          {plan ? (
            <Button asChild variant="primary" size="lg">
              <a href={checkout(plan)}>{`Subscribe — ${price}${seat} / month`}</a>
            </Button>
          ) : null}
          {members.length > 1 ? (
            <Button size="lg" onClick={onSwitch}>
              Switch organization
            </Button>
          ) : null}
        </XStack>
      </Column>
    </Page>
  )
}

// ── the front door's setup ─────────────────────────────────────────────────────

/**
 * CREATE YOUR TEAM: its name, then who else is in it, then its plan.
 *
 * The name makes the organization (`POST /v1/account/orgs`). The access token
 * in hand predates it, so it is expired and refreshed at once, which mints one
 * that carries the new organization, and the organization is selected: the
 * invitations that follow are filed against it. Invitations are optional, one
 * single-use link per address. The plan step is `Plan`, the same one a team on
 * Free is shown.
 */
function Start({
  founded = null,
  onFounded,
  first,
  members = [],
  onSwitch,
}: {
  /** The organization this setup already made, when it is past its first step. */
  founded?: string | null
  onFounded: (org: string) => void
  /** The reader belongs to no organization yet, so this one is their sign-up. */
  first: boolean
  members?: string[]
  onSwitch?: () => void
}) {
  const { sdk } = useIam()
  const [step, setStep] = useState<'name' | 'invite' | 'plan'>(founded ? 'invite' : 'name')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [emails, setEmails] = useState('')
  const [sent, setSent] = useState<{ email: string; link?: string; refused?: string }[]>([])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) {
      setRefused('Give it a name.')
      return
    }
    setBusy(true)
    setRefused(null)
    try {
      const r = await fetch(`${api()}/v1/account/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...scope() },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!r.ok) {
        let why = `Could not create it (${r.status}).`
        try {
          const body = (await r.json()) as { detail?: string; error?: string; message?: string }
          why = body.detail || body.error || body.message || why
        } catch {
          /* no body worth showing */
        }
        setRefused(why)
        setBusy(false)
        return
      }
      const made = (await r.json()) as { org?: string }
      if (!made?.org) {
        setRefused('The organization was made but its name did not come back. Reload to find it.')
        setBusy(false)
        return
      }
      // The first organization is the account becoming a customer: the ONE
      // sign-up conversion, as the create dialog counts it.
      if (first) countSignup()
      renew()
      await sdk.refreshAccessToken().catch(() => null)
      pick(made.org)
      onFounded(made.org)
      setBusy(false)
      setStep('invite')
    } catch (err) {
      setRefused(err instanceof Error ? err.message : 'Could not create it.')
      setBusy(false)
    }
  }

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    const list = [...new Set(emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]
    if (list.length === 0 || !founded) {
      setStep('plan')
      return
    }
    setBusy(true)
    const out = await Promise.all(
      list.map(async (email) => {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { email, refused: 'Not an email address.' }
        try {
          const made = await createInvitation(founded, email)
          return { email, link: inviteLink(made.owner || founded, made.code) }
        } catch (err) {
          return { email, refused: err instanceof Error ? err.message : 'Could not invite.' }
        }
      }),
    )
    setSent(out)
    setBusy(false)
  }

  if (step === 'plan' && founded) return <Plan org={founded} members={[founded]} seats={1 + sent.filter((s) => s.link).length} setup />

  return (
    <Page label="Create your team">
      <Column>
        <Brand />
        {step === 'name' ? (
          <YStack render="form" {...{ onSubmit: create }}>
            <Step at={1} of={3} />
            <Heading title="Create your team" lede="A team owns its agents, credit and members. You are its owner." />
            <Rule />
            <View render="label" display="block">
              <Text display="block" fontSize="$4" fontWeight="500" mb={8} color="$ink">
                Team name
              </Text>
              <Text render={<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme" autoFocus />} {...FIELD} />
              <Text display="block" fontSize="$3" color="$soft" mt={8}>
                What the rail and every invoice call it.
              </Text>
            </View>
            {refused ? (
              <Text render="p" role="alert" mt={14} fontSize="$3" color={BAD}>
                {refused}
              </Text>
            ) : null}
            <XStack gap={10} flexWrap="wrap" mt={24}>
              <Button type="submit" variant="primary" size="lg" disabled={busy}>
                {busy ? 'Creating…' : 'Continue'}
              </Button>
              {members.length > 1 && onSwitch ? (
                <Button type="button" size="lg" onClick={onSwitch}>
                  Switch organization
                </Button>
              ) : null}
            </XStack>
            <Rule />
            <Text render="p" fontSize="$3" color="$soft">
              Just you? Hanzo Chat is free for personal use at{' '}
              <Text render={<a href={site('/chat')} />} color="$ink" textDecorationLine="underline">
                hanzo.ai/chat
              </Text>
              .
            </Text>
          </YStack>
        ) : (
          <YStack render="form" {...{ onSubmit: invite }}>
            <Step at={2} of={3} />
            <Heading
              title="Invite your teammates"
              lede="Each address gets its own single-use link to join. You can skip this and invite people later."
            />
            <Rule />
            <View render="label" display="block">
              <Text display="block" fontSize="$4" fontWeight="500" mb={8} color="$ink">
                Email addresses
              </Text>
              <Text
                render={<textarea value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ada@acme.com, alan@acme.com" rows={3} />}
                {...FIELD}
              />
              <Text display="block" fontSize="$3" color="$soft" mt={8}>
                Separate them with commas, spaces or new lines.
              </Text>
            </View>
            {sent.length ? (
              <YStack render="ul" gap={8} m={0} p={0} mt={18} aria-label="Invitations">
                {sent.map((s) => (
                  <YStack render="li" key={s.email}>
                    <Text fontSize="$3" color="$soft" wordWrap="break-word">
                      <Text fontWeight="500" color="$ink">
                        {s.email}
                      </Text>{' '}
                      {s.link ? (
                        <>
                          invited. Their link:{' '}
                          <Text render={<a href={s.link} />} color="$ink" textDecorationLine="underline">
                            {s.link}
                          </Text>
                        </>
                      ) : (
                        <Text role="alert" color={BAD}>
                          {s.refused}
                        </Text>
                      )}
                    </Text>
                  </YStack>
                ))}
              </YStack>
            ) : null}
            <XStack gap={10} flexWrap="wrap" mt={24}>
              {sent.length ? (
                <Button type="button" variant="primary" size="lg" onClick={() => setStep('plan')}>
                  Continue
                </Button>
              ) : (
                <>
                  <Button type="submit" variant="primary" size="lg" disabled={busy}>
                    {busy ? 'Inviting…' : emails.trim() ? 'Invite and continue' : 'Continue'}
                  </Button>
                  <Button type="button" size="lg" onClick={() => setStep('plan')}>
                    Skip for now
                  </Button>
                </>
              )}
            </XStack>
          </YStack>
        )}
      </Column>
    </Page>
  )
}

/** Where a checkout from the setup returns: the rooms' Home, on this origin. */
const home = (): string => `${window.location.origin}${where().home}`

/**
 * THE PLAN: how many seats, billed monthly or annually, then checkout.
 *
 * The prices are the catalog's Team row, never typed: its monthly price per
 * seat, and a year as the catalog states it (`charge`). The seat floor is the
 * row's `minSeats`. Checkout is hanzo.ai/pay's cart (`cartUrl`), charged to this
 * organization and returning Home.
 */
function Plan({
  org,
  members,
  onSwitch,
  outage,
  onRetry,
  seats: wanted = 1,
  setup = false,
}: {
  org: string
  members: string[]
  onSwitch?: () => void
  /** Billing could not be READ. The room still does not open, and the reader is told it is ours to fix. */
  outage?: boolean
  onRetry?: () => void
  /** The seats the setup already knows it needs. */
  seats?: number
  /** Part of creating the team, so it is its third step. */
  setup?: boolean
}) {
  const { plan } = usePlan('team')
  const floor = Math.max(1, Number(plan?.limits?.minSeats ?? 1))
  // The count asked for, held above the floor: the floor arrives with the live
  // catalog row and can rise after the first paint.
  const [asked, setSeats] = useState(wanted)
  const seats = Math.max(floor, asked)
  const [term, setTerm] = useState<Interval>('month')
  const monthly = (plan && charge(plan, 'month')) ?? 0
  const yearly = plan ? charge(plan, 'year') : null
  const each = term === 'year' && yearly ? yearly : monthly
  const terms: [Interval, string, string][] = [
    ['month', 'Monthly', `${money(monthly)} / seat / month`],
    ...(yearly ? [['year', 'Annual', `${money(yearly)} / seat, billed once a year`] as [Interval, string, string]] : []),
  ]
  return (
    <Page label="Choose your plan">
      <Column>
        <Brand />
        {setup ? <Step at={3} of={3} /> : null}
        <Heading
          title={org}
          lead={22.5}
          lede={
            outage
              ? 'Billing could not be read just now, so this team cannot open yet. That is ours to fix.'
              : plan
                ? `A team runs on the ${plan.name} plan, and nothing in it works until that plan is live.`
                : 'Its plan is not live yet.'
          }
        />
        {outage && onRetry ? (
          <XStack mt={16}>
            <Button size="lg" onClick={onRetry}>
              Try again
            </Button>
          </XStack>
        ) : null}
        <Rule />
        {plan ? (
          <>
            <View render="fieldset" display="block" borderWidth={0} p={0} m={0}>
              <Text render="legend" display="block" p={0} fontSize="$4" fontWeight="500" mb={10} color="$ink">
                Seats
              </Text>
              <XStack items="center" gap={10}>
                <Button type="button" size="icon" aria-label="One seat fewer" disabled={seats <= floor} onClick={() => setSeats(Math.max(floor, seats - 1))}>
                  <Minus size={16} aria-hidden />
                </Button>
                <Text
                  render={
                    <input
                      aria-label="Seats"
                      type="number"
                      inputMode="numeric"
                      min={floor}
                      value={seats}
                      onChange={(e) => setSeats(Math.max(floor, Math.floor(Number(e.target.value) || floor)))}
                    />
                  }
                  {...FIELD}
                  width={80}
                  height={36}
                  py={0}
                  fontSize="$4"
                  rounded="$3"
                  text="center"
                />
                <Button type="button" size="icon" aria-label="One seat more" onClick={() => setSeats(seats + 1)}>
                  <Plus size={16} aria-hidden />
                </Button>
              </XStack>
              <Text display="block" fontSize="$3" color="$soft" mt={8}>
                At least {floor} {floor === 1 ? 'seat' : 'seats'}. Each person in the team takes one.
              </Text>
            </View>

            <View render="fieldset" display="block" borderWidth={0} p={0} m={0} mt={24}>
              <Text render="legend" display="block" p={0} fontSize="$4" fontWeight="500" mb={10} color="$ink">
                Billing
              </Text>
              <View display="grid" gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={10}>
                {terms.map(([value, label, price]) => (
                  <XStack
                    key={value}
                    render="label"
                    gap={10}
                    items="flex-start"
                    px={14}
                    py={12}
                    rounded="$3"
                    borderWidth={1}
                    borderColor={term === value ? '$ink' : '$edge'}
                    cursor="pointer"
                  >
                    <input type="radio" name="term" value={value} checked={term === value} onChange={() => setTerm(value)} />
                    <YStack shrink={1}>
                      <Text fontSize="$4" fontWeight="500" color="$ink">
                        {label}
                      </Text>
                      <Text fontSize="$3" color="$soft" mt={2}>
                        {price}
                      </Text>
                    </YStack>
                  </XStack>
                ))}
              </View>
            </View>

            <Text render="p" mt={22} fontSize="$4" color="$soft" lineHeight={23.25}>
              {seats} {seats === 1 ? 'seat' : 'seats'} at {money(each)} a {term} is{' '}
              <Text fontWeight="500" color="$ink">
                {money(seats * each)} a {term}
              </Text>
              . Payment is on the provider&apos;s hosted page.
            </Text>
          </>
        ) : null}

        <XStack gap={10} flexWrap="wrap" mt={24}>
          {plan ? (
            <Button asChild variant="primary" size="lg">
              <a href={cartUrl(plan.id, seats, term, org, home())}>Continue to checkout</a>
            </Button>
          ) : null}
          {members.length > 1 && onSwitch ? (
            <Button size="lg" onClick={onSwitch}>
              Switch organization
            </Button>
          ) : null}
        </XStack>
      </Column>
    </Page>
  )
}
