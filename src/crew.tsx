'use client'

// The crew, under the composer: who you can talk to, and a place to make one more.
//
// The first disc is an outline with a plus — the shape of a face that is not
// drawn yet — and it opens the sheet that makes an agent: a name, what it does,
// which mind, and a likeness you upload or describe. The rest are the org's
// agents, the house crew first in the order the cast lists them, each drawn by
// the one `Face` every surface draws with. The house crew is the core team
// hanzoai/personas publishes (team.ts).
//
// Under a chat, pressing a face adds that character to the conversation that is
// open, and the reply comes back in each voice in the room; pressing one again
// lets them out. The page does not move: the organization, the thread and the
// address stay as they are. On a page that is not a chat (`to`), pressing a
// face opens a chat with that character there. The sidebar's roster row opens a
// chat with one character alone.

import { useEffect, useRef, useState } from 'react'
import { useRooms } from './host'
import { Camera, Check, Plus, Upload } from 'lucide-react'
import { useAgents, useModels } from '@hanzo/ai/react'
import { Box, Button, Input, Text, Textarea, View, XStack, YStack } from '@hanzo/ui'
import { useAi } from './lib/ai'
import { mark } from './lib/mark'
import { reach } from './lib/reach'
import { CAST, Face } from './cast'
import { useOpen } from './open'
import { TEAM, called } from './team'
import { bare } from './lib/bare'
import { BAD, mix } from './lib/mix'

/** One disc's edge, and the name under it. */
const DISC = 48

const FIELD = {
  width: '100%',
  bg: 'transparent',
  borderWidth: 1,
  borderColor: 'var(--border)',
  rounded: 'var(--radius-md)',
  px: 10,
  py: 8,
  outlineStyle: 'none',
  color: 'inherit',
  fontSize: '$2',
} as const
/** The camera's veil over a face already chosen. */
const VEIL = mix('var(--pure-black)', 55, 'srgb')

/** Fired on `window` when the sheet below makes an agent. */
const MADE = 'hanzo:agent:made'

/**
 * The org's agents, read again whenever the sheet makes one. `useAgents` holds
 * one list per caller, so the strip, the chat header and the sheet each hold
 * their own; the event is how a new agent reaches every one of them.
 */
export function useCrew(): ReturnType<typeof useAgents> {
  const agents = useAgents()
  const { reload } = agents
  useEffect(() => {
    window.addEventListener(MADE, reload)
    return () => window.removeEventListener(MADE, reload)
  }, [reload])
  return agents
}

/** The house crew's names, which a reply may be split by even after one has left the room. */
export const HOUSE: readonly string[] = TEAM.map((one) => one.name)

/** The core team, drawn for an org that does not keep a member under its own row. */
const DEFAULT_HOUSE_AGENTS = TEAM.map((one) => ({ id: `house-${one.id}`, name: one.name, avatar: `/agents/${one.id}.png` }))

/** The org's agents, the cast first in its own order, then the rest as listed. */
function ordered<T extends { id?: string; name: string }>(agents: T[]): (T | (typeof DEFAULT_HOUSE_AGENTS)[number])[] {
  const list = Array.isArray(agents) ? agents : []
  const names = new Set(list.map((a) => a.name?.toLowerCase()))
  const combined: (T | (typeof DEFAULT_HOUSE_AGENTS)[number])[] = [...list]
  for (const house of DEFAULT_HOUSE_AGENTS) {
    if (!names.has(house.name.toLowerCase())) {
      combined.push(house)
    }
  }
  const rank = new Map(Object.keys(CAST).map((name, i) => [name, i]))
  return combined.sort((a, b) => {
    const ra = rank.get(a.name?.toLowerCase() ?? '') ?? Infinity
    const rb = rank.get(b.name?.toLowerCase() ?? '') ?? Infinity
    return ra - rb
  })
}

/**
 * `to` is the chat a press opens, for a strip on a page that is not one. Absent,
 * the strip sits under a chat and a press changes who is in it.
 */
