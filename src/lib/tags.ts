/**
 * The funnel's one call. `track` is @hanzo/event's: a moment reaches our stream
 * (POST /v1/event, the one ingest) and every browser tag the visitor's consent
 * and region allow, under one event_id. The tags come from the site's tag
 * config (GET /v1/project/tags, which also says which consent rule binds this
 * visitor); no platform id lives in this repo. Our stream stays the record every
 * Hanzo dashboard reads, and cloud forwards its copy server-side.
 *
 * `startTags` runs once, from app/providers.tsx. `attach` hands `track` the
 * page's one client, from inside its provider.
 */

import { mirror, startTags, tagsReady, track as fire, visit, type Analytics } from '@hanzo/event'

export { mirror, startTags, tagsReady, visit }

/** The sites one visit can cross; GA4 keeps it one session across them. */
export const DOMAINS = [
  'hanzo.ai',
  'hanzo.app',
  'hanzo.chat',
  'pay.hanzo.ai',
  'hanzo.id',
  'hanzo.build',
  'docs.hanzo.ai',
  'platform.hanzo.ai',
  'cal.hanzo.ai',
]

let stream: Analytics | undefined

/** Hands track() the one @hanzo/event client, from inside its provider. */
export function attach(client: Analytics): void {
  stream = client
}

/**
 * `url` with the visitor's identity on it when it leads to another Hanzo host
 * (hanzo.id, hanzo.app), so the journey across the hop is one visitor
 * (@hanzo/event link). Any other address comes back as it was.
 */
export function link(url: string): string {
  return stream ? stream.link(url) : url
}

/** `link` for the redirect to IAM: the same, and the queue is sent before the page leaves. */
export function authorize(url: string): string {
  return stream ? stream.authorize(url) : url
}

/** One funnel moment, to every place it is counted, under one event_id. */
export function track(name: string, params: Record<string, unknown> = {}): void {
  fire(stream, name, params)
}
