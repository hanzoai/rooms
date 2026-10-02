'use client'

// The cast: who plays whom, and how they look and sound.
//
// Who a core member IS — their name, their part and what the model is told —
// is written once, in hanzoai/personas, and read here through team.ts; an agent
// an org made says who it is in its own row. This file is the other half, and
// only the other half: a likeness to serve and a voice to read in. An agent row
// carries neither, and it should not: a portrait is a file and a voice is a
// name passed to /v1/audio/speech.
//
// A NAME NOT IN THIS LIST IS NOT A PROBLEM. An agent falls through to a 3D
// Memoji portrait from our palette, so every agent has a distinct likeness;
// a person is never cast and shows their own picture or initials.

import { type ReactNode, useEffect, useState } from 'react'
import { Text, Tooltip, TooltipContent, TooltipTrigger, View, XStack } from '@hanzo/ui'
import { member } from './team'

interface Role {
  /**
   * The likeness, under /public.
   *
   * OPTIONAL, because casting a part and drawing a face are two acts and the
   * second one waits on somebody making a picture. A character with a voice and
   * no portrait is cast — it reads its lines in the voice chosen for it — and
   * wears initials until the likeness exists. The alternative is holding the
   * voice back until the artwork lands, which couples one to the other for no
   * reason.
   */
  portrait?: string
  /**
   * What sits behind it.
   *
   * Five of the seven portraits are cut out with a transparent ground, so about
   * half the disc is whatever is behind them — and on a page that follows the
   * reader's theme that would be white in one and near-black in the other, with
   * a dark suit or white hair disappearing into it. A named colour is the
   * fix, and it is the character's own: the warm brown behind a charcoal suit, the bronze that
   * lifts a black jacket. The two portraits that arrived with a ground keep it
   * and name none.
   */
  ground?: string
  /**
   * The voice the platform reads this character's replies in, by
   * /v1/audio/speech name.
   *
   * ONE VOICE PER CHARACTER, and never two who would be in the same room. The
   * service serves eleven and there are fourteen of them, so three must double
   * up — the question is which three, and the answer is people who work apart:
   * the five the demo puts in one call are all distinct. `echo` was reading for
   * three at once, which in a call is one person doing three parts.
   *
   * CAST, NOT COPIED. These are the speech service's own voices, chosen for fit
   * — a warm animated reader for the physicist, something low and dry for the
   * founder. None of them is anybody's actual voice and none is trying to be:
   * synthesising a real person saying words they never said is a different act
   * from casting a part, and this is the second one.
   */
  voice: string
}

/** The named crew, keyed by the persona's @-handle. */
export const CAST: Record<string, Role> = {
  // The core team first, in the order the crew is drawn (team.ts). Des and Vi's
  // grounds are their own rim light pulled to the register the crew below sits
  // in: both wear black and have dark hair, so on a dark page an ungrounded
  // cut-out is a floating head.
  //
  // Dev wears its own memoji (black ground baked in, so it fills the disc and
  // needs no rim colour); hanzo coder is that same face under the house name.
  dev: { portrait: '/agents/dev.png', voice: 'ash' },
  des: { portrait: '/agents/des.png', ground: '#74569F', voice: 'echo' },
  vi: { portrait: '/agents/vi.png', ground: '#41649F', voice: 'sage' },
  antje: { portrait: '/agents/antje.jpg', voice: 'nova' },
  zach: { portrait: '/agents/zach.jpg', voice: 'onyx' },
  feynman: { portrait: '/agents/feynman.png', ground: '#9C7C4F', voice: 'fable' },
  einstein: { portrait: '/agents/einstein.png', ground: '#7D6450', voice: 'verse' },
  nora: { portrait: '/agents/nora.png', voice: 'shimmer' },
  creative: { portrait: '/agents/creative.png', voice: 'ballad' },
  maya: { portrait: '/agents/maya.png', voice: 'coral' },
  leo: { portrait: '/agents/leo.png', voice: 'alloy' },

  // THE HOUSE AGENTS, UNDER THE NAMES A READER SEES. Every entry above is keyed
  // by the character; these are keyed by the part.
  'hanzo coder': { portrait: '/agents/dev.png', voice: 'ash' },
  'hanzo researcher': { portrait: '/agents/feynman.png', voice: 'fable' },
  'hanzo designer': { portrait: '/agents/des.png', voice: 'echo' },
  'hanzo devops': { voice: 'sage' },
  'hanzo quant': { voice: 'onyx' },
  'hanzo copywriter': { portrait: '/agents/creative.png', voice: 'ballad' },
  'hanzo legal & compliance': { portrait: '/agents/einstein.png', voice: 'verse' },
  'hanzo executive assistant': { portrait: '/agents/maya.png', voice: 'coral' },
  'hanzo architect': { voice: 'verse' },
  'hanzo vision': { voice: 'ballad' },
  'hanzo support': { portrait: '/agents/nora.png', voice: 'shimmer' },
}

