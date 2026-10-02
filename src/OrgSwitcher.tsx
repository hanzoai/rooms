'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Check, ChevronDown, Plus, Settings } from 'lucide-react'
import { HanzoMark } from '@hanzogui/shell'
import { useOrganizations } from '@hanzo/iam/react'
import { Button } from '@hanzo/ui'
import { useAccount } from './lib/account'
import { iam } from './lib/api'
import { pick } from './lib/session'
import { Text, View, XStack, YStack, type GuiElement } from '@hanzo/gui'
import { site } from './host'

/** design's smallest rung (`--text-floor`, 10px), below gui's `$1`; gui's font size takes a rung or a number. */
const FLOOR = 10
/** A row at the foot of the menu that leaves for another page: a ghost Button, label to the left. */
const LINK = { variant: 'ghost', size: 'sm', width: '100%', justify: 'flex-start' } as const

export interface OrganizationItem {
  id: string
  name: string
  displayName: string
  logo?: string
  avatar?: string
  role?: string
  isPersonal?: boolean
}

export function OrgSwitcherDropdown({
  open,
  onClose,
  activeOrgId,
  onSelect,
  align = 'left',
  side = 'below',
  triggerRef,
}: {
  open: boolean
  onClose: () => void
  activeOrgId: string
  onSelect: (orgId: string) => void
  align?: 'left' | 'right'
  /** Which way it opens: below the trigger, above it, or to the right (rail). */
  side?: 'below' | 'above' | 'rail'
  triggerRef?: React.RefObject<GuiElement | null>
}) {
  const { organizations: iamOrgs, switchOrg } = useOrganizations() || {}
  const { organizations: accountOrgs, switchOrganization } = useAccount() || {}
  const menuRef = useRef<GuiElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const trigger = triggerRef?.current as HTMLElement | null | undefined
      const menu = menuRef.current as HTMLElement | null
      if (trigger && trigger.contains(e.target as Node)) {
        return
      }
      if (menu && !menu.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose, triggerRef])

  const orgs: OrganizationItem[] = useMemo(() => {
    const map = new Map<string, OrganizationItem>()

    // Add detected account orgs
    for (const o of (accountOrgs ?? [])) {
      const item = o as any
      const id = item.id || item.name
      if (id) {
        map.set(id, {
          id,
          name: item.name || id,
          displayName: item.displayName || item.name || id,
          logo: item.logo || item.avatar,
          role: item.role || 'member',
          isPersonal: Boolean(item.isPersonal),
        })
      }
    }

    // Add detected IAM orgs
    for (const o of (iamOrgs ?? [])) {
      const item = o as any
      const id = item.id || item.name
      if (id && !map.has(id)) {
        map.set(id, {
          id,
          name: item.name || id,
          displayName: item.displayName || item.name || id,
          logo: item.logo || item.avatar,
          role: item.role || 'member',
          isPersonal: Boolean(item.isPersonal),
        })
      }
    }

    return Array.from(map.values())
  }, [accountOrgs, iamOrgs])

  if (!open) return null

  // Where it opens. The offset rides a margin, so each edge is a plain length gui can take.
  const position =
    side === 'rail'
      ? ({ l: '100%', ml: 10, t: -4 } as const)
      : side === 'above'
      ? ({ b: '100%', mb: 6, ...(align === 'left' ? { l: 0 } : { r: 0 }) } as const)
      : ({ t: '100%', mt: 6, ...(align === 'left' ? { l: 0 } : { r: 0 }) } as const)

  return (
    <YStack
      ref={menuRef}
      position="absolute"
      {...position}
      width={260}
      maxW="calc(100vw - 24px)"
      bg="var(--popover)"
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
      boxShadow="var(--shadow-lg)"
      z="var(--z-dropdown)"
      p={6}
      gap={2}
    >
      <Text pt={6} px={10} pb={4} fontSize="$1" fontWeight="600" color="$faint" textTransform="uppercase" letterSpacing={0.6}>
        Workspaces
      </Text>

      {orgs.length === 0 ? (
        <Text pt={6} px={10} pb={10} fontSize="$2" color="$faint">
          No workspaces on this account yet.
        </Text>
      ) : null}

      {orgs.map((o) => {
        const isSelected = o.id === activeOrgId || o.name === activeOrgId
        return (
          <Button
            key={o.id}
            variant="ghost"
            onClick={() => {
              pick(o.id)
              if (switchOrg) switchOrg(o.id)
              if (switchOrganization) switchOrganization(o.id)
              onSelect(o.id)
              onClose()
            }}
            width="100%"
            justify="space-between"
            px={10}
            py={6}
            bg={isSelected ? '$hover' : 'transparent'}
          >
            <XStack items="center" gap={10} minW={0} shrink={1}>
              <Text
                width={24}
                height={24}
                rounded={6}
                bg="$raised"
                display="flex"
                items="center"
                justify="center"
                fontSize="$2"
                fontWeight="700"
                color="$ink"
                shrink={0}
                overflow="hidden"
              >
                {o.logo ? (
                  <View render={<img src={o.logo} alt="" />} width="100%" height="100%" objectFit="cover" />
                ) : (o.displayName.toLowerCase().includes('hanzo') || o.name.toLowerCase().includes('hanzo')) ? (
                  <HanzoMark size={14} />
                ) : (
                  o.name.slice(0, 3).toUpperCase()
                )}
              </Text>
              <YStack minW={0} shrink={1} items="flex-start">
                <Text
                  fontSize="$2"
                  fontWeight={isSelected ? '600' : '500'}
                  color="$ink"
                  whiteSpace="nowrap"
                  overflow="hidden"
                  textOverflow="ellipsis"
                >
                  {o.displayName}
                </Text>
                {o.role ? (
                  <Text fontSize={FLOOR} color="$faint">
                    {o.role}
                  </Text>
                ) : null}
              </YStack>
            </XStack>

            {isSelected ? <Check size={14} color="currentColor" /> : null}
          </Button>
        )
      })}

      <View height={1} bg="$borderColor" my={4} />

      <Button asChild {...LINK}>
        <a href={iam()} target="_blank" rel="noreferrer">
          <Plus size={14} />
          Create Organization
        </a>
      </Button>

      <Button asChild {...LINK}>
        <a href={site("/account/organization")}>
          <Settings size={14} />
          Organization Settings
        </a>
      </Button>
    </YStack>
  )
}

