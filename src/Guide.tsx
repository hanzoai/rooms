'use client'

// The first-run guide: what this place can do, said once, standing next to the
// thing that does it.
//
// WHY COACHMARKS AND NOT A TOUR PAGE. A page of screenshots is read somewhere
// else and remembered nowhere; a card pinned to the actual control is read
// while looking at it, and the next time the reader sees that control they have
// already been introduced. So every step here RESOLVES A LIVE ELEMENT and
// positions against its measured rectangle. Nothing is drawn at a coordinate
// somebody typed.
//
// A STEP WHOSE ANCHOR IS ABSENT IS SKIPPED, not faked. Destinations come and go
// with the org's tier and with what the reader has hidden, so the tour is a
// list of candidates and the ones present at that moment are the tour. That is
// also why anchors are found by what the elements ALREADY carry — their aria
// labels, their roles, their text — rather than by `data-tour` attributes
// sprinkled through six other components: a marker added for a tour is a marker
// somebody deletes while tidying, and the tour breaks silently three months
// later. An accessible name is load-bearing for other reasons and survives.
//
// IT RUNS ONCE, and "once" belongs to the person rather than to the browser.
// Completion is written to the caller's own preference document (`/v1/pref`,
// whose `prefs` is an opaque object each surface keys as it likes), so it
// follows them to a second machine. localStorage is written FIRST and read
// first: it settles instantly, it answers for a reader who never signs in, and
// it keeps the guide from re-opening in the seconds a PATCH is in flight.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Text, View, XStack, YStack, type GuiElement } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { useIam } from '@hanzo/iam/react'
import { useAi } from './lib/ai'
import { Next, Scene } from './Scene'
import { TOURS, type Tour } from './tours'

/** The ring on the spot: design's focus ring and its halo, one above the dim. gui hands a `calc()` to the page
 *  unchanged; its types only name custom properties. */
const RING = '0 0 0 1px var(--ring), 0 0 26px var(--ring-halo)'
const ABOVE = 'calc(var(--z-overlay) + 1)' as `var(--${string})`
/** design's smallest rung (`--text-floor`, 10px), below gui's `$1`; gui's font size takes a rung or a number. */
const FLOOR = 10
/** The page's own leading (design's `--leading-base`, 1.35rem), which a face's scope would otherwise replace with its
 *  20px; gui's line height takes a rung or a number. */
const LEAD = 21.6
/** Where the card's pointer sits, and which two edges it draws, for each side the card can take. */
const POINTER = {
  bottom: { t: -6.5, l: '50%', ml: -5.5, borderLeftWidth: 1, borderTopWidth: 1 },
  top: { b: -6.5, l: '50%', ml: -5.5, borderRightWidth: 1, borderBottomWidth: 1 },
  right: { l: -6.5, t: '50%', mt: -5.5, borderLeftWidth: 1, borderBottomWidth: 1 },
  left: { r: -6.5, t: '50%', mt: -5.5, borderRightWidth: 1, borderTopWidth: 1 },
} as const

/** Where a room's tour is marked seen, in this browser and in the person's preferences. */
const keyOf = (room: Tour) => (room === 'chat' ? 'hanzo:chat:guide' : `hanzo:${room}:guide`)
const prefOf = (room: Tour) => `${room}Guide`

interface Spot { top: number; left: number; width: number; height: number }

const PAD = 8
const GAP = 14
const CARD_W = 352

