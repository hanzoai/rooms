'use client'

// Agent Speech
//
// Every agent in the Hanzo ecosystem has an assigned voice (`voiceOf(name)` from
// `cast.tsx`), and the platform reads it: `/v1/audio/speech` through
// @hanzo/voice's `speech()` transport and `mouth()`, in that voice. The
// browser's own speechSynthesis reads only when the platform refuses, in a
// voice of the same register and accent, and the refusal is reported rather
// than passed off as the platform's voice.
//
// - The Listen button on a message, the Meet speaker test and its briefing
// - Audio wave visualization during playback
// - Clean cancellation and state management
// - Text normalization (strips code fences, markdown syntax so speech sounds natural)

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Volume2, Square } from 'lucide-react'
import { View, XStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { useIamToken } from '@hanzo/iam/react'
import { mouth, refused, speech, type Mouth, type Refusal } from '@hanzo/voice'
import { GOOD } from './lib/mix'
import { base } from './lib/ai'
import { voiceOf, voiceProfileOf, type VoiceProfile } from './cast'

/** Strips code blocks, links, headers, and markdown markup for natural audio speech. */
export function cleanForSpeech(raw: string): string {
  if (!raw) return ''
  return raw
    // Replace fenced code blocks with brief spoken indicator
    .replace(/```[\s\S]*?```/g, ' [code snippet] ')
    // Replace inline code `code` with code
    .replace(/`([^`]+)`/g, '$1')
    // Replace markdown links [text](url) with text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown headers #, ##, ###
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove bullet points
    .replace(/^[\s]*[-+*]\s+/gm, '')
    // Replace multiple newlines or spaces
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Browser voice names by register, for the stand-in. Word-bounded: "Female" holds "male". */
const REGISTER: Record<VoiceProfile['gender'], RegExp> = {
  female: /\b(female|samantha|victoria|karen|zira|serena|moira|tessa)\b/i,
  male: /\b(male|daniel|alex|fred|david|arthur|oliver)\b/i,
}

/**
 * The browser voice that reads when the platform refuses: English, the cast
 * voice's accent where this browser has it, its register where a name says so.
 * Read per sentence, because the browser loads its voice list asynchronously.
 */
export function standIn({ gender, accent }: VoiceProfile, voices: { name: string; lang: string }[]): string | undefined {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  const local = english.filter((v) => v.lang.toLowerCase().replace('_', '-') === (accent === 'british' ? 'en-gb' : 'en-us'))
  const pick = (list: { name: string }[]) => list.find((v) => REGISTER[gender].test(v.name))
  return (pick(local) ?? pick(english) ?? local[0] ?? english[0] ?? voices[0])?.name
}

/** The reply being read aloud on this page. One at a time: a new one stops the last. */
let active: Mouth | null = null
const activeListeners: Set<() => void> = new Set()

const notify = () => {
  for (const listener of activeListeners) listener()
}

export function stopAgentSpeech(): void {
  const lips = active
  active = null
  lips?.hush()
  notify()
}

export interface SpeakOptions {
  agent?: string
  /** The reader's IAM bearer (`useIamToken`). Without one the platform refuses
   *  and the browser reads, which is reported through `onRefusal`. */
  token?: string | null
  /** Speaking began. Fires at once: the request for the audio is part of it. */
  onStart?: () => void
  /** Speaking stopped, for any reason: played out, stopped, or replaced. */
  onEnd?: () => void
  onError?: (err: unknown) => void
  /** The platform refused, and whether the browser stood in. */
  onRefusal?: (refusal: Refusal) => void
}

/**
 * Speak text in the assigned voice of an agent, through the platform.
 * Returns a cancel function.
 *
 * Call it from the click that asks for it: the player is made inside that
 * gesture, which is what lets Safari play the reply when it arrives.
 */
export function speakAgent(text: string, options: SpeakOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {}

  stopAgentSpeech()

  const clean = cleanForSpeech(text)
  if (!clean) return () => {}

  const profile = voiceProfileOf(options.agent)
  const lips = mouth({
    speech: speech({ ...base(), ...(options.token ? { token: options.token } : {}) }),
    voice: () => standIn(profile, window.speechSynthesis?.getVoices() ?? []),
    refused: options.onRefusal,
  })
  active = lips
  options.onStart?.()

  lips.say(clean, profile.voice).then(
    () => {
      if (active === lips) active = null
      options.onEnd?.()
      notify()
    },
    (err: unknown) => {
      if (active === lips) active = null
      options.onError?.(err)
      notify()
    },
  )

  return () => {
    if (active === lips) stopAgentSpeech()
  }
}

/**
 * Hook for managing agent speech playback in UI components.
 */
export function useAgentSpeech(defaultAgent?: string) {
  const { token } = useIamToken()
  const [speaking, setSpeaking] = useState(false)
  const [currentText, setCurrentText] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const listener = () => {
      setSpeaking(false)
      setCurrentText(null)
    }
    activeListeners.add(listener)
    return () => {
      activeListeners.delete(listener)
      if (cancelRef.current) cancelRef.current()
    }
  }, [])

  const stop = useCallback(() => {
    stopAgentSpeech()
    setSpeaking(false)
    setCurrentText(null)
  }, [])

  const speak = useCallback(
    (text: string, agentName?: string) => {
      stop()
      setCurrentText(text)
      setSpeaking(true)
      setRefusal(null)
      cancelRef.current = speakAgent(text, {
        agent: agentName || defaultAgent,
        token,
        onStart: () => setSpeaking(true),
        onEnd: () => {
          setSpeaking(false)
          setCurrentText(null)
        },
        onError: () => {
          setSpeaking(false)
          setCurrentText(null)
        },
        onRefusal: setRefusal,
      })
    },
    [defaultAgent, stop, token],
  )

  const toggle = useCallback(
    (text: string, agentName?: string) => {
      if (speaking && currentText === text) {
        stop()
      } else {
        speak(text, agentName)
      }
    },
    [speaking, currentText, speak, stop],
  )

  return { speaking, currentText, refusal, speak, stop, toggle }
}

/** The five bars' resting heights, as a share of the 12px the wave stands in. */
const BARS = [0.4, 0.9, 0.6, 1, 0.5]

/**
 * One bar of the wave. It rises and falls between 3px and 13px through the Web
 * Animations API, the same keyframes a stylesheet would hold, so no sheet is
 * written into the page for it; each bar starts 150ms after the one before.
 * A reader who asked for less motion gets the bars standing still.
 */
function Bar({ share, i, active, color }: { share: number; i: number; active: boolean; color: Ink }) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!active || !el?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const run = el.animate([{ height: '3px' }, { height: '13px' }], {
      duration: 800,
      delay: i * 150,
      easing: 'ease-in-out',
      iterations: Infinity,
      direction: 'alternate',
    })
    return () => run.cancel()
  }, [active, i])
  return (
    <View
      ref={ref as never}
      render="span"
      width={2}
      height={active ? Math.round(share * 12) : 4}
      bg={color}
      rounded={1}
    />
  )
}

/** A colour the wave or the button paints with: a design token's custom property. */
type Ink = `var(--${string})`

/**
 * Animated Sound Wave visualizer shown when an agent is speaking.
 */
export function AudioWave({ active = true, color = 'var(--state-success)' }: { active?: boolean; color?: Ink }) {
  return (
    <XStack render="span" aria-hidden display="inline-flex" items="center" gap={2} height={14}>
      {BARS.map((share, i) => (
        <Bar key={i} share={share} i={i} active={active} color={color} />
      ))}
    </XStack>
  )
}

/**
 * SpeakButton: Placed on assistant messages in Chat and Talk channels.
 * Allows one-click audio playback in the agent's voice.
 */
export function SpeakButton({
  text,
  agentName,
  compact = false,
}: {
  text: string
  agentName?: string
  compact?: boolean
}) {
  const { speaking, refusal, toggle } = useAgentSpeech(agentName)
  const voice = voiceOf(agentName)
  // A browser voice standing in for a refused platform sounds like success;
  // the label is the one place that says otherwise.
  const stood = refusal ? ` ${refused(refusal)}` : ''

  // An @hanzo/ui Button: ghost at rest, the quiet pressed ground while it
  // speaks. The word for speaking is the one status here, so it alone takes
  // the success ink (GOOD holds 4.5:1 on either theme); the icons follow the
  // label through currentColor.
  return (
    <Button
      variant={speaking ? 'secondary' : 'ghost'}
      size={compact ? 'icon-sm' : 'sm'}
      color={speaking ? GOOD : '$soft'}
      onClick={() => toggle(text, agentName)}
      aria-label={(speaking ? 'Stop speaking' : `Listen to ${agentName || 'agent'} (${voice})`) + stood}
      aria-pressed={speaking}
      data-refusal={refusal ? refusal.service : undefined}
      title={(speaking ? 'Stop speaking' : `Listen in ${agentName || 'agent'}'s voice (${voice})`) + stood}
    >
      {speaking ? (
        <>
          <AudioWave active={true} color={GOOD} />
          {!compact && 'Speaking…'}
          <Square size={10} fill="currentColor" />
        </>
      ) : (
        <>
          <Volume2 size={13} />
          {!compact && 'Listen'}
        </>
      )}
    </Button>
  )
}
