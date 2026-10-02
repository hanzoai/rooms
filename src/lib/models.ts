/**
 * What a provider and a model are CALLED — the few naming rules the rooms draw
 * with. The catalogue itself (prices, contexts, the serving list) is the host's.
 */
import { getOrgAndSlug } from './path'

export { canonicalOrg, getOrgAndSlug, modelPagePath } from './path'

/** The two fields naming needs. */
export interface ModelData {
  id: string
  name?: string
}

// Map org slug → display name
export const ORG_DISPLAY_NAMES: Record<string, string> = {
  hanzo: 'Hanzo',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'meta-llama': 'Meta',
  'x-ai': 'xAI',
  mistralai: 'Mistral',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  nvidia: 'NVIDIA',
  'z-ai': 'Z.ai',
  'arcee-ai': 'Arcee AI',
  minimax: 'Minimax',
  allenai: 'Allen AI',
  nousresearch: 'Nous Research',
  liquid: 'Liquid AI',
  moonshotai: 'Moonshot AI',
  amazon: 'Amazon',
  perplexity: 'Perplexity',
  baidu: 'Baidu',
  cohere: 'Cohere',
  'bytedance-seed': 'ByteDance Seed',
  openrouter: 'OpenRouter',
  microsoft: 'Microsoft',
  inflection: 'Inflection',
  sao10k: 'Sao10K',
  'aion-labs': 'Aion Labs',
  thedrummer: 'TheDrummer',
  stepfun: 'StepFun',
  relace: 'Relace',
  morph: 'Morph',
  inception: 'Inception',
  neversleep: 'NeverSleep',
  upstage: 'Upstage',
  writer: 'Writer',
  xiaomi: 'Xiaomi',
  'nex-agi': 'Nex-AGI',
  essentialai: 'EssentialAI',
  'prime-intellect': 'Prime Intellect',
  deepcogito: 'DeepCogito',
  kwaipilot: 'KwaiPilot',
  'ibm-granite': 'IBM Granite',
  alibaba: 'Alibaba',
  opengvlab: 'OpenGVLab',
  meituan: 'Meituan',
  ai21: 'AI21',
  bytedance: 'ByteDance',
  switchpoint: 'Switchpoint',
  cognitivecomputations: 'Cognitive Computations',
  tencent: 'Tencent',
  tngtech: 'TNG Tech',
  eleutherai: 'EleutherAI',
  alfredpros: 'AlfredPros',
  raifle: 'Raifle',
  'anthracite-org': 'Anthracite',
  alpindale: 'Alpindale',
  mancer: 'Mancer',
  undi95: 'Undi95',
  gryphe: 'Gryphe',
  meta: 'Meta',
  inclusionai: 'inclusionAI',
  thinkingmachines: 'Thinking Machines',
  rekaai: 'Reka AI',
  sakana: 'Sakana AI',
  perceptron: 'Perceptron',
}

export function orgDisplayName(org?: string): string {
  if (!org) return 'Hanzo'
  return ORG_DISPLAY_NAMES[org] ?? org
}

/**
 * What a model is CALLED, as against the id it answers to.
 *
 * Two things the catalog does that a reader should not have to:
 *
 *   it names the house families by their slug — `name` is `"enso"`, the same
 *   string as `id` — so the card would read "enso" twice, once in prose type
 *   and once in mono. Title-case the slug and the card reads "Enso Flash" over
 *   `enso-flash`, which is a name over an address.
 *
 *   it prefixes third-party names with the lab — `"DeepSeek: DeepSeek V4 Pro"`,
 *   `"SpaceXAI: Grok 4.5"`. The lab is already the group the row sits in and
 *   the namespace on the id beside it, so the prefix is the third telling.
 *
 * It lived on /models as a private helper while the table, the tile and the lab
 * index all needed it, which is how the same model could read three ways on one
 * page.
 */
export function modelName(model: Pick<ModelData, 'id' | 'name'>): string {
  if (model.name && model.name !== model.id) {
    return model.name.replace(/^[A-Za-z0-9.\-() ]{1,18}:\s+/, '')
  }
  return getOrgAndSlug(model.id)
    .slug.split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}
