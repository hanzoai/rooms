'use client'

// The card, and the ink it is drawn in. ONE set of shapes for every pane in the
// workspace, so /chat's home and /dev's landing cannot drift into two designs.
//
// THE INK IS NAMED HERE BECAUSE gui DROPS A TOKEN IT DOES NOT KNOW, silently.
// Measured in the browser against this repo's own `app/gui.css`: the
// shadcn-shaped names much of this site reaches for are not theme keys — a Text
// asking for the muted foreground and one asking for the foreground BOTH emit
// `_col-color`, so a heading and its body render at one white; and a Box asking
// for the muted background emits no class at all, so a selected control has no
// fill and its hover has no feedback. The keys the theme does publish are
//
//     ink · soft · dim · quiet · panel · hover · raised · edge · borderColor
//
// and the three below are the ones these panes need. Read them off
// `app/gui.css`; never guess a semantic name.

import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { tap } from './lib/tap'


/** Primary text. #e5e5e5. */
export const INK = '$ink'
/** Secondary text. rgb(171,171,171) — 8.6:1 on the page ground, past AA. */
export const SOFT = '$soft'
/** The fill a chosen control wears. `$hover` is the one it wears on approach. */
export const CHOSEN = '$raised'

/**
 * One card.
 *
 * NO `height="100%"` AND NO `flex={1}` INSIDE. A grid already stretches a cell
 * to its row; `flex: 1 1 0` on a child is a ZERO basis, so a column parent
 * measures that child as nothing and the card closes above its own rows.
 * Measured at 390: a card was 54px tall around 80px of content and printed
 * straight over the one below it.
 */
export function Card({
  kind,
  icon,
  title,
  action,
  children,
}: {
  /** What this card is, for a test to find it by. */
  kind: string
  icon: ReactNode
  title: string
  /**
   * A control at the far end of the heading — the `+` that adds to what the
   * card lists.
   *
   * IN THE HEADING RATHER THAN BESIDE THE CARD, because what it adds to is the
   * card's own list, and a control that lives outside the box it acts on has to
   * be labelled to say which box it means. `flex={1}` on the title is what
   * pushes it right: a `justifyContent` here would also spread the icon away
   * from the word it belongs to.
   */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <YStack
      data-card={kind}
      gap="$2"
      p="$3"
      borderWidth={1}
      borderColor="$borderColor"
      rounded="$4"
      bg="$panel"
      minW={0}
      hoverStyle={{ bg: '$hover' }}
    >
      <XStack items="center" gap="$2">
        {icon}
        <Text fontSize="$2" fontWeight="500" color={INK} flex={1} minW={0} numberOfLines={1}>
          {title}
        </Text>
        {action}
      </XStack>
      {children}
    </YStack>
  )
}

/** One line in a card: a word, and where it goes. Neither, and it is a word. */
export function Row({
  children,
  icon,
  href,
  onPress,
}: {
  children: ReactNode
  icon?: ReactNode
  href?: string
  onPress?: () => void
}) {
  // `numberOfLines` CANNOT CLAMP WITHOUT A WIDTH TO CLAMP TO. A flex child's
  // floor is its own content, so a long title pushed the row wider than the
  // card and the sentence ran out through the side of it — the ellipsis never
  // had an edge to appear at. The width is stated and the floor is dropped, so
  // the row is exactly as wide as the card and the clamp has somewhere to bite.
  const body = (
    <XStack items="center" gap="$1.5" width="100%" minW={0}>
      {icon ? (
        <Box shrink={0} opacity={0.8} display="flex" items="center" justify="center">
          {icon}
        </Box>
      ) : null}
      {/* A `<button>` CENTRES ITS TEXT and nothing above says otherwise:
          `alignItems` places the box, which is already full width, and the
          words inside still came to rest in the middle — a pressable row read
          centred beside the identical row with an `href`. The line says left. */}
      <Text fontSize="$2" color={SOFT} numberOfLines={1} flex={1} minW={0} text="left">
        {children}
      </Text>
    </XStack>
  )
  if (href) {
    return (
      <Box
        render={<a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" />}
        {...tap}
        display="block"
        minW={0}
        maxW="100%"
      >
        {body}
      </Box>
    )
  }
  if (onPress) {
    return (
      <Box
        render="button"
        onClick={onPress}
        width="100%"
        minW={0}
        items="flex-start"
      >
        {body}
      </Box>
    )
  }
  return body
}

/** The honest nothing. `null` is unknown and never renders as none. */
export function Quiet({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="$2" color={SOFT}>
      {children}
    </Text>
  )
}

/** The card's action, at its foot — `margin-top: auto` and not a flex spacer,
 *  which is what the note on `Card` is about. An address, or a press. */
export function Go({
  href,
  onPress,
  children,
}: {
  href?: string
  onPress?: () => void
  children: ReactNode
}) {
  const face = (
    <XStack items="center" gap="$1">
      <Text fontSize="$2" fontWeight="500" color={INK}>
        {children}
      </Text>
      <ArrowRight size={12} aria-hidden />
    </XStack>
  )
  if (href) {
    return (
      <Box
        render={<a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" />}
        {...tap}
        mt="auto"
      >
        {face}
      </Box>
    )
  }
  return (
    <Box render="button" onClick={onPress} mt="auto" items="flex-start">
      {face}
    </Box>
  )
}
