'use client'

// Copying something out of the app, in one control.
//
// Two places want it and they want the same thing: an answer you are taking
// into an editor, and the address of a site you are sending to somebody. So the
// glyph, the tick, and how long the tick stays are decided here rather than
// twice — a control that confirms for 1400ms in one pane and 800ms in another
// reads as two different controls doing two different things.

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Box, Text, XStack } from '@hanzo/ui'

/**
 * Take something away with you.
 *
 * It copies the TEXT IT IS GIVEN, which for a message is the source rather than
 * what is on screen: an answer is markdown — fences, lists, a table — and the
 * rendered text has thrown all of that away, so pasting it into an editor gives
 * you the words with the shape stripped off. The bytes the model wrote are the
 * ones worth having.
 *
 * ALWAYS PRESENT, not hover-only. A control that exists only under a pointer is
 * one a keyboard and a thumb cannot reach; this one rests dim and comes up on
 * hover or focus, so it is quiet without being conditional. Given a `label` it
 * stops resting — a word in a row of controls is not decoration and is read at
 * full weight.
 */
export function Take({
  text,
  says = 'this',
  label,
}: {
  /** What lands on the clipboard. */
  text: string
  /** What it is, for the reader who hears the control rather than sees it. */
  says?: string
  /** A word beside the glyph, where the control sits among named ones. */
  label?: string
}) {
  const [took, setTook] = useState(false)

  useEffect(() => {
    if (!took) return
    const t = setTimeout(() => setTook(false), 1400)
    return () => clearTimeout(t)
  }, [took])

  return (
    <Box
      render="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setTook(true)).catch(() => {})
      }}
      aria-label={took ? 'Copied' : `Copy ${says}`}
      borderWidth={0}
      bg="transparent"
      p="$1"
      rounded="$2"
      opacity={label || took ? 1 : 0.35}
      hoverStyle={{ opacity: 1, bg: '$hover' }}
      focusStyle={{ opacity: 1 }}
    >
      <XStack items="center" gap="$1">
        {took ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        {label ? (
          <Text fontSize="$2" color="$ink">
            {took ? 'Copied' : label}
          </Text>
        ) : null}
      </XStack>
    </Box>
  )
}
