import { describe, expect, it } from 'vitest'
import type { LimitNotice } from '@hanzo/ui/product/limits'
import { paused } from './limits'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const PAY = 'https://hanzo.ai/pay'
const UP = { kind: 'upgrade' as const, label: 'Upgrade to Max 20x', plan: 'max-20x', url: `${PAY}/cart?plan=max-20x` }
const CREDITS = { kind: 'credits' as const, label: 'Continue with credits', url: '/v1/ai/limits' }
const TOPUP = { kind: 'topup' as const, label: 'Add prepaid credit', url: PAY }

const notice = (o: Partial<LimitNotice>): LimitNotice => ({
  reason: 'plan_allowance_used',
  classes: ['premium'],
  message: 'Premium models are paused until Nov 1.',
  actions: [UP, CREDITS, TOPUP],
  resets_at: '2026-11-01T00:00:00Z',
  fallback: null,
  refused: false,
  ...o,
})

describe('paused', () => {
  it('names the plan by its family and rung, the reset, and the model chatting on', () => {
    const b = paused(notice({ fallback: 'enso' }), 'max-5x', () => 'Enso', NOW)
    expect(b.message).toBe('Your Max 5x plan’s included premium model usage is used until Nov 1. You’re chatting on Enso.')
    expect(b.message).not.toContain('max-5x')
  })

  it('offers continuing on credits where the org holds some, then the upgrade', () => {
    expect(paused(notice({}), 'max-5x', undefined, NOW).actions.map((a) => a.label)).toEqual(['Continue with credits', 'Upgrade to Max 20x'])
  })

  it('offers adding credits where there are none to continue on', () => {
    const b = paused(notice({ actions: [UP, TOPUP] }), 'dev', undefined, NOW)
    expect(b.message).toBe('Your Pro plan’s included premium model usage is used until Nov 1.')
    expect(b.actions.map((a) => [a.kind, a.label])).toEqual([
      ['topup', 'Add credits'],
      ['upgrade', 'Upgrade to Max 20x'],
    ])
  })

  it('says a spent request window by the plan, never with the raw instant or address the gateway wrote', () => {
    const b = paused(
      notice({
        reason: 'usage_cap_exceeded',
        classes: [],
        message: "You've used session requests on your plan. They reset at 2026-11-01T00:00:00Z. Upgrade for more at https://hanzo.ai/pay/cart?plan=max-20x",
        actions: [UP],
      }),
      'max-5x',
      undefined,
      NOW,
    )
    expect(b.message).toBe('Your Max 5x plan’s requests are used until Nov 1.')
  })

  it('keeps the server’s words for any other refusal', () => {
    expect(paused(notice({ reason: 'paid_plan_required', message: 'This model needs a paid plan.' }), 'free', undefined, NOW).message).toBe('This model needs a paid plan.')
  })
})
