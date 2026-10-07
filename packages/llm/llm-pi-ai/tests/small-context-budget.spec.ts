/** Regression for the pinned SDK reserving an entire small model context. */
import { clampMaxTokensToContext } from '@earendil-works/pi-ai/api/simple-options'
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript'
import { describe, expect, it } from 'vitest'

const base = getBuiltinModels('openai')[0]!
const empty = normalizeContext({ messages: [] })

describe('pi-ai small context headroom', () => {
  it.each([4096, 8192])('preserves a 512-token answer budget in a %i-token context', (contextWindow) => {
    expect(clampMaxTokensToContext({ ...base, contextWindow }, empty, 512)).toBe(512)
  })

  it('retains the original 4096-token reserve for larger contexts', () => {
    expect(clampMaxTokensToContext({ ...base, contextWindow: 32768 }, empty, 32768)).toBe(32768 - 4096)
  })

  it('still caps oversized output requests and handles a full context', () => {
    expect(clampMaxTokensToContext({ ...base, contextWindow: 4096 }, empty, 4096)).toBe(4096 - 512)
    const full = normalizeContext({ messages: [{ role: 'user', content: '文'.repeat(20000), timestamp: 0 }] })
    expect(clampMaxTokensToContext({ ...base, contextWindow: 4096 }, full, 512)).toBe(1)
  })
})
