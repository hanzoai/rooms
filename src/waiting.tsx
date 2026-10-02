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
 * It takes the space a short message needs and leaves the rest to the layout.
 */
export function Waiting({ title, lede }: { title: string; lede?: string }) {
  return (
    <YStack
      items="center"
      justify="center"
      gap="$5"
      minH={360}
      px="$4"
      py="$10"
    >
      <Spinner size="small" color="$ink" width={28} height={28} shrink={0} />
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
