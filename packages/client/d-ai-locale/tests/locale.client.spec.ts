// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply as localeApply, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { LOCALE_SETTINGS_NAMESPACE, LocaleSettingsSchema } from '../../locale/src/locale-settings.ts'
import { apply, inject } from '../src/client/index.ts'

// The shared Vitest config stubs CSS. Feed the shipped sheet into the DOM test.
vi.mock('../src/client/bidi.css?inline', async () => {
  const { readFile } = await import('node:fs/promises')
  return { default: await readFile('packages/client/d-ai-locale/src/client/bidi.css', 'utf8') }
})

const contexts: Context[] = []

async function bench(preference = 'en') {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  let stored = preference
  const namespace = () => ({
    ns: LOCALE_SETTINGS_NAMESPACE,
    schema: LocaleSettingsSchema.toJSON(), value: { preference: stored },
    autoGenerate: true, applies: 'live' as const, secrets: [], revision: 0,
  })
  new TestRemote(ctx, { settings: {
    describe: async () => ({ ok: true as const, value: { writable: true, hasDocument: true, namespaces: [namespace()] } }),
    mutate: async (_ns: string, ops: { value: string }[]) => {
      stored = ops[0]!.value
      return { ok: true as const, value: namespace() }
    },
  } })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  await ctx.plugin({ inject: [...localeInject], apply: localeApply }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, locale: ctx.locale, storedPreference: () => stored }
}

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  document.documentElement.removeAttribute('dir')
})

describe('D_AI native Arabic pack', () => {
  it('selects Arabic, translates common actions and synchronizes language and direction live', async () => {
    const { locale, storedPreference } = await bench()
    locale.setLocale('ar')
    await vi.waitFor(() => { expect(storedPreference()).toBe('ar') })
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(locale.bind('common')('cancel')).toBe('إلغاء')
    expect(locale.bind('settings.locale')('language.title')).toBe('اللغة')
    expect(locale.bind('common')('copy.optionsHint', { action: 'نسخ' })).toContain('نسخ؛')
    locale.setLocale('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(locale.bind('common')('cancel')).toBe('Cancel')
  })

  it('adopts a stored Arabic preference after its language definition arrives', async () => {
    const { locale } = await bench('ar')
    await vi.waitFor(() => { expect(locale.getSnapshot().active).toBe('ar') })
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('removes its language, translations, styles and subscription on unload', async () => {
    document.documentElement.dir = 'ltr'
    const { locale, fiber } = await bench()
    locale.setLocale('ar')
    expect(document.head.querySelector('style[data-plugin="@deepseek-ai/dsh-client-d-ai-locale"]')).not.toBeNull()
    await fiber.dispose()
    expect(locale.getSnapshot().locales.some(language => language.id === 'ar')).toBe(false)
    expect(document.head.querySelector('style[data-plugin="@deepseek-ai/dsh-client-d-ai-locale"]')).toBeNull()
    expect(document.documentElement.dir).toBe('ltr')
    document.documentElement.dir = 'auto'
    locale.setLocale('zh')
    expect(document.documentElement.dir).toBe('auto')
  })

  it('isolates code, URLs and math without rewriting the original content', async () => {
    const { locale } = await bench()
    locale.setLocale('ar')
    const code = document.createElement('code')
    code.textContent = 'result = 12 + 3'
    const url = document.createElement('span')
    url.dataset.dAiBidi = 'ltr'
    url.textContent = 'https://example.org/دليل?id=12'
    const math = document.createElement('math')
    math.textContent = 'x = 12'
    document.body.append(code, url, math)
    try {
      expect(getComputedStyle(code).direction).toBe('ltr')
      expect(getComputedStyle(code).unicodeBidi).toBe('isolate')
      expect(getComputedStyle(url).direction).toBe('ltr')
      expect(getComputedStyle(math).direction).toBe('ltr')
      expect(code.textContent).toBe('result = 12 + 3')
      expect(url.textContent).toBe('https://example.org/دليل?id=12')
    } finally {
      code.remove(); url.remove(); math.remove()
    }
  })
})