/** The role for an agent name, or undefined for one nobody cast. */
export const roleOf = (name: string | undefined): Role | undefined => CAST[name?.toLowerCase() ?? '']

/** A core member's system prompt, as hanzoai/personas writes it, or undefined for anyone else. */
export const speaksOf = (name: string | undefined): string | undefined => member(name)?.instructions

/** Names as a sentence lists them: "Feynman", "Feynman & Einstein", "Feynman, Einstein & Vi". */
export const join = (names: string[]): string =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`

/**
 * The room's system turn.
 *
 * One person's brief rides as it is, under their name. Several ride together:
 * who is in the room, who answers — the ones the user names, or everyone when
 * nobody is named (Chat.tsx `addressed` draws the same rule) — the one rule that
 * lets a reader tell them apart — each contribution opens with a name and a
 * colon — and then each brief under its name. Null for a room with nobody to
 * describe, which is the plain model.
 */
export function brief(cast: { name: string; says: string | null }[]): string | null {
  if (!cast.length || cast.every((one) => !one.says)) return null
  if (cast.length === 1) {
    const [one] = cast
    return /^you are\b/i.test(one.says!) ? one.says : `You are ${one.name}. ${one.says}`
  }
  const names = cast.map((one) => one.name)
  return [
    `There are ${cast.length} of you in this room with the user: ${join(names)}. When the user names some of you, those of you answer, each in turn; when the user names nobody, each of you answers. Each of you answers as yourself, in your own voice. Begin each contribution on its own line with your name and a colon, as in "${names[0]}: ...". Never write the user's lines. Who each of you is follows, one section per name.`,
    ...cast.map((one) => `## ${one.name}\n\n${one.says ?? `${one.name} answers as ${one.name}.`}`),
  ].join('\n\n')
}

/** The first line of a room's system turn: who is in the conversation, by name. */
const ROSTER = 'Agents in this conversation: '

/**
 * The line a conversation records to say who is in it. The thread keeps it as a
 * system turn, so reopening the thread anywhere seats the same room. Names are
 * the agents' handles, which carry no comma (the agents API's name pattern).
 */
export const roster = (names: string[]): string => `${ROSTER}${names.length ? names.join(', ') : 'none'}`

/** The names a recorded roster line holds, or null for a turn that is not one. */
export function rosterOf(content: string): string[] | null {
  const line = content.split('\n', 1)[0]
  if (!line.startsWith(ROSTER)) return null
  const names = line.slice(ROSTER.length).trim()
  return names === 'none' ? [] : names.split(',').map((one) => one.trim()).filter(Boolean)
}

/**
 * The system turn a room sends: the roster line, then the brief. Null for an
 * empty room, which is the plain model.
 */
export function roomTurn(names: string[], said: string | null): string | null {
  if (!names.length) return null
  return said ? `${roster(names)}\n\n${said}` : roster(names)
}

/**
 * A room's reply, split by who said what.
 *
 * A line that opens with a member's name and a colon — plain or bold — starts
 * that member's part; lines before any such line belong to nobody, and a reply
 * that names nobody is one part with no name on it. Inside a code fence a line
 * is code, never a byline: `dev: next dev` in a YAML block stays in the block.
 */
