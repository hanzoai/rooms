'use client'

// The scene: one chat, the team brought in, and the call it turns into — played
// rather than read. It is drawn on a stage of its own, so nothing typed here
// reaches the composer, and nothing said here is sent or saved.

import { useEffect, useRef, useState } from 'react'
import { Text, View, XStack, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { CAST as CREW } from './cast'

type Who = 'you' | 'des' | 'vi' | 'alex'
/** A face's disc: a design token, or the hex a cast portrait was cut against. */
type Ground = `var(--${string})` | `#${string}`
const CAST: Record<Who, { name: string; part: string; face?: string; initial: string; ground: Ground }> = {
  you: { name: 'You', part: 'Owner', initial: 'Y', ground: 'var(--neutral-700)' },
  des: { name: 'Des', part: 'Designer', face: '/agents/des.png', initial: 'D', ground: CREW.des.ground as Ground },
  vi: { name: 'Vi', part: 'Visionary', face: '/agents/vi.png', initial: 'V', ground: CREW.vi.ground as Ground },
  alex: { name: 'Alex', part: 'Teammate', initial: 'A', ground: 'var(--neutral-600)' },
}

/** The tour's own prompt: typed for show, never sent. */
const SAMPLE = 'Help me plan the next version of our app'
const ADDED: Who[] = ['des', 'vi', 'alex']
const CHAT: { who: Who; text: string }[] = [
  { who: 'you', text: 'We need to create a more immersive experience.' },
  { who: 'vi', text: 'Should we create UI for wearable glasses?' },
  { who: 'des', text: 'I love this idea. We could explore the best settings in Roblox and other top games and create some of the best ideas!' },
  { who: 'alex', text: "What a great idea, let's jump on a call now so we can plan and create deliverables and due dates." },
]
const CALL: { who: Who; text: string }[] = [
  { who: 'alex', text: "Let's plan it. Vi, you own the concept. Des, the first mockups. I'll set the deliverables and due dates." },
  { who: 'vi', text: 'First deliverable: a glasses-ready layout, due Friday.' },
  { who: 'des', text: "I'll pull references from the top Roblox worlds and draft three directions, due Wednesday." },
  { who: 'you', text: 'Perfect. Save the transcript and put the deliverables on the Board.' },
]

// The beats, in order: the prompt, three people added, four lines of chat, the
// move to a call, four lines said on it, and the record of it.
const PROMPT = 0
const ADD = 1 // .. 3
const TALK = 4 // .. 7
const RING = 8
const SAY = 9 // .. 12
const SAVED = 13

const MS = 26

/** Text revealed a character at a time; says when it is all there. */
function Typed({ text, go, onDone }: { text: string; go: boolean; onDone: () => void }) {
  const [n, setN] = useState(go ? 0 : text.length)
  useEffect(() => {
    if (!go) return
    if (n >= text.length) {
      const t = window.setTimeout(onDone, 520)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setN((k) => k + 1), MS)
    return () => window.clearTimeout(t)
  }, [go, n, text, onDone])
  return <>{text.slice(0, n)}</>
}

function Face({ who, size = 28 }: { who: Who; size?: number }) {
  const c = CAST[who]
  return (
    <View
      render="span"
      aria-hidden
      width={size}
      height={size}
      rounded={9999}
      bg={c.ground}
      display="inline-flex"
      items="center"
      justify="center"
      overflow="hidden"
      shrink={0}
    >
      {c.face ? (
        <img src={c.face} alt="" width={size} height={size} />
      ) : (
        <Text fontFamily="$body" fontSize={size * 0.42} fontWeight="600" color="var(--pure-white)">
          {c.initial}
        </Text>
      )}
    </View>
  )
}

const ink = '$ink'
const dim = '$soft'
const line = '$borderColor'

// The stage is portalled to <body> by the Guide, outside every font scope gui
// writes, so a `$N` size or leading resolves only on a Text that names `$body`
// itself — which is why every Text below does.

/** A line of the scene's own type: the base rung on its own leading. */
const SAID = { fontSize: '$3', lineHeight: '$3' } as const

export function Scene({ step, onNext, onSkip }: { step: string; onNext: () => void; onSkip: () => void }) {
  const [beat, setBeat] = useState(PROMPT)
  const [typed, setTyped] = useState(0)
  const advance = () => setBeat((b) => Math.min(b + 1, SAVED))
  const settle = () => setTyped((k) => k + 1)

  // Beats that type advance themselves when the typing is done; the ones that
  // only appear advance on a short pause.
  useEffect(() => {
    const typing = beat === PROMPT || (beat >= TALK && beat < RING) || (beat >= SAY && beat < SAVED)
    if (typing) return
    if (beat === SAVED) return
    const t = window.setTimeout(advance, beat === RING ? 1400 : 900)
    return () => window.clearTimeout(t)
  }, [beat])
  useEffect(() => {
    if (typed === 0) return
    advance()
  }, [typed])

  const added = ADDED.slice(0, Math.max(0, Math.min(ADDED.length, beat - ADD + 1)))
  const said = CHAT.slice(0, Math.max(0, Math.min(CHAT.length, beat - TALK + 1)))
  const onCall = beat >= RING
  const spoken = CALL.slice(0, Math.max(0, Math.min(CALL.length, beat - SAY + 1)))
  const speaker = onCall && beat >= SAY && beat < SAVED ? CALL[beat - SAY].who : null

  return (
    <YStack
      role="group"
      aria-label="A chat that becomes a call"
      position="fixed"
      l="50%"
      t="50%"
      x="-50%"
      y="-50%"
      width="min(720px, calc(100vw - 32px))"
      maxH="calc(100vh - 32px)"
      overflowY="auto"
      z="var(--z-modal)"
      bg="var(--popover)"
      borderWidth={1}
      borderColor="var(--border-control)"
      rounded={14}
      boxShadow="var(--shadow-floating)"
      p={18}
    >
      <XStack items="center" gap={10} mb={12}>
        <Text fontFamily="$body" fontSize={10} letterSpacing={1.1} textTransform="uppercase" color="$faint">
          {step}
        </Text>
        <View flex={1} height={1} bg={line} />
        <Text fontFamily="$body" fontSize="$2" color={dim}>
          {onCall ? 'On a call' : 'In chat'}
        </Text>
      </XStack>
      <Text fontFamily="$body" render="h2" mb={4} fontSize="$6" fontWeight="600" lineHeight="$4" color={ink}>
        More than chat
      </Text>
      <Text fontFamily="$body" render="p" mb={14} {...SAID} color="$quiet">
        Start with a bot, bring in the team, and take it to a call. Nothing here is sent or saved.
      </Text>

      {!onCall ? (
        <YStack borderWidth={1} borderColor={line} rounded={12} overflow="hidden">
          <XStack items="center" gap={10} px={12} py={10} borderBottomWidth={1} borderColor={line}>
            <Face who="des" />
            <YStack>
              <Text fontFamily="$body" fontSize="$3" fontWeight="600" lineHeight="$1" color={ink}>
                des
              </Text>
              <Text fontFamily="$body" fontSize="$2" lineHeight="$1" color={dim}>
                Designer · bot
              </Text>
            </YStack>
            <View flex={1} />
            <XStack gap={6} flexWrap="wrap" justify="flex-end">
              {added.map((w) => (
                <XStack key={w} items="center" gap={6} pl={4} pr={8} py={3} rounded={999} borderWidth={1} borderColor={line}>
                  <Face who={w} size={18} />
                  <Text fontFamily="$body" fontSize="$2" color={ink}>
                    {CAST[w].name}
                  </Text>
                  <Text fontFamily="$body" fontSize="$2" color={dim}>
                    · {CAST[w].part}
                  </Text>
                </XStack>
              ))}
              {beat >= ADD && beat < TALK ? (
                <Text fontFamily="$body" px={8} py={3} rounded={999} borderWidth={1} borderStyle="dashed" borderColor={line} fontSize="$2" color={dim}>
                  + Add to chat
                </Text>
              ) : null}
            </XStack>
          </XStack>
          <View display="grid" p={12} gap={10} minH={168}>
            {said.map((m, k) => (
              <XStack key={k} gap={10} items="flex-start" flexDirection={m.who === 'you' ? 'row-reverse' : 'row'}>
                <Face who={m.who} />
                <YStack maxW="78%" px={12} py={8} rounded={12} bg={m.who === 'you' ? 'var(--foreground)' : '$hover'}>
                  {m.who !== 'you' ? (
                    <Text fontFamily="$body" fontSize="$1" color={dim} mb={2}>
                      {CAST[m.who].name}
                    </Text>
                  ) : null}
                  <Text fontFamily="$body" {...SAID} color={m.who === 'you' ? 'var(--background)' : ink}>
                    <Typed text={m.text} go={k === said.length - 1 && beat < RING} onDone={settle} />
                  </Text>
                </YStack>
              </XStack>
            ))}
            {said.length === 0 ? (
              <Text fontFamily="$body" fontSize="$2" color={dim} text="center" pt={48}>
                {beat < ADD ? 'A chat with des, your designer bot.' : 'Bringing the team in…'}
              </Text>
            ) : null}
          </View>
          <Text fontFamily="$body" m={12} px={12} py={10} rounded={10} borderWidth={1} borderColor={line} {...SAID} color={beat === PROMPT ? ink : dim} minH={40}>
            {beat === PROMPT ? <Typed text={SAMPLE} go onDone={settle} /> : beat < TALK ? SAMPLE : 'Ask anything'}
            <View render="span" aria-hidden display={beat === PROMPT ? 'inline-flex' : 'none'} width={1} height={14} bg={ink} ml={1} y={2} />
          </Text>
        </YStack>
      ) : (
        <YStack borderWidth={1} borderColor={line} rounded={12} overflow="hidden">
          <View display="grid" gridTemplateColumns="repeat(4, 1fr)" gap={8} p={12} borderBottomWidth={1} borderColor={line}>
            {(['you', 'des', 'vi', 'alex'] as Who[]).map((w) => (
              <YStack
                key={w}
                items="center"
                gap={6}
                px={6}
                py={12}
                rounded={10}
                bg="$hover"
                outlineWidth={2}
                outlineStyle="solid"
                outlineColor={speaker === w ? ink : 'transparent'}
                transition="200ms"
              >
                <Face who={w} size={40} />
                <Text fontFamily="$body" fontSize="$2" color={ink}>
                  {CAST[w].name}
                </Text>
              </YStack>
            ))}
          </View>
          <YStack p={12} minH={168}>
            <Text fontFamily="$body" fontSize="$1" letterSpacing={1.1} textTransform="uppercase" color={dim} mb={8}>
              {beat === RING ? 'Calling…' : 'Live transcript'}
            </Text>
            <View display="grid" gap={8}>
              {spoken.map((m, k) => (
                <XStack key={k} gap={8}>
                  <Text fontFamily="$body" {...SAID} color={dim} shrink={0} width={44}>
                    {CAST[m.who].name}
                  </Text>
                  <Text fontFamily="$body" {...SAID} color={ink}>
                    <Typed text={m.text} go={k === spoken.length - 1 && beat < SAVED} onDone={settle} />
                  </Text>
                </XStack>
              ))}
            </View>
            {beat === SAVED ? (
              <Text fontFamily="$body" mt={14} px={10} py={8} rounded={8} borderWidth={1} borderColor={line} fontSize="$2" color={ink}>
                ✓ Transcript saved · Deliverables and due dates on the Board
              </Text>
            ) : null}
          </YStack>
        </YStack>
      )}

      <XStack items="center" gap={8} mt={14}>
        <Button variant="linkMuted" size="sm" px={2} onClick={onSkip}>
          Skip
        </Button>
        <View flex={1} />
        {beat === SAVED ? (
          <Button
            size="sm"
            onClick={() => {
              setTyped(0)
              setBeat(PROMPT)
            }}
          >
            Replay
          </Button>
        ) : null}
        <Next onPress={onNext} />
      </XStack>
    </YStack>
  )
}

/** A stop's one primary control, the scene's and the card's. It takes focus when the stop opens, which is what
 *  `autoFocus` did on the element it replaced; a stop that only relabels it (Next to Done) keeps the focus it has.
 */
export function Next({ onPress, label = 'Next' }: { onPress: () => void; label?: string }) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <Button ref={ref as never} variant="primary" size="sm" onClick={onPress}>
      {label}
    </Button>
  )
}
