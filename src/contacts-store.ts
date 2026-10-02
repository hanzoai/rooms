'use client'

import { scope } from './lib/session'

/**
 * Unified contacts & social directory store for People, Custom Agents, and Pretrained Agents.
 *
 * WhatsApp-style Contacts architecture:
 * - People (friends, teammates, colleagues)
 * - Custom Agents (user-created AI personas)
 * - Pretrained Agents (specialized ready-to-use Hanzo agents)
 * - Conversation Threads (Group chats, Group calls, Direct messages)
 *
 * Critical requirement:
 * Group chats and calls are created as conversation threads stored in the CHAT system,
 * NOT inside the contacts roster.
 */

export interface ContactPerson {
  id: string
  name: string
  email: string
  role?: string
  status?: string
  avatar?: string
  online?: boolean
  lastSeen?: string
}

export interface ContactAgent {
  id: string
  name: string
  model: string
  role: string
  description: string
  emoji?: string
  avatar?: string
  isPretrained?: boolean
  installed?: boolean
  capabilities?: string[]
}

export interface CustomThread {
  id: string
  title: string
  type: 'direct' | 'group' | 'call'
  participants: {
    id: string
    name: string
    isAgent?: boolean
    avatar?: string
  }[]
  updatedAt: number
  lastMessage?: string
  callActive?: boolean
}

// Pretrained Agents catalog
export const PRETRAINED_AGENTS: ContactAgent[] = [
  {
    id: 'pretrained-coder',
    name: 'Hanzo Coder',
    model: 'enso',
    role: 'Full-Stack Software Engineer',
    description: 'Autonomous code generation, debugging, refactoring, PR reviews, and Git operations.',
    avatar: '/agents/dev.png',
    emoji: '💻',
    isPretrained: true,
    installed: true,
    capabilities: ['TypeScript & Next.js', 'Go & Rust', 'Bug Fixing & Testing', 'Architecture Review'],
  },
  {
    id: 'pretrained-researcher',
    name: 'Hanzo Researcher',
    model: 'claude-3-5-sonnet',
    role: 'Deep Intelligence & Research Specialist',
    description: 'Deep web search, arXiv paper extraction, competitive intelligence, and synthesis.',
    emoji: '🔬',
    isPretrained: true,
    installed: true,
    capabilities: ['Academic Paper Extraction', 'Market Research', 'Data Synthesis', 'Web Fact-Checking'],
  },
  {
    id: 'pretrained-designer',
    name: 'Hanzo Designer',
    model: 'gpt-4o',
    role: 'UI/UX & Design Systems Architect',
    description: 'Modern component design, responsive Tailwind/CSS layouts, Figma token synchronization.',
    avatar: '/agents/des.png',
    emoji: '🎨',
    isPretrained: true,
    installed: true,
    capabilities: ['Figma to React', 'Design Systems', 'Micro-Interactions', 'Dark Mode Theming'],
  },
  {
    id: 'pretrained-quant',
    name: 'Hanzo Quant',
    model: 'deepseek-r1',
    role: 'Quantitative Finance & Market Analyst',
    description: 'Market data analysis, predictive financial modeling, risk calculations, and algorithmic strategies.',
    avatar: '/agents/zach.jpg',
    emoji: '📈',
    isPretrained: true,
    installed: false,
    capabilities: ['Financial Modeling', 'Risk Assessment', 'Statistical Arbitrage', 'Portfolio Analysis'],
  },
  {
    id: 'pretrained-copywriter',
    name: 'Hanzo Copywriter',
    model: 'llama-3.3',
    role: 'Technical Writer & Content Strategist',
    description: 'High-impact technical documentation, release notes, developer blogs, and launch copy.',
    avatar: '/agents/creative.png',
    emoji: '✍️',
    isPretrained: true,
    installed: false,
    capabilities: ['API Documentation', 'Launch Announcements', 'SEO Optimization', 'Whitepapers'],
  },
  {
    id: 'pretrained-devops',
    name: 'Hanzo DevOps',
    model: 'enso',
    role: 'Cloud Infrastructure & SRE Specialist',
    description: 'Kubernetes orchestration, Docker build pipelines, CI/CD automation, and incident mitigation.',
    avatar: '/agents/vi.png',
    emoji: '⚙️',
    isPretrained: true,
    installed: false,
    capabilities: ['Kubernetes & Helm', 'GitHub Actions', 'GCP & AWS Cloud', 'Docker Containerization'],
  },
  {
    id: 'pretrained-legal',
    name: 'Hanzo Legal & Compliance',
    model: 'enso',
    role: 'Commercial Legal & IP Counsel',
    description: 'Commercial contract review, NDAs, SaaS service agreements, GDPR compliance, and IP protection.',
    avatar: '/agents/einstein.png',
    emoji: '🛡️',
    isPretrained: true,
    installed: false,
    capabilities: ['Contract Review', 'SaaS Master Agreements', 'Privacy & GDPR', 'IP Licensing'],
  },
  {
    id: 'pretrained-assistant',
    name: 'Hanzo Executive Assistant',
    model: 'gpt-4o',
    role: 'Operations & Executive Coordinator',
    description: 'Daily briefing generation, task prioritization, agenda prep, and team communication sync.',
    avatar: '/agents/maya.png',
    emoji: '👔',
    isPretrained: true,
    installed: false,
    capabilities: ['Meeting Agendas', 'Executive Briefings', 'Email Drafts', 'Task Prioritization'],
  },
]

