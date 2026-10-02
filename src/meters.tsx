'use client'

// A plan's windows as bars of what is LEFT: the five-hour session, the day and
// the billing month, each with when it starts over. Shares only — a plan is a
// subscription with limits, never a balance, so no count and no amount is
// drawn. The month spent refuses nothing (Enso and Zen keep answering), which
// is why it is a quiet line under the bars rather than a warning.
//
// One component for the composer's foot and for the usage page: `large` is the
// page's size. Each bar is drawn above its words so the three bars stay on one
// line however the words under them wrap on a phone.

import { Progress, Text, XStack, YStack } from '@hanzo/ui'
import { clock, day, left, type Limits, type Span } from './lib/limits'

/** What a spent month says. */
export const SPENT = 'Monthly included usage is used; Enso and Zen keep answering.'

const WINDOWS: readonly [key: 'session' | 'day' | 'month', name: string, when: (s: Span) => string][] = [
  ['session', 'Session', (s) => (s.resets_at ? `resets ${clock(s.resets_at)}` : '')],
  ['day', 'Today', (s) => (s.resets_at ? `resets ${clock(s.resets_at)}` : '')],
  ['month', 'This month', (s) => (s.resets_at ? `renews ${day(s.resets_at)}` : '')],
]

/** The plan holder's windows, or nothing where the limits name none. */
export function Meters({ limits, large = false }: { limits: Limits; large?: boolean }) {
  const shown = WINDOWS.flatMap(([key, name, when]) => {
    const span = limits[key]
    return span ? [{ name, span, when: when(span) }] : []
  })
  if (!shown.length) return null
  const size = large ? '$3' : '$1'
  return (
    <YStack gap={large ? '$4' : '$1.5'} width="100%" minW={0}>
      <XStack gap={large ? '$6' : '$3'} rowGap="$4" width="100%" flexWrap={large ? 'wrap' : 'nowrap'}>
        {shown.map(({ name, span, when }) => (
          <YStack key={name} flex={1} minW={large ? 200 : 0} gap={large ? '$2' : '$1'}>
            {/* gui's Progress keeps a 220px floor of its own; a cell is narrower on a phone. */}
            <Progress value={left(span)} height={large ? 8 : 4} minW={0} aria-label={name} />
            <XStack flexWrap="wrap" columnGap="$1.5" items="baseline" minW={0}>
              <Text fontSize={size} color={large ? '$ink' : '$soft'} numberOfLines={1}>
                {name}
              </Text>
              <XStack>
                <Text fontSize={size} color="$ink" fontWeight="500" fontVariant={['tabular-nums']}>
                  {left(span)}%
                </Text>
                {/* The word is the reading of the number; a phone's three narrow cells read it off the bar. */}
                <Text fontSize={size} color="$ink" display={large ? 'flex' : 'none'} $sm={{ display: 'flex' }}>
                  &nbsp;left
                </Text>
              </XStack>
              {when ? (
                <Text fontSize={large ? '$2' : '$1'} color="$soft" numberOfLines={1}>
                  {when}
                </Text>
              ) : null}
            </XStack>
          </YStack>
        ))}
      </XStack>
      {limits.month && limits.month.percent >= 100 ? (
        <Text fontSize={large ? '$2' : '$1'} color="$soft">
          {SPENT}
        </Text>
      ) : null}
    </YStack>
  )
}
