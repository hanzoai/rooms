'use client'

// The tab strip, once.
//
// Three surfaces drew one by hand and no two agreed on what a chosen tab looks
// like. The builder and the room underlined it 2px; /work used 1px, which sits
// flush on the 1px divider the strip already draws under itself and so reads as
// no rule at all — in a screenshot the chosen tab there was told apart by colour
// and weight alone. /work was also the only one to bold the chosen label, which
// the rail beside it does not do and which measured 2px wider than the same word
// unbolded, so every tab to its right stepped sideways on each switch. The 2px
// rule is canonical and the weight is not: a rule that outweighs the divider
// says "here" without the row moving under the pointer.
//
// The strip is 48 tall, which /work's strip and the builder's header already
// were, because a control has to be reachable and these were not: at 390px wide
// the builder's tabs measured 39 tall and its Files tab 40 wide, both under the
// 44 a thumb needs. A tab is now at least 44 in both directions and refuses to
// shrink, and the strip scrolls instead — a tab you can read and miss is worse
// than one you have to scroll to.
//
// 48 IS A MINIMUM AND NOT A HEIGHT, because a scrollbar is drawn INSIDE the box
// it scrolls: on a platform with classic scrollbars the strip's own gutter
// takes ~15 of a fixed 48 and the tabs it holds fall back under 44, which is
// the floor this file exists to hold. Stated as a minimum, the gutter makes the
// strip taller instead of the tabs shorter.
//
// The inset and the gap are $3. /work drew $4 and the builder $3; one of them
// had to move and the tighter one keeps more tabs reachable before the strip
// has to scroll at all.

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Box, Text, XStack } from '@hanzo/ui'

/** One tab: what the code calls it, what the reader calls it. */
export interface Tab<Id extends string = string> {
  id: Id
  label: string
  /** Before the label. A strip of plain words leaves it off. */
  icon?: LucideIcon
}

/**
 * A row of tabs and the one you are on.
 *
 * `onPick` is OPTIONAL because a strip can have a single destination — a room
 * whose only tab is its conversation — and a tab with nowhere else to go is not
 * a control. Drawn as a button it would take a focus stop to say the thing the
 * label already says. So without a handler these are labels, and the moment
 * there is a second place to be they become buttons with no other change.
 *
 * `after` is what sits past the last tab: the plus that would add one.
 */
export function Tabs<Id extends string>({
  tabs,
  chosen,
  onPick,
  after,
}: {
  // THE LIST DEFINES THE IDS and the other two are checked against it, which is
  // what `NoInfer` buys and why both carry it. Left inferring, `chosen` widens
  // `Id` by whatever it is passed — so a typo'd id becomes a legal fourth tab
  // rather than an error — and a `setState` passed straight to `onPick` offers
  // `SetStateAction<Id>`, a union with a function in it, which is not a string
  // and collapses `Id` to its constraint. Either way the generic stops checking
  // anything, silently, which is the failure worth spending two words on.
  tabs: readonly Tab<Id>[]
  chosen: NoInfer<Id>
  onPick?: (id: NoInfer<Id>) => void
  after?: ReactNode
}) {
  return (
    <XStack
      minH={48}
      shrink={0}
      items="center"
      px="$3"
      gap="$3"
      overflowX="auto" overflowY="hidden"
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      {tabs.map((one) => {
        const on = one.id === chosen
        const Icon = one.icon
        return (
          <Box
            key={one.id}
            {...(onPick ? { render: 'button', onClick: () => onPick(one.id) } : {})}
            aria-current={on}
            // Stretched rather than padded, so the rule lands on the strip's
            // own edge and every tab underlines at the same height whether or
            // not it carries an icon.
            self="stretch"
            items="center"
            justify="center"
            shrink={0}
            minW={44}
            minH={44}
            borderBottomWidth={2}
            borderColor={on ? '$ink' : 'transparent'}
          >
            <XStack items="center" gap="$2">
              {Icon ? <Icon size={14} aria-hidden /> : null}
              <Text fontSize="$2" color={on ? '$ink' : '$soft'} numberOfLines={1}>
                {one.label}
              </Text>
            </XStack>
          </Box>
        )
      })}
      {after}
    </XStack>
  )
}
