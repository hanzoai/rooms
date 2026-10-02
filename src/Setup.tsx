'use client'

// The first-run steps, offered: a card in the app's column that opens
// /onboarding and can be put away. Never a redirect — chat is free and nothing
// stands in front of it.
//
// Offered only to an account that has not begun: no organization in its token
// and a step still owed by IAM's record (@hanzo/ui/onboarding `firstRun`). An
// account with an organization has history, and is onboarded whatever the
// record says.

import { useEffect, useState } from 'react'
import { SizableText, Text, XStack, YStack } from '@hanzo/gui'
import { Sparkles, X } from 'lucide-react'
import { firstRun } from '@hanzo/ui/onboarding'
import { useKept } from './kept'
import { orgs } from './lib/session'
import { api } from './lib/api'
import { brand, site } from './where'

/** Put away in this browser. */
const LATER = 'hanzo.onboarding.later'

export function Setup() {
  const [later, setLater] = useKept(LATER, false)
  const [owed, setOwed] = useState(false)
  useEffect(() => {
    if (later || orgs().length) return
    let live = true
    void firstRun(api()).then((r) => live && setOwed(r.pending))
    return () => {
      live = false
    }
  }, [later])
  if (later || !owed) return null
  return (
    <XStack data-slot="setup" role="region" aria-label={`Set up ${brand()}`} items="center" gap="$2.5" px="$3" py="$2.5" rounded="$4" borderWidth={1} borderColor="$borderColor" bg="$edge">
      <Sparkles size={16} aria-hidden />
      <YStack flex={1} minW={0} gap="$0.5">
        <SizableText size="$2" color="$ink" numberOfLines={1}>
          Finish setting up {brand()}
        </SizableText>
        <Text
          render={<a href={site(`/onboarding?next=${encodeURIComponent('/')}`)} />}
          color="var(--soft, var(--muted-foreground))"
          fontSize="$1"
          textDecorationLine="underline"
          self="flex-start"
        >
          Set up
        </Text>
      </YStack>
      <XStack render="button" aria-label="Not now" onPress={() => setLater(true)} p="$1" rounded={999} hoverStyle={{ bg: '$hover' }}>
        <X size={14} aria-hidden />
      </XStack>
    </XStack>
  )
}
