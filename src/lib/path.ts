/**
 * Where a model's page lives. No imports, so a build script can ask too.
 */

export function getOrgAndSlug(modelId: string): { org: string; slug: string } {
  if (modelId.includes('/')) {
    const [org, ...rest] = modelId.split('/')
    return { org, slug: rest.join('/') }
  }
  return { org: 'hanzo', slug: modelId }
}

// Some labs reach the gateway under two namespaces — `meta-llama` and `meta`,
// `bytedance-seed` and `bytedance` — and a leading `~` marks a latest-alias
// namespace of a lab already present. Fold them onto one canonical org so the
// catalogue heads one group per lab and that lab's page serves the union.
// Mirrors ProviderMark's OF map, which folds the same aliases for the mark.
const ORG_ALIASES: Record<string, string> = {
  'meta-llama': 'meta',
  'bytedance-seed': 'bytedance',
}

export function canonicalOrg(org?: string): string {
  if (!org) return 'hanzo'
  const base = org.replace(/^~/, '')
  return ORG_ALIASES[base] ?? base
}

export function modelPagePath(modelId: string): string {
  const { org, slug } = getOrgAndSlug(modelId)
  return `/models/${canonicalOrg(org)}/${slug}`
}
