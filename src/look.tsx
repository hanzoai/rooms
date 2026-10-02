"use client";

/**
 * HOW THE APP LOOKS.
 *
 * One panel, `@hanzo/appearance`'s: theme, type, spacing, corners and accent,
 * resolved for the organization in scope and kept with the person's IAM
 * account, so it follows them to every Hanzo surface. The theme used to be a
 * row of its own here, written to next-themes and to IAM's per-subject key —
 * two more places a theme lived, neither of which crossed an origin.
 */

import { Text, YStack } from "@hanzo/ui";
import { Appearance } from "@hanzo/appearance";
import { useIam } from "@hanzo/iam/react";
import { iam } from "./lib/api";
import { useOrg } from "./host";
import { brand } from "./where";

export function Look() {
  const { accessToken } = useIam();
  const org = useOrg();

  return (
    <YStack gap="$3" maxW={420}>
      <Text fontSize="$3" color="$soft">
        Kept with your account, so it follows you to every Hanzo surface.
      </Text>
      {/* The account copy lives on /v1/iam/preferences of the IAM this app
          signs into, read and written with the reader's own bearer. */}
      <Appearance
        org={org.id}
        orgName={org.name || brand()}
        account={{ base: iam(), token: accessToken ?? undefined }}
      />
    </YStack>
  );
}
