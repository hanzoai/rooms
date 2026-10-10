'use client'

/**
 * WHO YOU ARE, at the foot of the sidebar: the person, and the person's menu.
 *
 * The plan leads it — @hanzo/build's `Meter`, the block every account menu opens
 * with: the plan by its family and its windows as shares, the free allowance on
 * Free, the balance only with no plan. Then profile, appearance, usage, billing,
 * API keys, security and sign out — the account, and nothing that belongs to the
 * workspace. Which workspace you stand in is the switcher at the TOP of the
 * sidebar, and what it may spend is its Billing: a plan never sits beside a
 * balance here.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ChevronsUpDown, CreditCard, KeyRound, LogOut, PanelLeftClose, Palette, Shield, UserRound } from 'lucide-react'
import { Meter, useStanding } from '@hanzo/build'
import { XStack, YStack, Text, Box } from '@hanzo/ui'
import { sheet } from '@hanzo/ui/glass'
import { useIam } from '@hanzo/iam/react'
import { useSignOut } from './lib/signout'
import { useAccount } from './lib/account'
import { Face } from './cast'
import { api, iam } from './lib/api'
import { bearer, org } from './lib/session'
import { link } from './lib/tags'
import { showSettings } from './open'
import { site } from './where'

function Row({
  icon,
  onPress,
  children,
}: {
  icon: React.ReactNode
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Box render="button" onClick={onPress} width="100%" px="$3" py="$2" rounded="$2" hoverStyle={{ bg: '$hover' }}>
      <XStack items="center" gap="$2">
        {icon}
        <Text fontSize="$2" color="$ink">
          {children}
        </Text>
      </XStack>
    </Box>
  )
}

/** The block at the foot of the sidebar: press it for the menu. */
export function Account({
  onToggleCollapse,
  onProfile,
  onAppearance,
  onUsage,
  onKeys,
}: {
  onToggleCollapse?: () => void
  /** Opens the profile beside the room. Absent, the row goes to hanzo.id. */
  onProfile?: () => void
  /** Opens the appearance settings. Absent, the row is not drawn. */
  onAppearance?: () => void
  /** Opens the plan's usage settings. Absent, the row is not drawn. */
  onUsage?: () => void
  /** Opens the API keys settings. Absent, the row is not drawn. */
  onKeys?: () => void
} = {}) {
  const { user } = useIam()
  const logout = useSignOut()
  const { user: account } = useAccount()
  const [open, setOpen] = useState(false)
  const holder = useRef<HTMLDivElement>(null)
  const scoped = org()
  const target = useMemo(() => ({ api: api(), token: bearer, org: scoped }), [scoped])
  const plan = useStanding(target, open)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (holder.current && !holder.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const called = account?.name || user?.displayName || user?.name || user?.email || 'You'
  const email = user?.email || ''
  const face = account?.avatar ?? user?.avatar
  const act = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <YStack
      // @ts-expect-error — ref is forwarded to the DOM node by the primitive.
      ref={holder}
      position="relative"
      borderTopWidth={1}
      borderColor="$borderColor"
    >
      {open ? (
        <YStack
          role="menu"
          aria-label="Account"
          position="absolute"
          b="calc(100% + 6px)"
          l="$2"
          r="$2"
          rounded="$3"
          borderWidth={1}
          borderColor="$borderColor"
          {...sheet(2)}
          py="$2"
          gap="$1"
          z="var(--z-modal)"
        >
          <Meter
            read={plan}
            onPlans={act(() => window.location.assign(site('/pricing')))}
            onBilling={act(() => showSettings('billing'))}
          />
          <Box height={1} bg="$borderColor" my="$1" />
          <Row
            icon={<UserRound size={15} aria-hidden />}
            onPress={act(() => (onProfile ? onProfile() : window.location.assign(link(`${iam()}/account`))))}
          >
            Profile
          </Row>
          {onAppearance ? (
            <Row icon={<Palette size={15} aria-hidden />} onPress={act(onAppearance)}>
              Appearance
            </Row>
          ) : null}
          {onUsage ? (
            <Row icon={<Activity size={15} aria-hidden />} onPress={act(onUsage)}>
              Usage
            </Row>
          ) : null}
          <Row icon={<CreditCard size={15} aria-hidden />} onPress={act(() => showSettings('billing'))}>
            Billing
          </Row>
          {onKeys ? (
            <Row icon={<KeyRound size={15} aria-hidden />} onPress={act(onKeys)}>
              API keys
            </Row>
          ) : null}
          <Row icon={<Shield size={15} aria-hidden />} onPress={act(() => window.location.assign(link(`${iam()}/account/security`)))}>
            Security
          </Row>
          <Box height={1} bg="$borderColor" my="$1" />
          <Row icon={<LogOut size={15} aria-hidden />} onPress={act(() => void logout())}>
            Sign out
          </Row>
        </YStack>
      ) : null}

      <XStack items="center" width="100%">
        <Box
          render="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Account"
          flex={1}
          minW={0}
          px="$3"
          py="$2"
          hoverStyle={{ bg: '$hover' }}
        >
          <XStack items="center" gap="$2" minW={0}>
            <Face src={face} name={called} size={22} />
            <YStack flex={1} minW={0} items="flex-start">
              <Text fontSize="$2" fontWeight="600" color="$color" numberOfLines={1}>
                {called}
              </Text>
              {email && email !== called ? (
                <Text fontSize="$1" color="$soft" numberOfLines={1}>
                  {email}
                </Text>
              ) : null}
            </YStack>
            <ChevronsUpDown size={14} aria-hidden />
          </XStack>
        </Box>
        {onToggleCollapse ? (
          <Box
            render="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            p="$2"
            mr="$1.5"
            rounded="$2"
            hoverStyle={{ bg: '$hover' }}
            cursor="pointer"
          >
            <PanelLeftClose size={16} aria-hidden />
          </Box>
        ) : null}
      </XStack>
    </YStack>
  )
}
