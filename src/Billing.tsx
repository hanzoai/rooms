'use client'

/**
 * WHAT THE WORKSPACE BOUGHT, AND WHAT IT MAY SPEND — as Billing, not as the
 * person's card. Credits belong to the workspace (an org-level pool), so they
 * are read here and pressed through to billing at hanzo.ai/pay for the org this
 * workspace is.
 *
 * NOTHING HERE IS DRAWN FROM A GUESS. A figure shows only when the read
 * SUCCEEDED: a balance that could not be read is unknown, and unknown is not
 * zero, so it renders as the plain word rather than as `$0.00`.
 */

import { Wallet } from 'lucide-react'
import { Box, Text, XStack } from '@hanzo/ui'
import { useIam } from '@hanzo/iam/react'
import { formatCents } from '@hanzo/usage'
import { renewal, useSubscription, useTier } from './lib/tier'
import { payPage } from './lib/pay'
import { planName } from './lib/plans'

export function Billing() {
  const { isAuthenticated } = useIam()
  const { tier } = useTier(isAuthenticated)
  const sub = useSubscription(isAuthenticated)
  if (!isAuthenticated) return null
  // WHAT THE CUSTOMER BOUGHT, not the coarser class it is served under: a
  // Max 20x subscriber runs on `pro` limits, and printing that read as "Pro".
  // A subscription is named with its term; its usage never draws the balance,
  // so the balance stands beside a plan only where there is no subscription.
  const plan = tier ? planName(tier.plan) || tier.tier.displayName || tier.tier.name : null
  return (
    <Box
      render="button"
      onClick={() => window.open(payPage(), '_blank', 'noopener')}
      aria-label="Billing"
      px="$2.5"
      py="$1.5"
      rounded="$2"
      hoverStyle={{ bg: '$hover' }}
    >
      <XStack items="center" gap="$2">
        <Wallet size={15} aria-hidden />
        <Text fontSize="$2" color="$ink">
          {plan ? `${plan} · ${sub ? renewal(sub) : `${formatCents(tier!.balance.effectiveAvailable)} available`}` : 'Billing'}
        </Text>
      </XStack>
    </Box>
  )
}
