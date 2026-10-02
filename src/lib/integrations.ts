/**
 * An SDK, framework or platform the host publishes a guide for. The catalogue
 * is the host's content (hanzo.ai's /integrations) and arrives through
 * `configure({ integrations })`; Directory lists it as the apps a team connects.
 */
export interface Integration {
  slug: string
  name: string
  description: string
  category: 'sdk' | 'framework' | 'platform' | 'infra' | 'language'
  icon: string
  examples: { lang: string; label: string; code: string }[]
  upstream: string
  creator: string
  creatorUrl: string
  license: string
}
