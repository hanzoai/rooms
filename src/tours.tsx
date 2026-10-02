'use client'

// The tours, one per room, and the finders they point with.
//
// A stop RESOLVES A LIVE ELEMENT by what it already carries — its label, its
// role, its text — never a marker sprinkled for the tour. A stop whose anchor is
// absent is skipped, so each tour describes the room as it is that day.

/** One stop: what to point at, and what to say about it. */
export interface Stop {
  id: string
  title: string
  body: string
  /** Where the card sits relative to the anchor; it flips if it would leave the viewport. */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Resolve the live element. Returning null skips the stop. */
  find: () => Element | null
  /** Played rather than read: the scene, drawn on a stage instead of a card. */
  scene?: boolean
}

export type Tour = 'chat' | 'meet' | 'calendar' | 'contacts' | 'inbox' | 'drive' | 'board'

export const seen = (el: Element | null): Element | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 6 || r.height < 6) return null
  const s = getComputedStyle(el)
  if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return null
  return el
}

export const byLabel = (...labels: string[]): Element | null => {
  for (const l of labels) {
    const el = seen(document.querySelector(`[aria-label="${l}"]`))
    if (el) return el
  }
  return null
}

const byAttr = (attr: string, ...values: string[]): Element | null => {
  for (const v of values) {
    const el = seen(document.querySelector(`[${attr}="${v}"]`))
    if (el) return el
  }
  return null
}
export const byPlaceholder = (...values: string[]) => byAttr('placeholder', ...values)
export const byTitle = (...values: string[]) => byAttr('title', ...values)

/** The smallest element whose own text is exactly this word. */
export const byText = (text: string, within?: Element | null): Element | null => {
  const root = within ?? document.body
  let best: Element | null = null
  for (const el of root.querySelectorAll<HTMLElement>('button,a,[role="button"]')) {
    if ((el.textContent || '').trim() !== text) continue
    const ok = seen(el)
    if (!ok) continue
    if (!best || el.getBoundingClientRect().width < best.getBoundingClientRect().width) best = el
  }
  return best
}

/** A field whose placeholder starts with these words. */
const byPlaceholderStart = (start: string): Element | null => {
  for (const el of document.querySelectorAll<HTMLElement>('input,textarea')) {
    if ((el.getAttribute('placeholder') || '').startsWith(start) && seen(el)) return el
  }
  return null
}

/** The composer is the one visible textarea in the room. */
export const composer = (): Element | null => {
  const all = [...document.querySelectorAll('textarea')].map(seen).filter(Boolean) as Element[]
  return all.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] ?? null
}

/** The Enso control on the composer: effort, and the model override inside it. */
export const modelChip = (): Element | null =>
  seen(document.querySelector('[aria-label^="Enso"]'))

/** A place on the rail, by the word under its icon. */
const rail = (label: string): Element | null => {
  const b = byText(label)
  return b?.parentElement ?? b
}

const CHAT: Stop[] = [
  {
    id: 'composer',
    title: 'What are you interested in? How can Hanzo help you?',
    body: 'Type what you want in plain words. Paste an error, describe a feature, or drop in a file.',
    side: 'top',
    find: composer,
  },
  {
    id: 'model',
    title: 'Perfectly tuned with 500+ of the leading models',
    body: 'Enso reads your question and picks the best model for it. Tap here to choose one yourself.',
    side: 'top',
    find: modelChip,
  },
  {
    id: 'work',
    title: 'Audit the work-flow',
    body: "Show work opens the AI's steps and the tools it used. Turn it on when an answer surprises you.",
    side: 'top',
    find: () => byText('Show work') || byText('Hide work'),
  },
  {
    id: 'scene',
    title: 'More than chat',
    body: 'Chat with a bot, bring in the team, and take it to a call. Watch one happen.',
    side: 'right',
    scene: true,
    find: () => rail('Chat'),
  },
  {
    id: 'roster',
    title: 'People and agents, one list',
    body: 'Your team and your AI agents sit together. Click any of them to start talking. An agent answers like a person.',
    side: 'right',
    find: () => {
      const az = byLabel('A-Z', 'Sort A-Z')
      if (az?.parentElement) return az.parentElement
      const dir = byText('Directory')
      return dir?.parentElement ?? dir
    },
  },
  {
    id: 'find',
    title: 'Find anything',
    body: 'Press ⌘K to search chats, people, agents and every section at once.',
    side: 'bottom',
    find: () => {
      for (const b of document.querySelectorAll<HTMLElement>('button,[role="button"]')) {
        if (/^Search\b/.test((b.textContent || '').trim()) && seen(b)) return b
      }
      return null
    },
  },
  {
    id: 'aside',
    title: 'Results stay beside you',
    body: 'Files, sources and previews collect in the side panel, so the chat stays easy to read.',
    side: 'bottom',
    find: () => byLabel('Open side panel', 'Close side panel'),
  },
  {
    id: 'orgs',
    title: 'Switch workspaces',
    body: 'Each icon on the far left is a workspace, with its own chats, agents, files and billing.',
    side: 'right',
    find: () => {
      // The rail is a column of small square marks pinned to the far edge —
      // that shape is what identifies it, not a label, because each mark is
      // labelled with its own workspace ("LUX", "ZOO", an initial) and none of
      // them names the rail. Take their common parent.
      const marks = [...document.querySelectorAll<HTMLElement>('button,[role="button"]')].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.left < 64 && r.width >= 26 && r.width <= 60 && Math.abs(r.width - r.height) < 10 && seen(el)
      })
      if (marks.length < 2) return byLabel('Switch organization')
      let node: HTMLElement | null = marks[0].parentElement
      while (node && !marks.every((m) => node!.contains(m))) node = node.parentElement
      return seen(node) ?? marks[0]
    },
  },
  {
    id: 'account',
    title: 'Your plan',
    body: 'See your credit, manage payment and change settings. Free uses the open models. Paid unlocks the rest.',
    side: 'top',
    find: () => byLabel('Account, plan and workspace'),
  },
]