// The roster is the org's own members, read from IAM. Nothing is invented for
// an org that has none yet: an empty roster reads empty.
export const DEFAULT_PEOPLE: ContactPerson[] = []

const PEOPLE_STORAGE_KEY = 'hanzo_contacts_people_v1'
const AGENTS_STORAGE_KEY = 'hanzo_contacts_agents_v1'
const THREADS_STORAGE_KEY = 'hanzo_custom_threads_v1'

/** Read stored people, falling back to defaults */
export function getStoredPeople(): ContactPerson[] {
  if (typeof window === 'undefined') return DEFAULT_PEOPLE
  try {
    const raw = localStorage.getItem(PEOPLE_STORAGE_KEY)
    if (!raw) return DEFAULT_PEOPLE
    return JSON.parse(raw)
  } catch {
    return DEFAULT_PEOPLE
  }
}

/** Save updated people to storage */
export function saveStoredPeople(people: ContactPerson[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people))
    window.dispatchEvent(new Event('hanzo_contacts_changed'))
  } catch (err) {
    console.warn('Failed to save contacts:', err)
  }
}

/**
 * Read the agents this browser stored. NOTHING IS SEEDED: this used to write
 * three invented agents into every new browser and the roster drew them as the
 * org's own, so an org with no agents looked staffed. The org's agents come
 * from /v1/agents; this is only what a reader added here.
 */
export function getStoredAgents(): ContactAgent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(AGENTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Save updated custom agents to storage */
export function saveStoredAgents(agents: ContactAgent[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents))
    window.dispatchEvent(new Event('hanzo_agents_changed'))
  } catch (err) {
    console.warn('Failed to save agents:', err)
  }
}

/** Read stored custom conversation threads (Group chats, Group calls, etc.) */
export function getCustomThreads(): CustomThread[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(THREADS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/** Save updated conversation threads */
export function saveCustomThreads(threads: CustomThread[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads))
    window.dispatchEvent(new Event('hanzo_threads_changed'))
  } catch (err) {
    console.warn('Failed to save threads:', err)
  }
}

/**
 * Creates a new Group Chat thread and stores it in the CHAT system.
 * Returns the created thread ID.
 */
export function createGroupChat(params: {
  title: string
  participants: { id: string; name: string; isAgent?: boolean; avatar?: string }[]
}): string {
  const threadId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const newThread: CustomThread = {
    id: threadId,
    title: params.title || `Group (${params.participants.length})`,
    type: 'group',
    participants: params.participants,
    updatedAt: Date.now(),
    lastMessage: `Group created with ${params.participants.map((p) => p.name).join(', ')}`,
  }

  const existing = getCustomThreads()
  saveCustomThreads([newThread, ...existing])
  return threadId
}

/**
 * Creates a new Group Call thread and stores it in the CHAT system.
 * Returns the created thread ID.
 */
export function createGroupCall(params: {
  title: string
  participants: { id: string; name: string; isAgent?: boolean; avatar?: string }[]
}): string {
  const threadId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const newThread: CustomThread = {
    id: threadId,
    title: params.title ? `Group Call: ${params.title}` : `Group Call (${params.participants.length})`,
    type: 'call',
    participants: params.participants,
    updatedAt: Date.now(),
    lastMessage: `Started group call with ${params.participants.map((p) => p.name).join(', ')}`,
    callActive: true,
  }

  const existing = getCustomThreads()
  saveCustomThreads([newThread, ...existing])
  return threadId
}

/**
 * Creates or opens a 1-on-1 direct chat thread.
 * Returns the thread ID.
 */
export function createDirectChat(target: {
  id: string
  name: string
  isAgent?: boolean
  avatar?: string
}): string {
  const existing = getCustomThreads()
  const found = existing.find(
    (t) => t.type === 'direct' && t.participants.some((p) => p.id === target.id),
  )
  if (found) return found.id

  const threadId = `direct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const newThread: CustomThread = {
    id: threadId,
    title: target.name,
    type: 'direct',
    participants: [target],
    updatedAt: Date.now(),
    lastMessage: `Conversation opened with ${target.name}`,
  }

  saveCustomThreads([newThread, ...existing])
  return threadId
}

/**
 * The org's members, from IAM. `/v1/iam/account` names the caller's org and
 * `/v1/iam/users?owner=<org>` lists who is in it; both answer for any member.
 * What comes back replaces the stored roster, so the store is a cache of the
 * platform and never a fixture.
 */
export async function fetchOrgPeople(baseUrl: string, token: string): Promise<ContactPerson[]> {
  const headers = { ...scope(), Authorization: `Bearer ${token}` }
  const me = (await (await fetch(`${baseUrl}/v1/iam/account`, { headers })).json()) as { owner?: string }
  const org = me?.owner
  if (!org) return getStoredPeople()
  const res = await fetch(`${baseUrl}/v1/iam/users?owner=${encodeURIComponent(org)}`, { headers })
  if (!res.ok) return getStoredPeople()
  const body = (await res.json()) as unknown
  const rows = (Array.isArray(body) ? body : (body as { data?: unknown[] })?.data) ?? []
  const people: ContactPerson[] = (rows as Record<string, unknown>[])
    .filter((u) => typeof u.name === 'string')
    .map((u) => ({
      id: `${u.owner}/${u.name}`,
      name: (u.displayName as string) || (u.name as string),
      email: (u.email as string) || '',
      role: u.isAdmin ? 'Admin' : undefined,
      avatar: (u.avatar as string) || undefined,
      online: Boolean(u.isOnline),
    }))
  if (people.length) saveStoredPeople(people)
  return people
}