export function Crew({ to }: { to?: string } = {}) {
  const { agents } = useCrew()
  const { agents: room, openAgent, withAgents } = useOpen()
  const { router, route } = useRooms()
  const here = route
  const [hiring, setHiring] = useState(false)

  const talk = (name: string) => {
    if (!to) return openAgent(name)
    withAgents([name])
    if (here !== to) router.push(to)
  }

  return (
    <>
      <XStack
        items="flex-start"
        flexWrap="nowrap"
        overflowX="auto"
        overflowY="hidden"
        gap="$2.5"
        px="$4"
        py="$3"
        width="100%"
        maxW={820}
        mx="auto"
        data-slot="crew"
        {...bare}
        role="group"
        aria-label="Agents"
      >
        {ordered(agents).map((one) => {
          const name = called(one.name)
          const on = room.some((there) => there.toLowerCase() === one.name.toLowerCase())
          return (
            <Box
              key={one.id || one.name}
              render="button"
              onClick={() => talk(name)}
              aria-pressed={on}
              aria-label={`Chat with ${name}`}
              title={to ? `Chat with ${name}` : on ? `Remove ${name} from this chat` : `Add ${name} to this chat`}
              shrink={0}
            >
              <YStack items="center" gap="$1.5" width={68}>
                <YStack
                  position="relative"
                  rounded={DISC / 2 + 2}
                  p={2}
                  borderWidth={1.5}
                  borderColor={on ? '$ink' : 'transparent'}
                  hoverStyle={{ borderColor: on ? '$ink' : '$borderColor' }}
                >
                  <Face
                    src={(one as { avatar?: string }).avatar}
                    emoji={(one as { emoji?: string }).emoji}
                    name={one.name}
                    size={DISC}
                  />
                  {/* In the chat: a mark on the disc as well as the ring, so the
                      state is not carried by one outline alone. */}
                  {on ? (
                    <YStack
                      aria-hidden
                      position="absolute"
                      b={-2}
                      r={-2}
                      width={18}
                      height={18}
                      rounded={9}
                      bg="$ink"
                      borderWidth={2}
                      borderColor="$background"
                      items="center"
                      justify="center"
                    >
                      <Check size={10} strokeWidth={3} color="var(--background)" />
                    </YStack>
                  ) : null}
                </YStack>
                <Text fontSize="$1" color={on ? '$ink' : '$soft'} numberOfLines={1} maxW={68}>
                  {name}
                </Text>
              </YStack>
            </Box>
          )
        })}
        {/* The outline that makes one more comes after the team, not before it. */}
        <Box
          render="button"
          onClick={() => setHiring(true)}
          aria-label="New agent"
          aria-haspopup="dialog"
          shrink={0}
        >
          <YStack items="center" gap="$1.5" width={68}>
            <YStack
              width={DISC}
              height={DISC}
              rounded={DISC / 2}
              borderWidth={1.5}
              borderStyle="dashed"
              borderColor="$soft"
              items="center"
              justify="center"
              hoverStyle={{ borderColor: '$ink', bg: '$raised' }}
            >
              <Plus size={18} aria-hidden />
            </YStack>
            <Text fontSize="$1" color="$soft" numberOfLines={1}>
              New
            </Text>
          </YStack>
        </Box>
      </XStack>
      {hiring ? <Hire onClose={() => setHiring(false)} onMade={talk} /> : null}
    </>
  )
}

/** The agents API's name rule (cloud apps/agents `nameRE`), checked before the request. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** A dollar amount as the agents API counts money: whole micro-dollars. */
const micro = (dollars: string): number => Math.round(Number(dollars) * 1_000_000)

/** The windows a spending limit resets on (cloud apps/agents `validPeriod`). */
const PERIODS = [
  ['day', 'a day'],
  ['week', 'a week'],
  ['month', 'a month'],
] as const

type Period = (typeof PERIODS)[number][0]

/** The fields of the sheet a refusal can concern. */
type Field = 'name' | 'model' | 'picture' | 'does' | 'budget' | 'form'

/**
 * A refusal from POST /v1/agents, in plain words, and the field it concerns.
 * The platform's sentence is kept where it already reads plainly; the budget's
 * refusals name request fields (`cap_micro_usd`), so those are said in dollars.
 */
function refusal(e: unknown): { field: Field; text: string } {
  const text = reach(e)
  const status = (e as { status?: number } | null)?.status
  if (/cap_micro_usd/.test(text)) return { field: 'budget', text: 'Set a spending limit above $0.' }
  if (/max_task_micro_usd cannot exceed/.test(text))
    return { field: 'budget', text: 'The most one task may spend cannot be more than the spending limit.' }
  if (/max_task_micro_usd/.test(text)) return { field: 'budget', text: 'Set the most one task may spend, above $0.' }
  if (/\bperiod\b/.test(text)) return { field: 'budget', text: 'Choose a day, a week or a month for the spending limit.' }
  if (status === 409 || /\bname\b/i.test(text)) return { field: 'name', text }
  if (/\bmodel\b/i.test(text)) return { field: 'model', text }
  if (/avatar|image|emoji/i.test(text)) return { field: 'picture', text }
  if (/instructions/i.test(text)) return { field: 'does', text: 'What it does is too long. Shorten it.' }
  return { field: 'form', text }
}