export function Guide({ room = 'chat' }: { room?: Tour }) {
  const KEY = keyOf(room)
  const PREF = prefOf(room)
  const STOPS = TOURS[room]
  const { client } = useAi()
  // ONLY FOR SOMEONE WHO IS SIGNED IN. `useAi` hands back a client either way —
  // the anonymous one the free composer runs on — so a client is not proof of a
  // reader. Opening for a visitor put a dimmed backdrop over the page before
  // they had an account, and its panels sat on top of the Sign in button: the
  // guide blocked the one action the page was asking for. It also has nothing
  // true to say to a stranger, since half of what it points at is theirs only
  // once they have a workspace.
  const { isAuthenticated, isLoading } = useIam()
  const [live, setLive] = useState(false)
  const [i, setI] = useState(0)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [side, setSide] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom')
  const [card, setCard] = useState<{ top: number; left: number } | null>(null)
  const cardRef = useRef<GuiElement | null>(null)

  // The stops whose anchors exist right now. A destination the org does not
  // carry has no element, so it is not a step — the tour describes THIS
  // workspace rather than a catalogue.
  const stops = useMemo(() => (live ? STOPS.filter((s) => s.find() !== null) : STOPS), [live, STOPS])
  const stop = stops[i]

  const done = useCallback(
    (how: 'finished' | 'skipped' | 'unneeded') => {
      setLive(false)
      const mark = JSON.stringify({ at: new Date().toISOString(), how })
      try {
        localStorage.setItem(KEY, mark)
      } catch {
        /* a browser with storage off still gets the guide once per visit */
      }
      // Follows the person, not the browser. Failure is silent on purpose: the
      // local mark already settled it, and a guide is not worth an error.
      client?.http
        .json({ method: 'PATCH', path: '/v1/pref', body: { prefs: { [PREF]: { at: new Date().toISOString(), how } } } })
        .catch(() => {})
    },
    [client, KEY, PREF],
  )

  // Should it open at all? Local first — it answers instantly and it answers
  // for a reader who never signs in.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    let held = false
    try {
      held = Boolean(localStorage.getItem(KEY))
    } catch {
      /* treat unreadable storage as "not yet shown" */
    }
    if (held) return
    let alive = true
    const open = () => {
      if (!alive) return
      // Wait for the room to actually render before pointing at it.
      const t = window.setTimeout(() => alive && setLive(true), 900)
      return () => window.clearTimeout(t)
    }
    if (!client) return open()
    client.http
      .json<{ prefs?: Record<string, unknown> }>({ path: '/v1/pref' })
      .then((doc) => {
        if (!alive) return
        if (doc?.prefs && doc.prefs[PREF]) {
          try {
            localStorage.setItem(KEY, JSON.stringify(doc.prefs[PREF]))
          } catch {
            /* nothing to do */
          }
          return
        }
        // THE TOUR IS FOR A NEW ACCOUNT. One that has already had a conversation
        // here is not new: it may never have met this tour, and it does not
        // need to. It is marked as such, so the question is not asked again.
        client.threads
          .list()
          .then((had) => {
            if (!alive) return
            if (Array.isArray(had) && had.length > 0) done('unneeded')
            else open()
          })
          .catch(() => open())
      })
      .catch(() => open())
    return () => {
      alive = false
    }
  }, [client, isAuthenticated, isLoading, KEY, PREF, done])

  // Measure the anchor, and re-measure when the page moves under it.
  //
  // NOT on every frame. A rAF loop that calls setSpot each tick re-renders the
  // card sixty times a second, which makes it a target nothing can click: the
  // element under the pointer is replaced between the hit test and the press.
  // Measure on the events that actually move things, and write state only when
  // the rectangle really changed.
  useLayoutEffect(() => {
    if (!live || !stop) return
    let last = ''
    const measure = () => {
      const el = stop.find()
      if (!el) {
        setSpot(null)
        return
      }
      const r = el.getBoundingClientRect()
      const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
      const key = `${Math.round(next.top)}:${Math.round(next.left)}:${Math.round(next.width)}:${Math.round(next.height)}`
      if (key === last) return
      last = key
      setSpot(next)
    }
    // Bring it into view once per step, then measure after the scroll settles.
    stop.find()?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    measure()
    const settle = window.setTimeout(measure, 260)
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    const el = stop.find()
    if (el) ro.observe(el)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(settle)
      ro.disconnect()
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [live, stop, i])

  // Place the card against the measured spot, flipping rather than overflowing.
  useLayoutEffect(() => {
    if (!spot) {
      setCard(null)
      return
    }
    const h = (cardRef.current as HTMLElement | null)?.offsetHeight ?? 168
    const vw = window.innerWidth
    const vh = window.innerHeight
    let want = stop?.side ?? 'bottom'
    if (want === 'bottom' && spot.top + spot.height + GAP + h > vh - 12) want = 'top'
    if (want === 'top' && spot.top - GAP - h < 12) want = 'bottom'
    if (want === 'right' && spot.left + spot.width + GAP + CARD_W > vw - 12) want = 'left'
    if (want === 'left' && spot.left - GAP - CARD_W < 12) want = 'right'

    let top: number
    let left: number
    if (want === 'bottom' || want === 'top') {
      top = want === 'bottom' ? spot.top + spot.height + GAP : spot.top - GAP - h
      left = spot.left + spot.width / 2 - CARD_W / 2
    } else {
      left = want === 'right' ? spot.left + spot.width + GAP : spot.left - GAP - CARD_W
      top = spot.top + spot.height / 2 - h / 2
    }
    setSide(want)
    setCard({ top: Math.max(12, Math.min(top, vh - h - 12)), left: Math.max(12, Math.min(left, vw - CARD_W - 12)) })
  }, [spot, stop])

  const next = useCallback(() => {
    if (i + 1 >= stops.length) done('finished')
    else setI(i + 1)
  }, [i, stops.length, done])
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done('skipped') }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [live, next, back, done])

  if (!live || !stop || !spot || !card || typeof document === 'undefined') return null

  const last = i + 1 >= stops.length
  // The dim is four panels around the spot rather than one box with a hole:
  // a hole wants a mask, and a mask over a blurred backdrop reads as a seam.
  const panel = { position: 'fixed', bg: 'var(--surface-scrim)', z: 'var(--z-overlay)', onClick: () => done('skipped') } as const

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Getting started with Hanzo">
      <View {...panel} t={0} l={0} r={0} height={Math.max(0, spot.top)} />
      <View {...panel} t={spot.top + spot.height} l={0} r={0} b={0} />
      <View {...panel} t={spot.top} l={0} width={Math.max(0, spot.left)} height={spot.height} />
      <View {...panel} t={spot.top} l={spot.left + spot.width} r={0} height={spot.height} />

      {/* The ring, drawn on the live control rather than over a screenshot of it. */}
      <View
        position="fixed"
        t={spot.top}
        l={spot.left}
        width={spot.width}
        height={spot.height}
        rounded={10}
        borderWidth={1}
        borderColor="var(--ring)"
        boxShadow={RING}
        pointerEvents="none"
        z={ABOVE}
      />

      {stop.scene ? (
        <Scene step={`${i + 1} / ${stops.length}`} onNext={next} onSkip={() => done('skipped')} />
      ) : (
      <YStack
        ref={cardRef}
        position="fixed"
        t={card.top}
        l={card.left}
        width={CARD_W}
        z="var(--z-modal)"
        bg="var(--popover)"
        borderWidth={1}
        borderColor="var(--border-control)"
        rounded={12}
        boxShadow="var(--shadow-floating)"
        pt={18}
        px={18}
        pb={15}
      >
        {/* The pointer. One rotated square, borders on the two edges that face out. */}
        <View
          aria-hidden
          position="absolute"
          width={11}
          height={11}
          bg="var(--popover)"
          rotate="45deg"
          borderColor="var(--border-control)"
          {...POINTER[side]}
        />

        {/* Portalled to <body>, outside every font scope: each Text names its face so its rung resolves. */}
        <XStack items="center" gap={8} mb={9}>
          <Text fontFamily="$body" lineHeight={LEAD} fontSize={FLOOR} letterSpacing={1.1} textTransform="uppercase" color="$faint" fontVariant={['tabular-nums']}>
            {i + 1} / {stops.length}
          </Text>
          <View flex={1} height={1} bg="$borderColor" />
          <XStack gap={3}>
            {stops.map((s, n) => (
              <View key={s.id} width={n === i ? 14 : 5} height={5} rounded={3} bg={n <= i ? '$ink' : '$rim'} transition="200ms" />
            ))}
          </XStack>
        </XStack>

        <Text render="h2" fontFamily="$body" mb={7} fontSize="$6" fontWeight="600" lineHeight={22.1} letterSpacing={-0.17} color="$ink">
          {stop.title}
        </Text>
        <Text render="p" fontFamily="$body" mb={16} fontSize="$3" lineHeight={22.4} color="$quiet">
          {stop.body}
        </Text>

        <XStack items="center" gap={8}>
          <Button variant="linkMuted" size="sm" px={2} onClick={() => done('skipped')}>
            Skip
          </Button>
          <View flex={1} />
          {i > 0 ? (
            <Button size="sm" onClick={back}>
              Back
            </Button>
          ) : null}
          <Next onPress={next} label={last ? 'Done' : 'Next'} />
        </XStack>
      </YStack>
      )}
    </div>,
    document.body,
  )
}

/** Let a room's guide be asked for again — a menu row can call this and reload. */
export function replayGuide(room: Tour = 'chat'): void {
  try {
    localStorage.removeItem(keyOf(room))
  } catch {
    /* nothing to clear */
  }
}
