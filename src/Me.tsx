'use client'

// The account row at the foot of the app's column, and the menu it opens.
//
// The row says who is signed in and where: the person's face or initials, their
// name, and their role in the organization they work in. The menu lists every
// organization the token names — the personal one first, with its plan — and
// switches with `pick()` (lib/auth/session.ts), the one switch the app has.
// Under the list: Create organization, Organization settings, and Hanzo Team —
// opened in the same organization for a team, offered as "Create a team" for a
// personal one. Then the balance with Add funds, Settings, Usage, the plans,
// help and Log out. A SuperAdmin also gets All organizations (support mode).
//
// IAM is the source of every fact here: names and roles from the token's `orgs`
// claim, display names and which org is personal from `GET /v1/iam/organizations`,
// the plan and balance from billing. An organization is created by the same
// `POST /v1/account/orgs` the no-organization gate uses (components/workspace/
// Orgs.tsx); the next load mints a token that carries it.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Popover, SizableText, View, XStack, YStack } from '@hanzo/gui'
import { Building2, ChevronsUpDown, ExternalLink, Gauge, LifeBuoy, LogOut, Plus, Settings, Sparkles, Users, X } from 'lucide-react'
import { path, useWho, type Host } from '@hanzo/build'
import { useOrganizations } from '@hanzo/iam/react'
import { Button, Dialog, DialogContent, DialogTitle, Input } from '@hanzo/ui'
import { glass } from '@hanzo/ui/glass'
import { formatCents } from '@hanzo/usage'
import { api } from './lib/api'
import { createOrg, say } from './lib/org'
import { useTier, type Tier } from './lib/tier'
import { list } from './lib/list'
import { org as current, orgs, pick, renew, scope, superAdmin } from './lib/session'
import { payPage, planName } from './lib/plans'
import { ENTRY } from './lib/host'
import { SupportPicker } from './Support'
import { BAD } from './lib/mix'

/** The documentation Get help opens. */
const DOCS = 'https://docs.hanzo.ai/docs/dev'
/** Where an organization's own settings live. */
const ORG_SETTINGS = '/settings/organization'
/** An organization this tab created, until the token carries it. */
const MADE = 'hanzo:org:made'

/** One organization as the menu draws it. */
export interface Org {
  name: string
  display: string
  personal: boolean
  role: string
}

/** A role as a person reads it: `owner` → Owner. */
const said = (role: string): string => (role ? role.charAt(0).toUpperCase() + role.slice(1) : '')

/** The first letters of a name, at most two: Antje Worring → AW. */
export const initials = (name: string): string =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?'

/** The plan's name as billing sells it. */
const planOf = (tier: Tier | null): string => (tier ? planName(tier.plan) || tier.tier?.displayName || tier.tier?.name || '' : '')

/**
 * The token's organizations with IAM's rows beside them: display name, and which
 * one is the person's own. The personal organization leads, then the token's order.
 */
function useOrgs(current: string | null): Org[] {
  const { roles } = useOrganizations()
  const names = orgs()
  const [rows, setRows] = useState<{ name?: string; displayName?: string; isPersonal?: boolean }[]>([])
  const key = names.join(',')
  useEffect(() => {
    if (!key) return
    const stop = new AbortController()
    fetch(`${api()}/v1/iam/organizations?limit=100`, { headers: scope(), signal: stop.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { organizations?: unknown } | null) => {
        if (!stop.signal.aborted) setRows(list(body?.organizations))
      })
      .catch(() => {})
    return () => stop.abort()
  }, [key, current])
  const drawn = names.map((name) => {
    const row = rows.find((r) => r?.name === name)
    return { name, display: row?.displayName || name, personal: Boolean(row?.isPersonal), role: roles?.[name] ?? '' }
  })
  return [...drawn.filter((o) => o.personal), ...drawn.filter((o) => !o.personal)]
}

