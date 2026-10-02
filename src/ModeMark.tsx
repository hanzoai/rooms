'use client'

// The top row of a side pane: the mode's wordmark at the left, and at the far right the
// Chat / Dev switch — two icons, a message and code, each with its name as a
// tooltip. `stacked` is the collapsed rail's: the two marks one over the other,
// no wordmark.

import type { ReactNode } from 'react'
import { MessageSquare, Code2 } from 'lucide-react'
import { XStack, YStack, Text, Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui'

/** The product's name in each mode: Hanzo AI in Chat, Hanzo Dev in Dev. */
export const wordmark = (mode: 'chat' | 'dev'): string => (mode === 'dev' ? 'Hanzo Dev' : 'Hanzo AI')

/** One side of the switch: an icon button named for its mode, with the name as its tooltip. */
function Side({ name, on, onPress, children }: { name: string; on: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <XStack
          render="button"
          aria-label={name}
          aria-pressed={on}
          onPress={onPress}
          width={28}
          height={24}
          rounded={999}
          items="center"
          justify="center"
          bg={on ? '$hover' : 'transparent'}
          hoverStyle={{ bg: '$hover' }}
          cursor="pointer"
        >
          {children}
        </XStack>
      </TooltipTrigger>
      <TooltipContent>
        <Text fontSize="$2">{name}</Text>
      </TooltipContent>
    </Tooltip>
  )
}

export function ModeMark({
  mode,
  onChat,
  onDev,
  stacked = false,
}: {
  mode: 'chat' | 'dev'
  onChat: () => void
  onDev: () => void
  stacked?: boolean
}) {
  const dev = mode === 'dev'
  const Group = stacked ? YStack : XStack
  const toggle = (
    <Group role="group" aria-label="Switch Hanzo" items="center" gap={2} p={2} rounded={999} bg="$edge" shrink={0}>
      <Side name="Chat" on={!dev} onPress={onChat}>
        <MessageSquare size={14} aria-hidden />
      </Side>
      <Side name="Dev" on={dev} onPress={onDev}>
        <Code2 size={14} aria-hidden />
      </Side>
    </Group>
  )
  if (stacked) return toggle
  return (
    <XStack flex={1} items="center" justify="space-between" gap="$2" minW={0}>
      <Text fontSize="$4" fontWeight="600" color="$ink" numberOfLines={1}>
        {wordmark(mode)}
      </Text>
      {toggle}
    </XStack>
  )
}
