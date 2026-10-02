'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  Box,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Text,
  XStack,
  YStack,
} from '@hanzo/ui'
import { ModelSelector, RESEARCH } from '@hanzo/ui/models'
import { ProviderMark } from './ProviderMark'
import { ENSO, FREE } from './lib/ai'
import { modelName } from './lib/models'

/**
 * How hard to think — and, one press inside, what thinks.
 *
 * EFFORT IS ON THE BAR AND THE MODEL IS NOT. That is the product's position
 * rather than a layout preference: Enso routes the ask, so naming a model is an
 * override and belongs inside this panel, not on the row where it asked every
 * reader to hold an opinion about a catalogue before they could type a
 * sentence.
 *
 * Effort earns the bar because it belongs to the ASK. The same person wants a
 * fast answer to one question and a careful one to the next; the model they
 * want rarely changes between two messages, which is what makes it a
 * preference and this a control.
 *
 * `reasoning_effort` is an OpenAI-compatible completion parameter and rides
 * `useChat`'s `params`, so on /chat it reaches the API. A surface that cannot
 * carry it passes no `onEffort` and the chip names the router instead — the
 * coding plane takes a `model` and has no effort field, and a control that
 * reaches nothing is worse than one that is absent.
 */

export const EFFORTS = [
  { id: 'minimal', label: 'Instant', note: 'Answer now, no deliberation' },
  { id: 'low', label: 'Low', note: 'A quick pass' },
  { id: 'medium', label: 'Medium', note: 'Thinks before it writes' },
  { id: 'high', label: 'High', note: 'Slow and careful, for hard problems' },
] as const

export type EffortId = (typeof EFFORTS)[number]['id']

const DEFAULT: EffortId = 'medium'
const KEY = 'hanzo.chat.effort'
const CHANGE = 'hanzo:effort'

const read = (): EffortId => {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const held = window.localStorage.getItem(KEY) as EffortId | null
    return EFFORTS.some((e) => e.id === held) ? (held as EffortId) : DEFAULT
  } catch {
    return DEFAULT
  }
}

/**
 * The effort preference, shared by every surface that sends a completion.
 *
 * Same shape as `useModel` — one storage key, one change event, read on mount
 * rather than in the initialiser so the server and the first client render
 * agree and hydration does not warn.
 */
export function useEffort(): readonly [EffortId, (next: EffortId) => void] {
  const [effort, setEffort] = useState<EffortId>(DEFAULT)

  useEffect(() => {
    setEffort(read())
    const sync = () => setEffort(read())
    window.addEventListener('storage', sync)
    window.addEventListener(CHANGE, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(CHANGE, sync)
    }
  }, [])

  const choose = (next: EffortId) => {
    setEffort(next)
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      // A private browser may refuse persistence; this tab still keeps the choice.
    }
    window.dispatchEvent(new Event(CHANGE))
  }

  return [effort, choose] as const
}

/** The name a served model goes by: its row's label, its name, or its id made readable. */
export function nameOf(models: { id: string }[], id: string): string {
  const row = models.find((m) => m.id === id) as { label?: unknown; name?: unknown } | undefined
  return modelName({ id, name: String(row?.label ?? row?.name ?? '') })
}

export interface EnsoProps {
  /** Current effort. Omit `onEffort` where the surface cannot send one. */
  effort?: EffortId
  onEffort?: (next: EffortId) => void
  /** The override. `models` empty hides it rather than offering an empty menu. */
  model?: string
  onModel?: (id: string) => void
  models?: { id: string }[]
  disabled?: boolean
}

/**
 * The chip that sits beside send, and the panel it opens.
 *
 * The chip names what answers the next message: Enso while Enso routes it
 * (`ENSO`, or `FREE` on the free route), and the model itself once one is
 * picked. Beside the name it states the effort where the surface sends one.
 */
export function Enso({ effort, onEffort, model, onModel, models = [], disabled }: EnsoProps) {
  const [open, setOpen] = useState(false)
  const chosen = EFFORTS.find((e) => e.id === effort)
  const pace = onEffort && chosen ? chosen.label : null
  const picked = model && model !== ENSO && model !== FREE ? model : undefined
  const name = picked ? nameOf(models, picked) : 'Enso'

  // The panel opens above the chip when there is no room below it, so the model
  // picker at its foot stays on screen on a laptop-height window. It is SOLID:
  // it stands over a transcript that streams, which would read through glass,
  // and the model list it opens inherits the same ground.
  return (
    <Popover open={open} onOpenChange={setOpen} allowFlip>
      <PopoverTrigger disabled={disabled}>
        <XStack
          data-slot="enso"
          items="center"
          gap="$1.5"
          px="$2.5"
          height={32}
          maxW={220}
          rounded="$10"
          borderWidth={1}
          borderColor="$borderColor"
          hoverStyle={{ bg: '$hover' }}
          opacity={disabled ? 0.4 : 1}
          aria-label={pace ? `${name}: ${pace}` : name}
        >
          <ProviderMark provider="enso" model={picked} size={14} />
          <Text fontSize="$1" color="$ink" fontWeight="600" numberOfLines={1}>
            {name}
          </Text>
          {pace ? (
            <Text fontSize="$1" color="$soft" fontWeight="500">
              {pace}
            </Text>
          ) : null}
          <ChevronDown size={12} aria-hidden />
        </XStack>
      </PopoverTrigger>

      <PopoverContent solid align="end" p={6} width={268}>
        <YStack gap="$1">
          {onEffort
            ? EFFORTS.map((e) => (
                <Box
                  key={e.id}
                  render="button"
                  onClick={() => {
                    onEffort(e.id)
                    setOpen(false)
                  }}
                  px="$2"
                  py="$2"
                  rounded="$3"
                  width="100%"
                  hoverStyle={{ bg: '$hover' }}
                  aria-pressed={e.id === effort}
                >
                  <XStack items="center" gap="$2" width="100%">
                    {/* A row in a menu reads from the left. `Box render="button"`
                        inherits the button element's centred text, which put four
                        labels down the middle of the panel. */}
                    <YStack flex={1} minW={0} items="flex-start">
                      <Text fontSize="$2" color="$ink" text="left">
                        {e.label}
                      </Text>
                      <Text fontSize="$1" color="$soft" text="left">
                        {e.note}
                      </Text>
                    </YStack>
                    {e.id === effort ? <Check size={14} aria-hidden /> : null}
                  </XStack>
                </Box>
              ))
            : null}

          {/* THE OVERRIDE, and it reads like one. Enso routing is the sentence
              above the control so the default is stated rather than implied by
              an empty field. */}
          {onModel && models.length ? (
            <>
              {onEffort ? <Separator my="$1" /> : null}
              <YStack px="$2" pt="$1" pb="$2" gap="$2">
                <Text fontSize="$1" color="$soft">
                  Enso picks the model. Override it for this account:
                </Text>
                <ModelSelector
                  models={[...models, ...RESEARCH]}
                  value={model}
                  onChange={(id) => {
                    onModel(id)
                    setOpen(false)
                  }}
                  size="sm"
                />
              </YStack>
            </>
          ) : null}
        </YStack>
      </PopoverContent>
    </Popover>
  )
}