/**
 * THE WORKSPACE YOU ARE STANDING IN, and the way to another one.
 *
 * IT NAMES THE ORG OR IT NAMES NOTHING. The label fell through to the literal
 * "Hanzo AI" — so a reader in no org, or one whose IAM read had not landed, was
 * told they were inside a company they may have nothing to do with, and the
 * corner that exists to say WHERE YOU ARE was the one part of the app most
 * confidently wrong. `selectedLocal` did the same for the id: `'hanzo'` before
 * IAM answered, which is also the id a press would have switched to.
 */
export function TopOrgSelector() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<GuiElement>(null)
  const { currentOrg, currentOrgId } = useOrganizations()
  const { currentOrganization } = useAccount()

  const activeOrg:
    | { id?: string; name?: string; displayName?: string; logo?: string; avatar?: string }
    | undefined = currentOrganization || currentOrg
  const face = activeOrg?.logo || activeOrg?.avatar
  const activeOrgId = activeOrg?.name || activeOrg?.id || currentOrgId || 'hanzo'
  const activeOrgName = activeOrg?.displayName || activeOrg?.name || 'hanzo'

  return (
    <XStack position="relative" display="inline-flex" items="center">
      <Button
        ref={buttonRef}
        size="sm"
        variant={open ? 'secondary' : 'default'}
        onClick={() => setOpen((v) => !v)}
        gap={6}
        pl={6}
        pr={8}
        aria-label="Switch organization"
      >
        {/* The disc behind the mark is neutral. A brand colour here is the ORG's
            to supply — `face` is its own logo when IAM holds one — and a fixed
            blue put one workspace's colour behind every workspace's face. */}
        <XStack width={20} height={20} rounded={9999} bg="$raised" items="center" justify="center" overflow="hidden">
          {face ? (
            <View render={<img src={face} alt="" width={20} height={20} />} width="100%" height="100%" objectFit="cover" />
          ) : (
            <HanzoMark size={13} />
          )}
        </XStack>

        <Text
          fontSize="$2"
          fontWeight="600"
          color="$ink"
          maxW={140}
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {activeOrgName}
        </Text>
        <ChevronDown size={13} opacity={0.65} />
      </Button>

      <OrgSwitcherDropdown
        open={open}
        onClose={() => setOpen(false)}
        activeOrgId={activeOrgId}
        onSelect={() => setOpen(false)}
        triggerRef={buttonRef}
      />
    </XStack>
  )
}