export function speakers(text: string, names: string[]): { who: string | null; text: string }[] {
  const known = new Map(names.map((one) => [one.toLowerCase(), one]))
  const out: { who: string | null; text: string }[] = []
  let fenced = false
  for (const line of text.split('\n')) {
    const fence = /^\s*(```|~~~)/.test(line)
    const m = fenced || fence ? null : /^\s*(?:\*\*|__)?([^:\n*_]{1,40}?)(?:\*\*|__)?\s*:\s?(.*)$/.exec(line)
    if (fence) fenced = !fenced
    const who = m ? known.get(m[1].trim().toLowerCase()) : undefined
    if (who && m) {
      out.push({ who, text: m[2] })
      continue
    }
    if (!out.length) out.push({ who: null, text: line })
    else out[out.length - 1].text += '\n' + line
  }
  return out.map((one) => ({ ...one, text: one.text.trim() })).filter((one) => one.text || one.who)
}

export const VOICES = [
  'ash',
  'echo',
  'sage',
  'nova',
  'onyx',
  'fable',
  'shimmer',
  'alloy',
  'verse',
  'ballad',
  'coral',
]

export function fallbackVoice(name: string | undefined): string {
  if (!name) return VOICES[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return VOICES[Math.abs(hash) % VOICES.length]
}

/** The voice to read a character's replies in. Always returns a valid voice. */
export const voiceOf = (name: string | undefined): string => roleOf(name)?.voice || fallbackVoice(name)

export interface VoiceProfile {
  voice: string
  pitch: number
  rate: number
  description: string
  gender: 'male' | 'female' | 'neutral'
}

export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  ash: { voice: 'ash', pitch: 1.0, rate: 1.0, description: 'Clear, direct, technical', gender: 'male' },
  echo: { voice: 'echo', pitch: 1.1, rate: 1.05, description: 'Adaptive, creative, resonant', gender: 'female' },
  sage: { voice: 'sage', pitch: 0.95, rate: 1.05, description: 'Authoritative, calm, systems-minded', gender: 'male' },
  nova: { voice: 'nova', pitch: 1.1, rate: 1.0, description: 'Energetic, articulate, engaging', gender: 'female' },
  onyx: { voice: 'onyx', pitch: 0.85, rate: 1.0, description: 'Deep, measured, quantitative', gender: 'male' },
  fable: { voice: 'fable', pitch: 1.05, rate: 1.12, description: 'Warm, enthusiastic, pedagogical', gender: 'male' },
  shimmer: { voice: 'shimmer', pitch: 1.1, rate: 0.98, description: 'Precise, professional, clear', gender: 'female' },
  alloy: { voice: 'alloy', pitch: 0.95, rate: 1.05, description: 'Visionary, forward-leaning, focused', gender: 'male' },
  verse: { voice: 'verse', pitch: 0.9, rate: 0.95, description: 'Intentional, iconic, design-first', gender: 'male' },
  ballad: { voice: 'ballad', pitch: 0.92, rate: 1.0, description: 'Thoughtful, deep, expansive', gender: 'male' },
  coral: { voice: 'coral', pitch: 1.15, rate: 1.05, description: 'Friendly, supportive, organized', gender: 'female' },
}

export function voiceProfileOf(name: string | undefined): VoiceProfile {
  const v = voiceOf(name)
  return VOICE_PROFILES[v] || VOICE_PROFILES.ash
}


/** Initials, for anyone with no likeness. Two at most: a disc this size holds
 *  two letters and turns three into a smudge. */
function initialsOf(name: string | undefined): string {
  // A NAME IS NOT GUARANTEED. This draws a signed-in reader before their profile
  // has arrived — `user` is a userinfo response, and a surface that renders on
  // the credential renders before that response lands — so the one thing a face
  // must never do is throw when it has nothing to spell. '?' is already what
  // this returns for a name it cannot reduce; absent is that case, earlier.
  return (
    (name ?? '')
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

const MEMOJIS = [
  '/agents/leo.png',
  '/agents/des.png',
  '/agents/vi.png',
  '/agents/creative.png',
  '/agents/maya.png',
  '/agents/nora.png',
  '/agents/einstein.png',
]

export function fallbackMemoji(name: string | undefined): string {
  if (!name) return MEMOJIS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return MEMOJIS[Math.abs(hash) % MEMOJIS.length]
}

/**
 * One character's disc — the likeness where there is one, initials where there
 * is not.
 *
 * It was private to the roster and drew initials only, so an agent looked the
 * same in the column, the sidebar and everywhere else: like nobody. One face,
 * every caller, one size prop — because the sidebar's row and the roster's
 * column want the same picture at two sizes, not two pictures.
 */
export function Face({
  src,
  emoji,
  name,
  title,
  size = 32,
  person = false,
}: {
  /**
   * A picture this subject SAVED, which outranks the cast.
   *
   * A person who uploads a photograph has answered the question this file
   * otherwise answers for them, and a character nobody cast has no likeness to
   * lose. So the order is: what they chose, then what we cast, then initials —
   * and it is stated here because it is the same order in the sidebar, the
   * roster and the bar, which is why they all call this.
   */
  src?: string
  /**
   * One glyph the subject picked instead of a picture.
   *
   * The platform stores at most one of avatar and emoji — `iam/pkg/schema`
   * decides that at the write, precisely so no screen has to rank them — and
   * both are the subject's OWN answer, so both come before ours.
   */
  emoji?: string
  /** Absent while a signed-in reader's profile is still on the wire. */
  name?: string
  title?: string
  size?: number
  /**
   * A person, not an agent: never cast. A person with no saved picture shows
   * initials; a memoji is theirs only once they make one for their profile.
   */
  person?: boolean
}) {
  const role = person ? undefined : roleOf(name)
  const cast = person ? undefined : role?.portrait || fallbackMemoji(name)
  const [imgSrc, setImgSrc] = useState<string | undefined>(src || (emoji ? undefined : cast))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setImgSrc(src || (emoji ? undefined : cast))
    setFailed(false)
  }, [src, emoji, cast])

  const handleError = () => {
    if (failed) return
    setFailed(true)
    if (person) {
      setImgSrc(undefined)
      return
    }
    const fallback = fallbackMemoji(name)
    if (imgSrc !== fallback) {
      setImgSrc(fallback)
    } else if (imgSrc !== MEMOJIS[0]) {
      setImgSrc(MEMOJIS[0])
    }
  }

  const likeness = emoji ? undefined : imgSrc
  const label = title || name

  // A portrait's own ground is content, a hex the cast states; gui's colour types name only custom properties.
  const ground = ((src ? undefined : role?.ground) || 'transparent') as `var(--${string})`
  const disc = (
    <XStack
      width={size}
      height={size}
      rounded={size / 2}
      overflow="hidden"
      borderWidth={likeness || role?.ground ? 0 : 1}
      borderColor="var(--border)"
      items="center"
      justify="center"
      bg={ground}
      aria-label={title ? label : undefined}
      aria-hidden={title ? undefined : true}
    >
      {emoji ? (
        <Text fontSize={Math.round(size * 0.55)} lineHeight={size}>
          {emoji}
        </Text>
      ) : likeness ? (
        /* A plain img: a portrait is one fixed square asset served from this
           origin and a saved picture is an inline data URL. If loading fails,
           handleError seamlessly falls back to a guaranteed 3D Memoji asset. */
        <View
          render={<img src={likeness} alt="" width={size} height={size} onError={handleError} />}
          width={size}
          height={size}
          objectFit="cover"
          display="block"
        />
      ) : (
        <Text fontSize="$1" color={role?.ground ? 'var(--pure-white)' : '$soft'}>
          {initialsOf(name)}
        </Text>
      )}
    </XStack>
  )

  return title ? (
    <Tooltip>
      <TooltipTrigger>{disc}</TooltipTrigger>
      <TooltipContent>
        <Text fontSize="$2">{title}</Text>
      </TooltipContent>
    </Tooltip>
  ) : (
    (disc as ReactNode)
  )
}
