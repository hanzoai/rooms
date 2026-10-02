'use client'

// Agent Speech & Voice Synthesis
//
// Every agent in the Hanzo ecosystem has an assigned voice (`voiceOf(name)` from
// `cast.tsx`). This module provides speech synthesis for agents across Chat,
// Talk channels, and Meet video calls:
// - Direct browser SpeechSynthesis with agent-tailored pitch, rate, and voice matching
// - Audio wave visualization during playback
// - Clean cancellation and state management
// - Text normalization (strips code fences, markdown syntax so speech sounds natural)

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Volume2, Square } from 'lucide-react'
import { View, XStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { GOOD } from './lib/mix'
import { voiceOf, voiceProfileOf } from './cast'

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

/** Currently active speech synthesis utterance tracker. */
let activeUtterance: SpeechSynthesisUtterance | null = null
const activeListeners: Set<() => void> = new Set()

export function stopAgentSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {}
  }
  activeUtterance = null
  for (const notify of activeListeners) {
    notify()
  }
}

export interface SpeakOptions {
  agent?: string
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: unknown) => void
}

/**
 * Speak text in the assigned voice of an agent.
 * Returns a cancel function.
 */
export function speakAgent(text: string, options: SpeakOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {}

  stopAgentSpeech()

  const clean = cleanForSpeech(text)
  if (!clean) return () => {}

  if (!('speechSynthesis' in window)) {
    options.onError?.(new Error('SpeechSynthesis not supported in this browser'))
    return () => {}
  }

  const profile = voiceProfileOf(options.agent)
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.pitch = profile.pitch
  utterance.rate = profile.rate

  // Attempt to select best matching system voice based on gender / voice tone
  try {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      const isFemale = profile.gender === 'female'
      const candidate = voices.find((v) => {
        const name = v.name.toLowerCase()
        const lang = v.lang.toLowerCase()
        if (!lang.startsWith('en')) return false
        if (isFemale) {
          return name.includes('female') || name.includes('samantha') || name.includes('victoria') || name.includes('karen') || name.includes('zira')
        } else {
          return name.includes('male') || name.includes('daniel') || name.includes('alex') || name.includes('fred') || name.includes('david')
        }
      }) || voices.find((v) => v.lang.toLowerCase().startsWith('en')) || voices[0]

      if (candidate) {
        utterance.voice = candidate
      }
    }
  } catch {}

  utterance.onstart = () => {
    activeUtterance = utterance
    options.onStart?.()
  }

  utterance.onend = () => {
    if (activeUtterance === utterance) {
      activeUtterance = null
    }
    options.onEnd?.()
    for (const notify of activeListeners) {
      notify()
    }
  }

  utterance.onerror = (e) => {
    if (activeUtterance === utterance) {
      activeUtterance = null
    }
    options.onError?.(e)
    for (const notify of activeListeners) {
      notify()
    }
  }

  try {
    window.speechSynthesis.speak(utterance)
  } catch (err) {
    options.onError?.(err)
  }

  return () => {
    if (activeUtterance === utterance) {
      stopAgentSpeech()
    }
  }
}

/**
 * Hook for managing agent speech playback in UI components.
 */
export function useAgentSpeech(defaultAgent?: string) {
  const [speaking, setSpeaking] = useState(false)
  const [currentText, setCurrentText] = useState<string | null>(null)
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
      cancelRef.current = speakAgent(text, {
        agent: agentName || defaultAgent,
        onStart: () => setSpeaking(true),
        onEnd: () => {
          setSpeaking(false)
          setCurrentText(null)
        },
        onError: () => {
          setSpeaking(false)
          setCurrentText(null)
        },
      })
    },
    [defaultAgent, stop],
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

  return { speaking, currentText, speak, stop, toggle }
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
  const { speaking, toggle } = useAgentSpeech(agentName)
  const voice = voiceOf(agentName)

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
      aria-label={speaking ? 'Stop speaking' : `Listen to ${agentName || 'agent'} (${voice})`}
      aria-pressed={speaking}
      title={speaking ? 'Stop speaking' : `Listen in ${agentName || 'agent'}'s voice (${voice})`}
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
