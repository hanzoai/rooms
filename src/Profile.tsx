'use client'

// The reader's own profile, in the column beside the room.
//
// A WORKSPACE OPENS A PROFILE IN A PANEL, not a page. The page exists — it is
// Settings (/settings), where the whole record is edited — but reaching it from a
// conversation costs the conversation: the room, the sidebar and the rail all
// go, and coming back is a navigation rather than a close. Slack, Teams and
// every app shaped like them put this in the right column for that reason, and
// so does the thread view that will share this slot.
//
// EVERY CONTROL DOES ITS VERB. Slack's panel carries "Set a status" and "View
// as" and this one does not, because IAM stores no status and there is nobody
// to view as. What is here is what there is: the picture can be changed, the
// record can be edited, and the rest is read.

import { useRooms } from './host'
import { site } from './where'
import { useRef, useState } from 'react'
import { Camera, Mail, Phone, X } from 'lucide-react'
import { Box, Text, View, XStack, YStack } from '@hanzo/ui'
import { sheet } from '@hanzo/ui/glass'
import { pane } from './ground'
import { useAccount } from './lib/account'
import { reach } from './lib/reach'
import { mark } from './lib/mark'
import { BAD } from './lib/mix'

/** Slack's is 380 and the thread panel that shares this slot is the same. */
const WIDTH = 380

const ACCOUNT = '/settings'

export function Profile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { Link } = useRooms()
  const { user, updateUserProfile } = useAccount()
  const picker = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  if (!open || !user) return null

  const pick = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setFailed(null)
    try {
      await updateUserProfile({ avatar: await mark(file) })
    } catch (e) {
      // In the panel rather than a toast: the picture is here, so the reason it
      // did not change belongs here too.
      setFailed(reach(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack
      {...pane(sheet(2).backgroundColor)}
      width={WIDTH}
      maxW="100%"
      shrink={0}
      minH={0}
      // A column on a laptop. On a phone the room is already the whole screen,
      // so this covers it rather than squeezing it to nothing.
      position="absolute"
      t={0}
      r={0}
      b={0}
      l={0}
      z="var(--z-panel)"
      $lg={{ position: 'relative', z: 'var(--z-base)', l: 'auto' }}
    >
      <XStack items="center" px="$4" py="$3" gap="$2">
        <Text flex={1} fontSize="$5" fontWeight="600" color="$ink">
          Profile
        </Text>
        <Box
          render="button"
          onClick={onClose}
          aria-label="Close profile"
          p="$2"
          rounded="$2"
          hoverStyle={{ bg: '$hover' }}
        >
          <X size={16} aria-hidden />
        </Box>
      </XStack>

      <YStack flex={1} minH={0} overflowY="auto" overflowX="hidden" px="$4" pb="$5" gap="$4">
        {/* THE PICTURE IS THE CONTROL. A square that says "change me" on hover
            is one target instead of an image beside a button, and it is where a
            reader's cursor already is. */}
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            void pick(file)
          }}
        />
        <Box
          render="button"
          onClick={() => {
            if (busy) return
            picker.current?.click()
          }}
          aria-label="Change your picture"
          aria-disabled={busy}
          width="100%"
          aspectRatio={1}
          rounded="$5"
          overflow="hidden"
          borderWidth={1}
          borderColor="$borderColor"
          bg="$raised"
          position="relative"
        >
          {user.avatar ? (
            <View render={<img src={user.avatar} alt="" />} width="100%" height="100%" objectFit="cover" display="block" />
          ) : (
            <YStack width="100%" height="100%" items="center" justify="center">
              <Text fontSize={72} fontWeight="600" color="$soft">
                {(user.name?.trim()[0] ?? '?').toUpperCase()}
              </Text>
            </YStack>
          )}
          <XStack
            position="absolute"
            l={0}
            r={0}
            b={0}
            items="center"
            justify="center"
            gap="$2"
            py="$2"
            bg="$background"
            opacity={0.85}
          >
            <Camera size={14} aria-hidden />
            <Text fontSize="$2" color="$ink">
              {busy ? 'Saving…' : user.avatar ? 'Change picture' : 'Add a picture'}
            </Text>
          </XStack>
        </Box>

        {failed ? (
          <Text fontSize="$2" color={BAD}>
            {failed}
          </Text>
        ) : null}

        <XStack items="baseline" gap="$3">
          <Text flex={1} fontSize="$6" fontWeight="600" color="$ink" numberOfLines={2}>
            {user.name}
          </Text>
          <Link href={site(ACCOUNT)}>
            <Text fontSize="$2" color="$quiet">
              Edit
            </Text>
          </Link>
        </XStack>

        {user.bio ? (
          <Text fontSize="$3" color="$soft">
            {user.bio}
          </Text>
        ) : null}

        <YStack gap="$2" pt="$3" borderTopWidth={1} borderColor="$edge">
          <Text fontSize="$2" fontWeight="600" color="$ink">
            Contact information
          </Text>
          <XStack items="center" gap="$2">
            <Mail size={14} aria-hidden />
            <Text fontSize="$3" color="$soft">
              {user.email}
            </Text>
          </XStack>
          {user.phone ? (
            <XStack items="center" gap="$2">
              <Phone size={14} aria-hidden />
              <Text fontSize="$3" color="$soft">
                {user.phone}
              </Text>
            </XStack>
          ) : null}
        </YStack>
      </YStack>
    </YStack>
  )
}
