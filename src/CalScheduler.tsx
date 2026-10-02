'use client'

import React, { useState, useEffect } from 'react'
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Bot,
  Video,
  ExternalLink,
  Zap,
  Trash2,
  X,
} from 'lucide-react'
import { Text, View, XStack, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'

export interface CalendarEvent {
  id: string
  title: string
  type: 'meeting' | 'bot_automation' | 'agent_query'
  date: string // YYYY-MM-DD
  time: string // HH:MM
  duration: string // e.g. "30m"
  botName?: string
  meetUrl?: string
  description?: string
  cronPattern?: string
  status: 'scheduled' | 'running' | 'completed'
}

const DEFAULT_EVENTS: CalendarEvent[] = [
  {
    id: 'evt-1',
    title: 'Daily Morning AI Intelligence Digest',
    type: 'bot_automation',
    date: '2026-09-04',
    time: '09:00',
    duration: '15m',
    botName: 'Chief',
    cronPattern: '0 9 * * 1-5',
    description: 'Scrape breaking frontier AI papers, benchmark shifts, and repo PRs into team Slack.',
    status: 'scheduled',
  },
  {
    id: 'evt-2',
    title: 'Platform Architecture & Inference Sync',
    type: 'meeting',
    date: '2026-09-04',
    time: '18:00',
    duration: '45m',
    meetUrl: 'https://meet.hanzo.ai/platform-architecture',
    botName: 'Hanzo Coder (Bot Co-pilot)',
    description: 'Sync on port 9005 drive server performance and ingress routing.',
    status: 'scheduled',
  },
  {
    id: 'evt-3',
    title: 'Autonomous Outbound Prospecting Run',
    type: 'bot_automation',
    date: '2026-09-04',
    time: '11:00',
    duration: '60m',
    botName: 'Sales Outbound',
    cronPattern: '0 11 * * 1-5',
    description: 'Extract 50 lookalike enterprise leads and prepare personalized drafts.',
    status: 'scheduled',
  },
  {
    id: 'evt-4',
    title: 'Hourly GitHub PR & Typecheck Review',
    type: 'agent_query',
    date: '2026-09-04',
    time: '14:00',
    duration: '20m',
    botName: 'Hanzo Coder',
    cronPattern: '0 * * * *',
    description: 'Verify type safety and lint across all open PRs in hanzoai organization.',
    status: 'scheduled',
  },
  {
    id: 'evt-5',
    title: 'Research Review',
    type: 'meeting',
    date: '2026-09-04',
    time: '20:00',
    duration: '60m',
    meetUrl: 'https://meet.hanzo.ai/research-review',
    botName: 'Hanzo Researcher',
    description: 'Review datasets and proofs for the week’s research runs.',
    status: 'scheduled',
  },
]

/** The public booking pages, one card each on the Booker tab. */
const BOOKINGS = [
  {
    title: 'Quick Sync',
    duration: '15m',
    slug: '15min',
    description: 'Fast 15-minute alignment or triage call on Hanzo Meet.',
  },
  {
    title: 'Technical Deep Dive',
    duration: '30m',
    slug: '30min',
    description: 'In-depth architectural review, bug diagnosis, or sprint planning.',
  },
  {
    title: 'AI Pair Programming',
    duration: '45m',
    slug: 'pair-ai',
    description: 'Interactive coding session with Hanzo Coder assisting in the terminal.',
  },
  {
    title: 'Executive & Strategy Sync',
    duration: '60m',
    slug: '60min',
    description: 'Quarterly roadmap sync, partnerships, and leadership decision forum.',
  },
] as const

/** design's smallest rung (`--text-floor`, 10px), below gui's `$1`; gui's font size takes a rung or a number. */
const FLOOR = 10
const MODAL = 'var(--z-modal)'
/** One field of the dialog: the box every input, select and textarea in it draws. */
const FIELD = {
  width: '100%',
  py: 8,
  bg: '$background',
  borderWidth: 1,
  borderColor: 'var(--border-control)',
  rounded: 6,
  color: '$ink',
  fontSize: '$2',
} as const
/** A dialog label. */
const LABEL = { render: 'label', fontSize: '$1', color: '$soft', mb: 4, display: 'block' } as const

export function CalScheduler() {
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('hanzo_calendar_events_v1')
        if (stored) return JSON.parse(stored)
      } catch {}
    }
    return DEFAULT_EVENTS
  })

  const [activeTab, setActiveTab] = useState<'scheduler' | 'booker' | 'automations'>('scheduler')
  const [filterType, setFilterType] = useState<'all' | 'meeting' | 'bot_automation' | 'agent_query'>('all')
  const [showModal, setShowModal] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: '',
    type: 'bot_automation' as 'meeting' | 'bot_automation' | 'agent_query',
    date: '2026-09-04',
    time: '10:00',
    duration: '30m',
    botName: 'Chief',
    description: '',
  })

  useEffect(() => {
    try {
      localStorage.setItem('hanzo_calendar_events_v1', JSON.stringify(events))
    } catch {}
  }, [events])

  const filteredEvents = events.filter((e) => {
    if (filterType === 'all') return true
    return e.type === filterType
  })

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEvent.title.trim()) return

    const created: CalendarEvent = {
      id: `evt-${Date.now()}`,
      title: newEvent.title.trim(),
      type: newEvent.type,
      date: newEvent.date,
      time: newEvent.time,
      duration: newEvent.duration,
      botName: newEvent.botName,
      description: newEvent.description,
      meetUrl:
        newEvent.type === 'meeting'
          ? `https://meet.hanzo.ai/${newEvent.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
          : undefined,
      status: 'scheduled',
    }

    setEvents((prev) => [created, ...prev])
    setShowModal(false)
    setNewEvent({
      title: '',
      type: 'bot_automation',
      date: '2026-09-04',
      time: '10:00',
      duration: '30m',
      botName: 'Chief',
      description: '',
    })
  }

  const handleDeleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <YStack width="100%" height="100%" bg="$background" overflowX="auto" overflowY="auto">
      {/* Top Header: one row from a laptop; on a phone the controls wrap under the title rather than clip it. */}
      <XStack
        minH={56}
        px={24}
        py={8}
        gap={10}
        flexWrap="wrap"
        bg="$panel"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        items="center"
        justify="space-between"
      >
        {/* Every part of this bar gives way on a phone, as a block box would: shrinking, never below its content. */}
        <XStack items="center" gap={12} shrink={1} minW="auto">
          <XStack width={32} height={32} rounded={8} bg="$raised" items="center" justify="center" shrink={1} minW="auto">
            <CalendarIcon size={18} color="var(--foreground)" />
          </XStack>
          <YStack shrink={1} minW="auto">
            <XStack items="center" gap={8}>
              <Text fontSize="$4" fontWeight="700" color="$ink">Hanzo Calendar &amp; Scheduler</Text>
              <Text
                fontSize={FLOOR}
                fontWeight="700"
                bg="$hover"
                color="$soft"
                borderWidth={1}
                borderColor="$borderColor"
                px={6}
                py={1}
                rounded={4}
              >
                cal.hanzo.ai
              </Text>
            </XStack>
            <Text fontSize="$1" color="$soft">
              Full unified scheduler across meetings, bot routines, automated crons, and query triggers
            </Text>
          </YStack>
        </XStack>

        <XStack items="center" gap={10} shrink={1} minW="auto" flexWrap="wrap">
          <XStack
            items="center"
            gap={2}
            bg="$hover"
            rounded={8}
            p={2}
            borderWidth={1}
            borderColor="$borderColor"
            shrink={1}
            minW="auto"
          >
            {[
              { id: 'scheduler', label: 'Master Schedule' },
              { id: 'automations', label: 'Bot Crons' },
              { id: 'booker', label: 'Public Booker' },
            ].map((tab) => (
              <Button
                key={tab.id}
                size="sm"
                variant={activeTab === tab.id ? 'primary' : 'ghost'}
                {...(activeTab === tab.id ? null : { color: '$soft' })}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id as any)}
              >
                {tab.label}
              </Button>
            ))}
          </XStack>

          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            <Plus size={14} />
            Schedule Event / Routine
          </Button>
        </XStack>
      </XStack>

      {/* Main Content Area */}
      {activeTab === 'booker' ? (
        /* Embed of cal.hanzo.ai Booker or Native Event Types */
        <YStack flex={1} p={28} overflowY="auto" gap={20}>
          <YStack gap={4}>
            <Text fontSize="$7" fontWeight="800" color="$ink">Public Booking Pages</Text>
            <Text fontSize="$2" color="$soft">
              Shareable links powered by the Cal.com fork at <Text render={<a href="https://cal.hanzo.ai" target="_blank" rel="noopener noreferrer" />} color="$ink" textDecorationLine="underline">cal.hanzo.ai</Text>. Allows teammates, clients, and automated agents to book dedicated time slots.
            </Text>
          </YStack>

          <View display="grid" gridTemplateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={16}>
            {BOOKINGS.map((card) => (
              <YStack
                key={card.slug}
                bg="$panel"
                borderWidth={1}
                borderColor="$borderColor"
                rounded={10}
                p={18}
                gap={12}
              >
                <XStack items="center" justify="space-between">
                  <Text fontSize="$4" fontWeight="700" color="$ink">
                    {card.title}
                  </Text>
                  <Text fontSize="$1" fontWeight="700" bg="$hover" px={8} py={2} rounded={4} color="$soft">
                    {card.duration}
                  </Text>
                </XStack>

                <Text fontSize="$2" color="$soft" lineHeight="$2">
                  {card.description}
                </Text>

                <Text px={10} py={8} bg="$sunken" rounded={6} fontSize="$1" fontFamily="$mono" color="$soft">
                  https://cal.hanzo.ai/alex/{card.slug}
                </Text>

                <XStack gap={8} mt={4}>
                  <Button
                    size="sm"
                    flex={1}
                    onClick={() => {
                      navigator.clipboard.writeText(`https://cal.hanzo.ai/alex/${card.slug}`)
                    }}
                  >
                    Copy Link
                  </Button>
                  <Button asChild variant="primary" size="sm">
                    <a href={`https://cal.hanzo.ai/alex/${card.slug}`} target="_blank" rel="noopener noreferrer">
                      Open
                      <ExternalLink size={12} />
                    </a>
                  </Button>
                </XStack>
              </YStack>
            ))}
          </View>
        </YStack>
      ) : (
        /* Master Schedule & Automations Grid */
        <YStack flex={1} overflow="hidden">
          {/* Subheader Filters */}
          <XStack
            px={24}
            py={12}
            bg="$panel"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
            items="center"
            justify="space-between"
            flexWrap="wrap"
            gap={8}
          >
            <XStack items="center" gap={8} shrink={1} minW="auto" flexWrap="wrap">
              <Text fontSize="$2" fontWeight="600" color="$soft">Filter:</Text>
              {/* The kinds wear the same monochrome glyphs their event tiles do, never a colour emoji. */}
              {([
                { id: 'all', label: 'All Items' },
                { id: 'meeting', label: 'Human Meetings', icon: Video },
                { id: 'bot_automation', label: 'Bot Routines', icon: Bot },
                { id: 'agent_query', label: 'Agent Queries', icon: Zap },
              ] as const).map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={filterType === f.id ? 'secondary' : 'ghost'}
                  color={filterType === f.id ? '$ink' : '$soft'}
                  aria-pressed={filterType === f.id}
                  onClick={() => setFilterType(f.id as any)}
                >
                  {'icon' in f ? <f.icon size={13} aria-hidden /> : null}
                  {f.label}
                </Button>
              ))}
            </XStack>

            <Text fontSize="$1" color="$faint">
              Showing {filteredEvents.length} scheduled events &amp; routines
            </Text>
          </XStack>

          {/* Schedule List */}
          <YStack flex={1} overflowY="auto" px={24} py={20} gap={10}>
            {filteredEvents.map((evt) => {
              const isMeeting = evt.type === 'meeting'
              const isAutomation = evt.type === 'bot_automation'

              return (
                <XStack
                  key={evt.id}
                  bg="$panel"
                  borderWidth={1}
                  borderColor="$borderColor"
                  rounded={10}
                  px={20}
                  py={16}
                  items="center"
                  justify="space-between"
                  flexWrap="wrap"
                  gap={16}
                >
                  {/* Left Icon & Time */}
                  <XStack items="center" gap={16} minW={180} shrink={1}>
                    <XStack
                      width={40}
                      height={40}
                      rounded={8}
                      bg="$raised"
                      items="center"
                      justify="center"
                    >
                      {isMeeting ? <Video size={20} color="var(--foreground)" /> : isAutomation ? <Bot size={20} color="var(--foreground)" /> : <Zap size={20} color="var(--foreground)" />}
                    </XStack>

                    <YStack shrink={1} minW="auto">
                      <Text fontSize="$3" fontWeight="700" color="$ink">
                        {evt.time}
                      </Text>
                      <Text fontSize="$1" color="$faint">
                        {evt.date} · {evt.duration}
                      </Text>
                    </YStack>
                  </XStack>

                  {/* Middle: Title & Details */}
                  {/* Never narrower than a line of its description: on a phone it takes a row of its own. */}
                  <View flex={1} minW={240} display="block">
                    <XStack items="center" gap={8} mb={2}>
                      <Text fontSize="$3" fontWeight="600" color="$ink">{evt.title}</Text>
                      <Text
                        fontSize={FLOOR}
                        fontWeight="700"
                        bg="$hover"
                        color="$soft"
                        px={6}
                        py={1}
                        rounded={4}
                        textTransform="uppercase"
                      >
                        {evt.type.replace('_', ' ')}
                      </Text>
                    </XStack>

                    <Text display="block" fontSize="$2" color="$soft" mb={4}>
                      {evt.description}
                    </Text>

                    <XStack items="center" gap={12}>
                      {evt.botName ? <Text fontSize="$1" color="$faint">Bot: <Text render="strong" fontSize="$1" color="$quiet">{evt.botName}</Text></Text> : null}
                      {evt.cronPattern ? <Text fontSize="$1" color="$faint">Cron: <Text render="code" color="$ink">{evt.cronPattern}</Text></Text> : null}
                      {evt.meetUrl ? <Text fontSize="$1" color="$faint">Link: <Text render="code" color="$ink">{evt.meetUrl}</Text></Text> : null}
                    </XStack>
                  </View>

                  {/* Right Actions */}
                  <XStack items="center" gap={8} shrink={1} minW="auto">
                    {isMeeting ? (
                      <Button asChild variant="primary" size="sm">
                        <a href="/meet">
                          <Video size={13} />
                          Join /meet
                        </a>
                      </Button>
                    ) : (
                      <Button asChild variant="primary" size="sm">
                        <a href="/bots">
                          <Bot size={13} />
                          View /bots
                        </a>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      color="$soft"
                      onClick={() => handleDeleteEvent(evt.id)}
                      aria-label="Remove schedule"
                      title="Remove schedule"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </XStack>
                </XStack>
              )
            })}
          </YStack>
        </YStack>
      )}

      {/* New Event / Routine Modal */}
      {showModal ? (
        <XStack
          position="fixed"
          inset={0}
          bg="var(--surface-scrim)"
          backdropFilter="blur(8px)"
          items="center"
          justify="center"
          z={MODAL}
        >
          <YStack
            width="100%"
            maxW={460}
            bg="var(--popover)"
            borderWidth={1}
            borderColor="var(--border-control)"
            rounded={12}
            p={24}
            gap={16}
            boxShadow="var(--shadow-floating)"
          >
            <XStack items="center" justify="space-between">
              <Text fontSize="$4" fontWeight="700" color="$ink">
                Schedule Event or Bot Routine
              </Text>
              <Button type="button" variant="ghost" size="icon-sm" mr={-8} onClick={() => setShowModal(false)} aria-label="Close">
                <X size={16} aria-hidden />
              </Button>
            </XStack>

            <YStack render="form" {...{ onSubmit: handleCreateEvent }} gap={12}>
              <View display="block">
                <Text {...LABEL}>
                  Title
                </Text>
                <Text
                  render={
                    <input
                      type="text"
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      placeholder="e.g. Daily Security Audit / Team Sync"
                      required
                    />
                  }
                  {...FIELD}
                  px={12}
                />
              </View>

              <View display="block">
                <Text {...LABEL}>
                  Schedule Type
                </Text>
                <Text
                  render={<select value={newEvent.type} onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value as any })} />}
                  {...FIELD}
                  px={12}
                >
                  <option value="bot_automation">Automated Bot Cron Routine</option>
                  <option value="meeting">Human Video Meeting (/meet)</option>
                  <option value="agent_query">Recurring Agent Query</option>
                </Text>
              </View>

              <View display="grid" gridTemplateColumns="1fr 1fr" gap={10}>
                <View display="block">
                  <Text {...LABEL}>
                    Date
                  </Text>
                  <Text
                    render={<input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} />}
                    {...FIELD}
                    px={8}
                  />
                </View>
                <View display="block">
                  <Text {...LABEL}>
                    Time
                  </Text>
                  <Text
                    render={<input type="time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} />}
                    {...FIELD}
                    px={8}
                  />
                </View>
              </View>

              <View display="block">
                <Text {...LABEL}>
                  Assigned Bot
                </Text>
                <Text
                  render={<select value={newEvent.botName} onChange={(e) => setNewEvent({ ...newEvent, botName: e.target.value })} />}
                  {...FIELD}
                  px={12}
                >
                  <option value="Chief">Chief</option>
                  <option value="Sales Outbound">Sales Outbound</option>
                  <option value="Inbox Manager">Inbox Manager</option>
                  <option value="Account Manager">Account Manager</option>
                  <option value="Talent Scout">Talent Scout</option>
                  <option value="Expense Manager">Expense Manager</option>
                  <option value="Offsite crew">Offsite crew</option>
                </Text>
              </View>

              <View display="block">
                <Text {...LABEL}>
                  Description / Instruction
                </Text>
                <Text
                  render={
                    <textarea
                      value={newEvent.description}
                      onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                      placeholder="Details or cron automation prompt..."
                      rows={3}
                    />
                  }
                  {...FIELD}
                  px={12}
                  // design's base sheet makes every textarea resizable; gui types no `resize`.
                  $platform-web={{ resize: 'none' }}
                />
              </View>

              <XStack justify="flex-end" gap={8} mt={8}>
                <Button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save Schedule
                </Button>
              </XStack>
            </YStack>
          </YStack>
        </XStack>
      ) : null}
    </YStack>
  )
}