const MEET: Stop[] = [
  {
    id: 'start',
    title: 'Start a meeting',
    body: 'One click opens a room. Share the link and anyone can join from a browser.',
    side: 'bottom',
    find: () => byText('Start Instant Meeting'),
  },
  {
    id: 'join',
    title: 'Join with a code',
    body: 'Paste a meeting code or link here to join a call someone else started.',
    side: 'bottom',
    find: () => byPlaceholder('Enter meeting code or link'),
  },
  {
    id: 'transcript',
    title: 'Every call is written down',
    body: 'A Hanzo bot sits in and transcribes. What everyone said is saved with the meeting.',
    side: 'left',
    find: () => {
      for (const el of document.querySelectorAll<HTMLElement>('div,p,section')) {
        if (el.childElementCount === 0 && /transcription/i.test(el.textContent || '') && seen(el)) return el.parentElement ?? el
      }
      return null
    },
  },
]

const CALENDAR: Stop[] = [
  {
    id: 'schedule',
    title: 'Add an event or a routine',
    body: 'A meeting, a reminder, or a job an agent runs on a schedule. Name it and pick the time.',
    side: 'bottom',
    find: () => byText('Schedule Event / Routine'),
  },
  {
    id: 'crons',
    title: 'Bots on a timer',
    body: 'Bot Crons lists what your bots run and when. Change a time here and the bot follows it.',
    side: 'bottom',
    find: () => byText('Bot Crons'),
  },
  {
    id: 'booker',
    title: 'Let people book you',
    body: 'A public page where anyone can pick a free time on your calendar.',
    side: 'bottom',
    find: () => byText('Public Booker'),
  },
]

const CONTACTS: Stop[] = [
  {
    id: 'search',
    title: 'Everyone in one place',
    body: 'People and agents, side by side. Search by name to find anyone fast.',
    side: 'bottom',
    find: () => byLabel('Search contacts') || byPlaceholder('Search'),
  },
  {
    id: 'invite',
    title: 'Invite your team',
    body: 'Send an invite by email, or share a link anyone can use to join your organization.',
    side: 'bottom',
    find: () => byLabel('Invite') || byText('Invite'),
  },
  {
    id: 'agent',
    title: 'Make an agent',
    body: 'Give it a name and a job. It joins the roster next to your people and answers like one.',
    side: 'bottom',
    find: () => byText('New agent'),
  },
]

const INBOX: Stop[] = [
  {
    id: 'connect',
    title: 'Every channel, one inbox',
    body: 'Connect Slack, email, Discord and the rest. Their messages land here together.',
    side: 'bottom',
    find: () => byText('Connect an app'),
  },
  {
    id: 'channels',
    title: 'Your channels',
    body: 'Each connected app is a channel on the left. Nothing gets lost between them.',
    side: 'right',
    find: () => byLabel('Resize inbox channel list')?.parentElement ?? null,
  },
  {
    id: 'reply',
    title: 'Reply where it came from',
    body: 'Answer here and it goes back on the same channel the message arrived on.',
    side: 'top',
    find: () => byPlaceholderStart('Reply on'),
  },
]

const DRIVE: Stop[] = [
  {
    id: 'search',
    title: 'Search everything',
    body: 'Every file your team and your agents made, found by name or by what is inside it.',
    side: 'bottom',
    find: () => byLabel('Search Drive'),
  },
  {
    id: 'upload',
    title: 'Bring files in',
    body: 'Upload anything. Agents can read it, and it shows up in chat when you ask.',
    side: 'bottom',
    find: () => byTitle('Upload'),
  },
  {
    id: 'folder',
    title: 'Keep it tidy',
    body: 'Make folders for projects, clients or agents. Drag files between them.',
    side: 'bottom',
    find: () => byTitle('Add Folder'),
  },
]

const BOARD: Stop[] = [
  {
    id: 'add',
    title: 'Add a card',
    body: 'One card per task. Give it a date, a priority, and a person or an agent to do it.',
    side: 'bottom',
    find: () => byText('Add a card') || byPlaceholder('Add an item'),
  },
  {
    id: 'planner',
    title: 'Plan by day',
    body: 'Planner lays the cards out by date, so today is one column and next week is a glance away.',
    side: 'bottom',
    find: () => byText('Planner'),
  },
  {
    id: 'filter',
    title: 'See only what matters now',
    body: 'Filter by who, by when, or by what is finished.',
    side: 'bottom',
    find: () => byText('Filter'),
  },
]

export const TOURS: Record<Tour, Stop[]> = {
  chat: CHAT,
  meet: MEET,
  calendar: CALENDAR,
  contacts: CONTACTS,
  inbox: INBOX,
  drive: DRIVE,
  board: BOARD,
}