/** A field's own refusal, under it, announced when it appears. */
function Said({ id, text }: { id: string; text: string | null }) {
  if (!text) return null
  return (
    <Text id={id} role="alert" fontSize="$2" color={BAD}>
      {text}
    </Text>
  )
}

/**
 * The sheet that makes an agent.
 *
 * A name, a mind and a spending limit are what the agents API requires; what it
 * does becomes its instructions; the likeness is whichever the maker gives — a
 * photo uploaded onto the round picture (pressed, or dropped on), or a face
 * described and drawn by the image model. Both go through `mark`, the one crop
 * every saved face takes, so a drawn face and an uploaded one are the same kind
 * of picture. The row keeps at most one of a picture and an emoji, so choosing
 * one clears the other here too.
 *
 * Create stays off until the required fields are filled in the API's own
 * terms, and a refusal is said in plain words under the field it concerns.
 *
 * EXPORTED, because Contacts adds agents too and there is one way to make one.
 */
export function Hire({ onClose, onMade }: { onClose: () => void; onMade: (name: string) => void }) {
  const { create } = useAgents()
  const { models } = useModels()
  const { client } = useAi()
  const [name, setName] = useState('')
  const [does, setDoes] = useState('')
  const [model, setModel] = useState('enso')
  const [look, setLook] = useState('')
  const [avatar, setAvatar] = useState('')
  const [emoji, setEmoji] = useState('')
  const [cap, setCap] = useState('5')
  const [task, setTask] = useState('1')
  const [period, setPeriod] = useState<Period>('month')
  const [busy, setBusy] = useState<'draw' | 'make' | null>(null)
  const [wrong, setWrong] = useState<{ field: Field; text: string } | null>(null)
  const [over, setOver] = useState(false)
  const [lit, setLit] = useState(false)
  const picking = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  // WHAT CREATE WAITS FOR, in the API's own terms, so a request it would refuse
  // is never sent. Each rule names the field it belongs to.
  const called = name.trim()
  const nameWrong = !called ? null : NAME.test(called) ? null : 'Use letters, digits, dots, dashes or underscores, starting with a letter or digit, up to 64.'
  const capOk = Number.isFinite(Number(cap)) && micro(cap) > 0
  const taskOk = Number.isFinite(Number(task)) && micro(task) > 0
  const budgetWrong = !capOk
    ? 'Set a spending limit above $0.'
    : !taskOk
      ? 'Set the most one task may spend, above $0.'
      : micro(task) > micro(cap)
        ? 'The most one task may spend cannot be more than the spending limit.'
        : null
  const ready = Boolean(called) && !nameWrong && !budgetWrong && Boolean(model)
  const shown = (field: Field): string | null => (wrong?.field === field ? wrong.text : null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setWrong(null)
    try {
      setAvatar(await mark(file))
      setEmoji('')
    } catch (e) {
      setWrong({ field: 'picture', text: reach(e) })
    }
  }

  // The image model draws the face; `mark` makes it the same 256px square every
  // saved picture is, so a drawn face weighs what an uploaded one weighs.
  const draw = async () => {
    if (!client || !look.trim()) return
    setBusy('draw')
    setWrong(null)
    try {
      const out = await client.http.json<{ data?: { b64_json?: string }[] }>({
        method: 'POST',
        path: '/v1/images/generations',
        body: {
          prompt: `${look.trim()}, memoji style 3D emoji portrait, head and shoulders, centered, plain background`,
          n: 1,
          size: '512x512',
          response_format: 'b64_json',
        },
      })
      const b64 = out?.data?.[0]?.b64_json
      if (!b64) throw new Error('The image model answered with no picture.')
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      setAvatar(await mark(new File([bytes], 'face.png', { type: 'image/png' })))
      setEmoji('')
    } catch (e) {
      setWrong({ field: 'picture', text: reach(e) })
    } finally {
      setBusy(null)
    }
  }

  const make = async () => {
    if (!ready || busy) return
    setBusy('make')
    setWrong(null)
    // The budget fields are the agents API's (cloud apps/agents createAgentIn);
    // @hanzo/ai 0.6.16's AgentCreateParams predates them.
    const body: Parameters<typeof create>[0] & { cap_micro_usd: number; max_task_micro_usd: number; period: Period } = {
      name: called,
      model,
      ...(does.trim() ? { instructions: does.trim() } : {}),
      ...(avatar ? { avatar } : emoji.trim() ? { emoji: emoji.trim() } : {}),
      cap_micro_usd: micro(cap),
      max_task_micro_usd: micro(task),
      period,
    }
    try {
      await create(body)
      window.dispatchEvent(new Event(MADE))
      onMade(called)
      onClose()
    } catch (e) {
      setWrong(refusal(e))
    } finally {
      setBusy(null)
    }
  }

  const face = avatar ? (
    <View render={<img src={avatar} alt="" />} width="100%" height="100%" objectFit="cover" />
  ) : emoji ? (
    <Text fontSize={36} lineHeight={40}>
      {emoji}
    </Text>
  ) : null

  return (
    <Box
      position="fixed"
      inset={0}
      z="var(--z-modal)"
      display="flex"
      items="center"
      justify="center"
      p="$4"
      bg="$sunken"
      overflowY="auto"
      onClick={(e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <YStack
        role="dialog"
        aria-modal
        aria-labelledby="hire-title"
        width="100%"
        maxW={460}
        gap="$3"
        p="$5"
        rounded="$6"
        borderWidth={1}
        borderColor="$borderColor"
        bg="$background"
      >
        <Text id="hire-title" render="h2" fontSize="$5" fontWeight="600" color="$ink">
          New agent
        </Text>

        {/* THE PICTURE. The round is where a photo goes: pressed, it opens the
            file picker; a file dropped on it is taken the same way. The camera
            and the words under it say so before anything is chosen, and once a
            picture is set they say Change photo, with Remove beside it. */}
        <XStack items="center" gap="$4" flexWrap="wrap">
          <Box
            render="button"
            onClick={() => picking.current?.click()}
            onMouseEnter={() => setLit(true)}
            onMouseLeave={() => setLit(false)}
            onFocus={() => setLit(true)}
            onBlur={() => setLit(false)}
            onDragOver={(e: React.DragEvent) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e: React.DragEvent) => {
              e.preventDefault()
              setOver(false)
              void pick(e.dataTransfer.files?.[0])
            }}
            aria-label={avatar ? 'Change photo' : 'Upload photo'}
            aria-describedby="hire-picture-hint"
            position="relative"
            width={88}
            height={88}
            rounded={9999}
            overflow="hidden"
            shrink={0}
            items="center"
            justify="center"
            bg="$raised"
            borderWidth={2}
            borderStyle={avatar || emoji ? 'solid' : 'dashed'}
            borderColor={over || lit ? '$ink' : '$soft'}
          >
            {face}
            {!face || lit || over ? (
              <YStack
                aria-hidden
                position="absolute"
                inset={0}
                items="center"
                justify="center"
                gap="$1"
                bg={face ? VEIL : undefined}
              >
                <Camera size={22} color={face ? 'var(--pure-white)' : 'var(--soft, var(--muted-foreground))'} />
              </YStack>
            ) : null}
          </Box>
          <input
            ref={picking}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <YStack flex={1} minW={180} gap="$1.5">
            <XStack gap="$2" items="center" flexWrap="wrap">
              <Button size="sm" variant="outline" onClick={() => picking.current?.click()}>
                <Upload size={14} aria-hidden /> {avatar ? 'Change photo' : 'Upload photo'}
              </Button>
              {avatar ? (
                <Button size="sm" variant="ghost" onClick={() => setAvatar('')}>
                  Remove
                </Button>
              ) : null}
            </XStack>
            <Text id="hire-picture-hint" fontSize="$2" color="$soft">
              {over ? 'Drop the photo to use it.' : 'Press the circle or drop a photo on it. PNG, JPEG, GIF or WebP.'}
            </Text>
          </YStack>
        </XStack>

        <YStack gap="$1.5">
          <Text render="label" htmlFor="hire-look" fontSize="$2" color="var(--soft, var(--muted-foreground))">
            Or describe a face and press Draw
          </Text>
          <XStack gap="$1.5" items="center">
            <Box flex={1}>
              <Input
                id="hire-look"
                value={look}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLook(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') void draw()
                }}
                placeholder="A calm engineer with round glasses"
              />
            </Box>
            <Button size="sm" variant="outline" disabled={busy !== null || !look.trim()} onClick={() => void draw()}>
              {busy === 'draw' ? 'Drawing…' : 'Draw'}
            </Button>
          </XStack>
          <XStack gap="$2" items="center">
            <Text render="label" htmlFor="hire-emoji" fontSize="$2" color="var(--soft, var(--muted-foreground))">
              Or one emoji
            </Text>
            <Box width={64}>
              <Input
                id="hire-emoji"
                value={emoji}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEmoji(e.target.value)
                  if (e.target.value) setAvatar('')
                }}
                aria-describedby="hire-picture-wrong"
              />
            </Box>
          </XStack>
          <Said id="hire-picture-wrong" text={shown('picture')} />
        </YStack>

        <YStack gap="$1.5">
          <Text render="label" htmlFor="hire-name" fontSize="$2" fontWeight="600">
            Name
          </Text>
          <Input
            id="hire-name"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') void make()
            }}
            placeholder="Michael"
            autoFocus
            aria-required="true"
            aria-invalid={Boolean(nameWrong || shown('name'))}
            aria-describedby="hire-name-wrong"
          />
          <Said id="hire-name-wrong" text={nameWrong ?? shown('name')} />
        </YStack>

        <YStack gap="$1.5">
          <Text render="label" htmlFor="hire-model" fontSize="$2" fontWeight="600">
            Model
          </Text>
          <Text
            render={<select id="hire-model" value={model} onChange={(e) => setModel(e.target.value)} aria-describedby="hire-model-wrong" />}
            {...FIELD}
          >
            <option value="enso">enso</option>
            {models.map((one) => (
              <option key={one.id} value={one.id}>
                {one.id}
              </option>
            ))}
          </Text>
          <Said id="hire-model-wrong" text={shown('model')} />
        </YStack>

        <YStack gap="$1.5">
          <Text render="label" htmlFor="hire-does" fontSize="$2" fontWeight="600">
            What it does{' '}
            <Text fontWeight="400" color="var(--soft, var(--muted-foreground))">
              — optional
            </Text>
          </Text>
          <Textarea
            id="hire-does"
            value={does}
            onChangeText={setDoes}
            placeholder="The work it takes and the voice it answers in"
            rows={3}
            aria-describedby="hire-does-wrong"
          />
          <Said id="hire-does-wrong" text={shown('does')} />
        </YStack>

        {/* THE SPENDING LIMIT. The agents API requires one on every agent: what
            it may spend in a window, and the most one task may spend. */}
        <View render={<fieldset aria-describedby="hire-budget-wrong" />} display="block" borderWidth={0} p={0} m={0}>
          <Text render="legend" display="block" fontSize="$2" fontWeight="600" mb={6}>
            Spending limit
          </Text>
          <YStack gap="$2">
            <XStack gap="$2" items="center" flexWrap="wrap">
              <Text fontSize="$2" color="$soft">
                Up to $
              </Text>
              <Box width={84}>
                <Input
                  aria-label="Spending limit in dollars"
                  inputMode="decimal"
                  value={cap}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCap(e.target.value)}
                  aria-invalid={!capOk}
                />
              </Box>
              <Text
                render={<select aria-label="Spending limit period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} />}
                {...FIELD}
                width="auto"
              >
                {PERIODS.map(([value, words]) => (
                  <option key={value} value={value}>
                    {words}
                  </option>
                ))}
              </Text>
            </XStack>
            <XStack gap="$2" items="center" flexWrap="wrap">
              <Text fontSize="$2" color="$soft">
                At most $
              </Text>
              <Box width={84}>
                <Input
                  aria-label="Most one task may spend, in dollars"
                  inputMode="decimal"
                  value={task}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTask(e.target.value)}
                  aria-invalid={!taskOk}
                />
              </Box>
              <Text fontSize="$2" color="$soft">
                on one task
              </Text>
            </XStack>
          </YStack>
          <Box mt="$1.5">
            <Said id="hire-budget-wrong" text={budgetWrong ?? shown('budget')} />
          </Box>
        </View>

        <Said id="hire-form-wrong" text={shown('form')} />

        <XStack justify="flex-end" gap="$2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy !== null || !ready} onClick={() => void make()}>
            {busy === 'make' ? 'Creating…' : 'Create'}
          </Button>
        </XStack>
      </YStack>
    </Box>
  )
}