/** The plan of an organization other than the current one: billing, asked in its name. */
function usePlan(org: string | null, enabled: boolean): string {
  const [plan, setPlan] = useState('')
  useEffect(() => {
    if (!enabled || !org) return
    const stop = new AbortController()
    fetch(`${api()}/v1/billing/tier`, { headers: { ...scope(), 'X-Org-Id': org }, signal: stop.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((t: Tier | null) => {
        if (!stop.signal.aborted) setPlan(planOf(t))
      })
      .catch(() => {})
    return () => stop.abort()
  }, [org, enabled])
  return plan
}

/** The person's picture, or their initials. */
export function Face({ host, size = 28 }: { host: Host; size?: number }) {
  const p = host.person
  return (
    <XStack width={size} height={size} rounded={9999} items="center" justify="center" bg="$raised" overflow="hidden" shrink={0} borderWidth={1} borderColor="$borderColor">
      {p?.avatar ? (
        <img src={p.avatar} alt="" width={size} height={size} />
      ) : (
        <SizableText size="$1" fontWeight="600" color="$ink">
          {initials(p?.name || p?.email || '')}
        </SizableText>
      )}
    </XStack>
  )
}

/** One row of the menu: a real button, so Enter, Space and focus are the browser's. */
function Item({
  icon,
  label,
  sub,
  checked,
  onPress,
  trail,
}: {
  icon?: ReactNode
  label: string
  sub?: string
  /** Present on a row of a set: whether it is the chosen one. */
  checked?: boolean
  onPress: () => void
  trail?: ReactNode
}) {
  const radio = checked !== undefined
  return (
    <XStack
      render="button"
      // gui's role union is React Native's, which has no menuitemradio; on the
      // web the attribute reaches the button as written.
      {...({ role: radio ? 'menuitemradio' : 'menuitem' } as object)}
      aria-checked={radio ? checked : undefined}
      data-item=""
      onPress={onPress}
      items="center"
      gap="$2.5"
      px="$2"
      minH={36}
      py="$1.5"
      rounded="$4"
      bg={checked ? '$edge' : 'transparent'}
      hoverStyle={{ bg: '$hover' }}
      focusVisibleStyle={{ bg: '$hover', outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
      cursor="pointer"
      width="100%"
    >
      {icon ? (
        <XStack width={20} justify="center" shrink={0} opacity={0.8}>
          {icon}
        </XStack>
      ) : null}
      {/* A `<button>` centres its text; a menu row reads left. */}
      <YStack flex={1} minW={0}>
        <SizableText size="$2" color="$ink" numberOfLines={1} text="left">
          {label}
        </SizableText>
        {sub ? (
          <SizableText size="$1" color="$soft" numberOfLines={1} text="left">
            {sub}
          </SizableText>
        ) : null}
      </YStack>
      {trail}
    </XStack>
  )
}

const Rule = () => <XStack height={1} bg="$borderColor" my="$1" mx="$1" />
const Label = ({ children }: { children: string }) => (
  <SizableText size="$1" color="$soft" px="$2" pt="$1.5" pb="$1">
    {children}
  </SizableText>
)

/** An organization's mark in the list: its initials on a rounded square. */
const Mark = ({ org }: { org: Org }) => (
  <XStack width={20} height={20} rounded="$2" items="center" justify="center" bg="$raised" shrink={0}>
    {org.personal ? (
      <SizableText size="$1" fontWeight="600" color="$ink">
        {initials(org.display)}
      </SizableText>
    ) : (
      <Building2 size={12} aria-hidden />
    )}
  </XStack>
)

/** Arrows, Home and End move between the menu's rows; Escape closes it. */
function rove(e: KeyboardEvent<HTMLDivElement>, close: () => void) {
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-item]')]
  const at = rows.indexOf(document.activeElement as HTMLElement)
  const to =
    e.key === 'ArrowDown' ? (at + 1) % rows.length : e.key === 'ArrowUp' ? (at - 1 + rows.length) % rows.length : e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : -2
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (to === -2 || !rows.length) return
  e.preventDefault()
  rows[to]?.focus()
}

export function Me({
  host,
  narrow = false,
  onOrg,
}: {
  host: Host
  /** The collapsed rail's: the face alone, the menu opening beside it. */
  narrow?: boolean
  /** Work in another organization: picked, then the app opened in it. */
  onOrg: (org: string) => void
}) {
  const menu = useWho()
  const [creating, setCreating] = useState(false)
  const [supporting, setSupporting] = useState(false)
  const row = useRef<HTMLElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)
  const current = host.org
  const all = useOrgs(current)
  const here = all.find((o) => o.name === current) ?? null
  const personal = all.find((o) => o.personal) ?? null
  const { tier } = useTier(menu.open, current)
  const other = usePlan(personal && personal.name !== current ? personal.name : null, menu.open)
  const planFor = (o: Org) => (o.name === current ? planOf(tier) : o.personal ? other : '')
  const who = host.person?.name || host.person?.email || ''
  const where = [said(here?.role ?? ''), here?.display ?? current].filter(Boolean).join(' · ')

  // The organization in use takes focus once the menu is drawn — after the
  // popover has placed its own focus — so the keys reach the rows at once.
  const land = (node: HTMLDivElement | null) => {
    content.current = node
    if (!node) return
    requestAnimationFrame(() =>
      requestAnimationFrame(() => (node.querySelector<HTMLElement>('[data-item][aria-checked="true"]') ?? node.querySelector<HTMLElement>('[data-item]'))?.focus()),
    )
  }
  const close = () => {
    menu.onOpenChange(false)
    row.current?.focus()
  }
  const go = (p: string) => {
    menu.onOpenChange(false)
    host.go(p)
  }

  if (!host.person) return null
  return (
    <>
      <Popover open={menu.open} onOpenChange={menu.onOpenChange} placement={narrow ? 'right-end' : 'top-start'} allowFlip stayInFrame offset={8}>
        <Popover.Anchor width="100%">
          <XStack
            ref={(el: unknown) => {
              row.current = el instanceof HTMLElement ? el : null
            }}
            render="button"
            data-slot="me"
            // The name the gates and a screen reader know it by: who, and in which organization.
            aria-label={`Account: ${[who, current].filter(Boolean).join(' · ')}`}
            aria-haspopup="menu"
            aria-expanded={menu.open}
            onPress={menu.toggle}
            width={narrow ? 40 : '100%'}
            minH={narrow ? 40 : 48}
            px={narrow ? 0 : '$2'}
            gap="$2.5"
            rounded={narrow ? 999 : '$5'}
            items="center"
            justify={narrow ? 'center' : 'flex-start'}
            hoverStyle={{ bg: '$hover' }}
            focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
            cursor="pointer"
          >
            <Face host={host} size={narrow ? 30 : 32} />
            {narrow ? null : (
              <>
                <YStack flex={1} minW={0}>
                  <SizableText size="$3" fontWeight="600" color="$ink" numberOfLines={1} text="left">
                    {who}
                  </SizableText>
                  {where ? (
                    <SizableText size="$1" color="$soft" numberOfLines={1} text="left">
                      {where}
                    </SizableText>
                  ) : null}
                </YStack>
                <ChevronsUpDown size={14} aria-hidden opacity={0.6} />
              </>
            )}
          </XStack>
        </Popover.Anchor>
        <Popover.Content {...glass(2)} items="stretch" borderWidth={1} rounded="$6" p="$1.5" width={288} maxW="calc(100vw - 16px)" maxH="calc(100dvh - 32px)" overflowY="auto" overflowX="hidden">
          <View render={<div ref={land} role="menu" aria-label="Account" onKeyDown={(e) => rove(e, close)} />} self="stretch" minW={0}>
          <YStack gap={2}>
            <SizableText size="$2" color="$soft" px="$2" py="$1.5" numberOfLines={1}>
              {host.person.email || who}
            </SizableText>
            <Rule />
            <Label>Organizations</Label>
            <YStack role="group" aria-label="Organizations" gap={2}>
              {all.map((o) => (
                <Item
                  key={o.name}
                  icon={<Mark org={o} />}
                  label={o.display}
                  sub={[o.personal ? 'Personal' : said(o.role), planFor(o)].filter(Boolean).join(' · ')}
                  checked={o.name === current}
                  onPress={() => {
                    menu.onOpenChange(false)
                    if (o.name !== current) onOrg(o.name)
                  }}
                />
              ))}
            </YStack>
            <Item icon={<Plus size={15} aria-hidden />} label="Create organization" onPress={() => (menu.onOpenChange(false), setCreating(true))} />
            <Item icon={<Settings size={15} aria-hidden />} label="Organization settings" onPress={() => (menu.onOpenChange(false), window.location.assign(ORG_SETTINGS))} />
            {here && !here.personal ? (
              <Item
                icon={<Users size={15} aria-hidden />}
                label="Open in Hanzo Team"
                trail={<ExternalLink size={13} aria-hidden opacity={0.6} />}
                onPress={() => (menu.onOpenChange(false), window.location.assign(`${ENTRY}&org=${encodeURIComponent(here.name)}`))}
              />
            ) : (
              <Item icon={<Users size={15} aria-hidden />} label="Create a team" onPress={() => (menu.onOpenChange(false), setCreating(true))} />
            )}
            {superAdmin() ? (
              <Item icon={<Building2 size={15} aria-hidden />} label="All organizations" onPress={() => (menu.onOpenChange(false), setSupporting(true))} />
            ) : null}
            <Rule />
            <Item
              icon={<Sparkles size={15} aria-hidden />}
              label="Add funds"
              sub={typeof tier?.balance?.effectiveAvailable === 'number' ? `Credits ${formatCents(tier.balance.effectiveAvailable)}` : 'Credits'}
              onPress={() => (menu.onOpenChange(false), window.open(payPage(), '_blank', 'noopener'))}
              trail={<ExternalLink size={13} aria-hidden opacity={0.6} />}
            />
            <Item icon={<Settings size={15} aria-hidden />} label="Settings" onPress={() => go(path({ kind: 'settings', section: 'general' }))} />
            <Item icon={<Gauge size={15} aria-hidden />} label="Usage" onPress={() => go(path({ kind: 'settings', section: 'usage' }))} />
            <Item icon={<Sparkles size={15} aria-hidden />} label="View all plans" onPress={() => go(path({ kind: 'screen', screen: 'plans' }))} />
            <Item icon={<LifeBuoy size={15} aria-hidden />} label="Get help" onPress={() => (menu.onOpenChange(false), window.open(DOCS, '_blank', 'noopener,noreferrer'))} />
            {host.signOut ? (
              <>
                <Rule />
                <Item icon={<LogOut size={15} aria-hidden />} label="Log out" onPress={() => (menu.onOpenChange(false), host.signOut?.())} />
              </>
            ) : null}
          </YStack>
          </View>
        </Popover.Content>
      </Popover>
      <Create open={creating} onOpenChange={setCreating} />
      {supporting ? <SupportPicker onClose={() => setSupporting(false)} /> : null}
    </>
  )
}

/**
 * The sheet that creates an organization: a name, then `POST /v1/account/orgs`,
 * the creator's own. The token in hand predates it, so it is renewed and the app
 * reloads in the new organization; `Made` says so if the new token does not carry
 * it yet.
 */
function Create({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState('')
  useEffect(() => {
    if (open) {
      setName('')
      setRefused('')
    }
  }, [open])
  const submit = async () => {
    const words = name.trim()
    if (!words) return setRefused('Give it a name.')
    if (busy) return
    setBusy(true)
    setRefused('')
    try {
      const org = await createOrg(words)
      try {
        sessionStorage.setItem(MADE, JSON.stringify({ org, name: words, from: current() }))
      } catch {
        /* the next load simply says nothing */
      }
      pick(org)
      renew()
      window.location.assign('/')
    } catch (e) {
      setRefused(say(e))
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={440} rounded="$6" gap="$3">
        <DialogTitle>Create organization</DialogTitle>
        <SizableText size="$2" color="$soft">
          You own it. Agents, credits and members belong to it, and you switch to it from this menu.
        </SizableText>
        <Input
          autoFocus
          value={name}
          onChangeText={setName}
          aria-label="Organization name"
          placeholder="Acme"
          maxLength={80}
          onKeyDown={(e: { key?: string }) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        {refused ? (
          <SizableText size="$1" color={BAD} role="alert">
            {refused}
          </SizableText>
        ) : null}
        <XStack gap="$2" justify="flex-end">
          <Button size="sm" variant="outline" rounded={999} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" rounded={999} disabled={busy || !name.trim()} onPress={() => void submit()}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}

/**
 * What became of an organization this tab created: nothing to say once the token
 * carries it (the app is already in it), and a plain line while it does not.
 */
export function Made() {
  const [made, setMade] = useState<{ org: string; name: string } | null>(null)
  useEffect(() => {
    try {
      const kept = JSON.parse(sessionStorage.getItem(MADE) || 'null') as { org?: string; name?: string; from?: string | null } | null
      if (!kept?.org) return
      if (orgs().includes(kept.org)) return sessionStorage.removeItem(MADE)
      // Still out of the token: go on working where the person was.
      if (kept.from && current() !== kept.from && orgs().includes(kept.from)) {
        pick(kept.from)
        return window.location.reload()
      }
      setMade({ org: kept.org, name: kept.name || kept.org })
    } catch {
      /* nothing kept */
    }
  }, [])
  if (!made) return null
  const dismiss = () => {
    try {
      sessionStorage.removeItem(MADE)
    } catch {
      /* gone with the tab */
    }
    setMade(null)
  }
  return (
    <XStack data-slot="made" role="status" items="flex-start" gap="$2" px="$3" py="$2.5" rounded="$5" borderWidth={1} borderColor="$borderColor" bg="$edge">
      <SizableText flex={1} minW={0} size="$1" color="$ink">
        {`${made.name} was created, and your sign-in does not include it yet, so you are still in this organization. It appears here once IAM adds you to it.`}
      </SizableText>
      <XStack render="button" aria-label="Dismiss" onPress={dismiss} p="$1" rounded={999} hoverStyle={{ bg: '$hover' }}>
        <X size={13} aria-hidden />
      </XStack>
    </XStack>
  )
}
