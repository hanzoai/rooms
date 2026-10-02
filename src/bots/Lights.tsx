'use client'

import { XStack, YStack } from '@hanzo/gui'

/**
 * A window's head: three rings, not three colours. Red, amber and green are
 * another company's mark, and nothing here closes, minimises or zooms, so the
 * shape alone says "window". The Bots room, its capture and the template
 * cards wear it (components/bots/Bots.tsx, components/home/Shot.tsx,
 * components/home/Templates.tsx).
 */
export function Lights() {
  return (
    <XStack render="span" aria-hidden display="inline-flex" gap={6}>
      {[0, 1, 2].map((i) => (
        <YStack key={i} render="i" width={9} height={9} rounded={999} borderWidth={1} borderColor="var(--border)" />
      ))}
    </XStack>
  )
}
