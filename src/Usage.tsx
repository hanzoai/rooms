'use client'

// Free's usage, said where it is spent. Free is limited, and what it spends
// comes from one pool every free user shares, so the line says both, and what
// is left of today's when billing states a day window for the plan (the tier's
// `windows`, lib/hanzo/tier.ts). It renders nothing for any other plan, or
// while the plan is unread.

import { useIam } from '@hanzo/iam/react'
import { Text } from '@hanzo/ui'
import { org } from './lib/session'
import { useTier } from './lib/tier'

/** The free rung's name in the billing catalog. */
const FREE = 'free'

export function Usage() {
  const { isAuthenticated } = useIam()
  const { tier } = useTier(isAuthenticated, org())
  if (tier?.tier?.name !== FREE) return null
  const today = tier.windows?.find((w) => /day/i.test(w.span))
  return (
    <Text role="status" fontSize="$1" color="$soft" text="center">
      Free · limited, shared pool{today ? ` · ${today.remaining} of ${today.limit} left today` : ''}
    </Text>
  )
}
