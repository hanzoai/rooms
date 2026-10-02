'use client'

// A Bot's face.
//
// Three answers, in the order the record decides them: the image it carries, the
// one glyph somebody picked before it had one, or its initial. The platform's
// own rule — at most one of avatar/emoji is ever set — so nothing here ranks two.
//
// It is drawn in the greyscale ramp because a face is not a category. The seven
// coloured blobs this replaced encoded nothing: the colour was picked per persona
// in a hardcoded table, so it told a reader which of seven fictional bots they
// were looking at and could not survive the eighth.

import type { Agent } from '@hanzo/ai'
import { Text, YStack } from '@hanzo/gui'

import { INK, LINE, SURFACE } from './ink'

export function Face({ bot, size = 36 }: { bot: Pick<Agent, 'name' | 'avatar' | 'emoji'>; size?: number }) {
  const round = { width: size, height: size, shrink: 0, rounded: 9999, borderWidth: 1, borderColor: LINE } as const

  if (bot.avatar) return <YStack render="img" {...{ src: bot.avatar, alt: '' }} aria-hidden {...round} objectFit="cover" />

  // The glyph scales with the disc, so its size is a number of pixels rather
  // than a rung; the leading is the size itself, which centres it.
  const glyph = Math.round(size * (bot.emoji ? 0.5 : 0.4))
  return (
    // `userSelect` is a gui style its types do not list, so it is spread.
    <YStack aria-hidden {...round} items="center" justify="center" bg={SURFACE} {...{ userSelect: 'none' }}>
      <Text color={INK} fontSize={glyph} lineHeight={glyph} fontWeight="600">
        {bot.emoji || (bot.name || '?').trim().charAt(0).toUpperCase()}
      </Text>
    </YStack>
  )
}
