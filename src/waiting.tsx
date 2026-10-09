'use client'

import { Spinner, Text, YStack } from '@hanzo/gui'

/**
 * What a route shows while it is handing the reader somewhere else.
 *
 * IAM owns the sign-in form, so /login, /signup and /auth/callback each do one
 * thing: say where you are going, and go. All three drew that screen from their
 * own copy of the same markup, and each asked for a whole viewport of it inside
 * a layout that already supplies a header and a footer — so a page carrying one
 * line of text scrolled, and the line sat below the middle of it.
 *
 * It fills the viewport below the bar (`--header`, which the bar publishes) and
 * centres one spinner and one line in it, the same on every route that waits.
 */
export function Waiting({ title, lede }: { title: string; lede?: string }) {
  return (
    <YStack
      items="center"
      justify="center"
      gap="$5"
      minH="calc(100dvh - var(--header, 64px))"
      px="$4"
      py="$6"
    >
      <Spinner size="large" color="$ink" width={44} height={44} shrink={0} />
      <Text
        render="h1"
        fontSize="$7"
        fontWeight="500"
        color="$ink"
        text="center"
      >
        {title}
      </Text>
      {lede ? (
        <Text fontSize="$4" color="$soft" text="center">
          {lede}
        </Text>
      ) : null}
    </YStack>
  )
}
